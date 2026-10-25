import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Config } from './config';
import type { DB } from './db';
import { AdminAuth } from './auth';
import { RateLimiter } from './ratelimit';
import { RealtimeHub } from './realtime';
import { ServiceError, VecheService, VoteError } from './service';

export interface AppContext {
  app: express.Express;
  service: VecheService;
  hub: RealtimeHub;
  close: () => void;
}

export function createApp(db: DB, config: Config): AppContext {
  const service = new VecheService(db, config.secret);
  const hub = new RealtimeHub(
    (id) => service.publicState(id),
    (id) => service.adminState(id),
  );
  const auth = new AdminAuth(config.adminPassword, config.secret, config.isProduction);

  // Все участники в одном зале часто выходят в интернет с одного IP,
  // поэтому лимит по IP щедрый, а по ключу устройства — строгий.
  const voteIpLimit = new RateLimiter(600, 60_000);
  const voteKeyLimit = new RateLimiter(20, 60_000);
  const stateIpLimit = new RateLimiter(3000, 60_000);
  const loginLimit = new RateLimiter(10, 15 * 60_000);
  const volunteerLimit = new RateLimiter(60, 10 * 60_000);
  const codeLimit = new RateLimiter(300, 15 * 60_000);
  const adminLimit = new RateLimiter(600, 60_000);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(express.json({ limit: '16kb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (config.isProduction) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const ip = (req: Request) => req.ip ?? 'unknown';
  const limited = (limiter: RateLimiter, key: (req: Request) => string) => (req: Request, res: Response, next: NextFunction) => {
    if (!limiter.take(key(req))) return res.status(429).json({ error: 'rate_limited', message: 'Слишком много запросов. Подождите немного.' });
    next();
  };

  // ---------- публичные маршруты ----------

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/config', (req, res) => {
    res.json({ publicBaseUrl: config.publicBaseUrl ?? `${req.protocol}://${req.get('host')}` });
  });

  app.get('/api/current', (_req, res) => res.json({ slug: service.currentSlug() }));

  app.get('/api/sessions/:slug/state', limited(stateIpLimit, ip), (req, res) => {
    res.json(service.publicStateBySlug(req.params.slug));
  });

  app.get('/api/sessions/:slug/stream', limited(stateIpLimit, ip), (req, res) => {
    const id = service.sessionIdBySlug(req.params.slug);
    if (!id) return res.status(404).json({ error: 'session_not_found', message: 'Сессия не найдена' });
    hub.subscribe('public', id, res);
  });

  app.post('/api/sessions/:slug/vote', limited(voteIpLimit, ip), (req, res) => {
    const { roundId, optionId, voterKey, code } = req.body ?? {};
    const key = typeof code === 'string' ? 'c:' + code : typeof voterKey === 'string' ? 'k:' + voterKey : 'ip:' + ip(req);
    if (!voteKeyLimit.take(key)) return res.status(429).json({ status: 'error', code: 'rate_limited', message: 'Слишком много попыток. Подождите минуту.' });
    try {
      const result = service.castVote(req.params.slug, { roundId, optionId, voterKey, code });
      const id = service.sessionIdBySlug(req.params.slug);
      if (id && !result.duplicate) hub.notify(id);
      res.json({ status: 'accepted', roundId: result.roundId, duplicate: result.duplicate });
    } catch (e) {
      if (e instanceof VoteError) return res.status(e.httpStatus).json({ status: 'error', code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/sessions/:slug/voted', limited(voteIpLimit, ip), (req, res) => {
    const { voterKey, code } = req.body ?? {};
    try {
      res.json({ votedRoundIds: service.votedRounds(req.params.slug, voterKey, code) });
    } catch (e) {
      if (e instanceof VoteError) return res.status(e.httpStatus).json({ status: 'error', code: e.code, message: e.message });
      throw e;
    }
  });

  // Подбор кодов: ограничение по IP (зал за одним NAT укладывается с запасом).
  app.post('/api/sessions/:slug/check-code', limited(codeLimit, ip), (req, res) => {
    res.json({ valid: service.checkCode(req.params.slug, req.body?.code) });
  });

  app.post('/api/sessions/:slug/volunteer', limited(volunteerLimit, ip), (req, res) => {
    service.addVolunteer(req.params.slug, req.body?.idea, req.body?.contact);
    const id = service.sessionIdBySlug(req.params.slug);
    if (id) hub.notify(id);
    res.json({ ok: true });
  });

  // ---------- организатор ----------

  app.post('/api/admin/login', limited(loginLimit, (req) => 'login:' + ip(req)), (req, res) => {
    if (!auth.checkPassword(req.body?.password)) {
      service.audit('login_failed', null, null, undefined, service.hashIp(req.ip));
      return res.status(401).json({ error: 'invalid_password', message: 'Неверный пароль' });
    }
    auth.issue(req, res);
    service.audit('login', null, null, undefined, service.hashIp(req.ip));
    res.json({ ok: true });
  });

  app.post('/api/admin/logout', (_req, res) => {
    auth.clear(res);
    res.json({ ok: true });
  });

  app.get('/api/admin/me', (req, res) => res.json({ admin: auth.isAdmin(req) }));

  const admin = express.Router();
  admin.use(auth.middleware, limited(adminLimit, ip));

  const act = (req: Request, action: string, sessionId: string | null, roundId: string | null = null, details?: unknown) => {
    service.audit(action, sessionId, roundId, details, service.hashIp(req.ip));
    if (sessionId) hub.notify(sessionId);
  };

  admin.get('/sessions', (_req, res) => res.json({ sessions: service.listSessions(), currentSlug: service.currentSlug() }));

  admin.post('/sessions', (req, res) => {
    const id = service.createSession(req.body ?? {});
    act(req, 'session_created', id, null, { isDemo: req.body?.isDemo === true, accessMode: req.body?.accessMode ?? 'open' });
    // Архивированные сессии тоже должны узнать о смене статуса.
    for (const s of service.listSessions()) if (s.id !== id) hub.notify(s.id);
    res.json({ id });
  });

  admin.get('/sessions/:id', (req, res) => res.json(service.adminState(req.params.id)));

  admin.get('/sessions/:id/stream', (req, res) => {
    service.adminState(req.params.id); // 404, если сессии нет
    hub.subscribe('admin', req.params.id, res);
  });

  admin.patch('/sessions/:id', (req, res) => {
    service.updateSession(req.params.id, req.body ?? {});
    act(req, 'session_updated', req.params.id, null, { expectedParticipants: req.body?.expectedParticipants });
    res.json(service.adminState(req.params.id));
  });

  admin.post('/sessions/:id/rounds', (req, res) => {
    const mode = req.body?.mode === 'repeat' ? 'repeat' : 'next';
    const roundId = service.startRound(req.params.id, mode);
    act(req, mode === 'repeat' ? 'round_repeated' : 'round_opened', req.params.id, roundId);
    res.json(service.adminState(req.params.id));
  });

  const roundSession = (roundId: string) => {
    const row = db.prepare('SELECT session_id FROM voting_rounds WHERE id = ?').get(roundId) as { session_id: string } | undefined;
    if (!row) throw new ServiceError('round_not_found', 'Тур не найден', 404);
    return row.session_id;
  };

  admin.post('/rounds/:id/close', (req, res) => {
    const sessionId = roundSession(req.params.id);
    const outcome = service.closeRound(req.params.id);
    act(req, 'round_closed', sessionId, req.params.id, { outcome: outcome.kind });
    res.json(service.adminState(sessionId));
  });

  admin.post('/rounds/:id/publish', (req, res) => {
    const sessionId = roundSession(req.params.id);
    service.publishRound(req.params.id);
    act(req, 'results_published', sessionId, req.params.id);
    res.json(service.adminState(sessionId));
  });

  admin.post('/sessions/:id/decision', (req, res) => {
    service.recordDecision(req.params.id, req.body?.optionId, req.body?.method);
    act(req, 'decision_recorded', req.params.id, null, { optionId: req.body?.optionId, method: req.body?.method });
    res.json(service.adminState(req.params.id));
  });

  admin.get('/sessions/:id/export.csv', (req, res) => {
    const csv = service.exportCsv(req.params.id);
    service.audit('export_csv', req.params.id, null, undefined, service.hashIp(req.ip));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="it-veche-${req.params.id.slice(0, 8)}.csv"`);
    res.send(csv);
  });

  admin.get('/sessions/:id/volunteers', (req, res) => res.json({ volunteers: service.listVolunteers(req.params.id) }));

  admin.delete('/sessions/:id/volunteers', (req, res) => {
    const n = service.deleteAllVolunteers(req.params.id);
    act(req, 'volunteers_deleted', req.params.id, null, { count: n });
    res.json({ deleted: n });
  });

  admin.delete('/volunteers/:id', (req, res) => {
    const sessionId = service.deleteVolunteer(req.params.id);
    act(req, 'volunteer_deleted', sessionId);
    res.json({ ok: true });
  });

  admin.post('/sessions/:id/codes', (req, res) => {
    const codes = service.generateCodes(req.params.id, req.body?.count);
    act(req, 'codes_generated', req.params.id, null, { count: codes.length });
    res.json({ codes });
  });

  admin.post('/sessions/:id/demo/votes', (req, res) => {
    const added = service.addSyntheticVotes(req.params.id, req.body?.counts);
    act(req, 'demo_votes_added', req.params.id, null, { added });
    res.json(service.adminState(req.params.id));
  });

  admin.post('/sessions/:id/demo/reset', (req, res) => {
    service.resetDemo(req.params.id);
    act(req, 'demo_reset', req.params.id);
    res.json(service.adminState(req.params.id));
  });

  admin.delete('/sessions/:id', (req, res) => {
    service.deleteDemo(req.params.id);
    service.audit('demo_deleted', null, null, { sessionId: req.params.id }, service.hashIp(req.ip));
    res.json({ ok: true });
  });

  admin.get('/audit', (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
    res.json({ entries: service.auditLog(sessionId) });
  });

  app.use('/api/admin', admin);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'Не найдено' }));

  // ---------- статика клиента ----------
  const dist = config.clientDist ? resolve(config.clientDist) : resolve('dist/client');
  if (existsSync(join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(dist, 'index.html'));
    });
  }

  // ---------- ошибки ----------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (err instanceof ServiceError) return res.status(err.httpStatus).json({ error: err.code, message: err.message });
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'bad_json', message: 'Некорректный запрос' });
    console.error(err);
    res.status(500).json({ error: 'internal', message: 'Внутренняя ошибка сервера' });
  });

  return { app, service, hub, close: () => hub.close() };
}
