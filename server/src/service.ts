import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { DB } from './db';
import { OPTION_IDS, getOption, isOptionId, type OptionId } from '../../shared/options';
import { computeOutcome, percentages, type RoundOutcome, type RoundType } from '../../shared/decision';
import type {
  AccessMode,
  AdminRound,
  AdminSessionSummary,
  AdminState,
  NextStep,
  PublicDecision,
  PublicRoundResult,
  PublicState,
  RoundStatus,
  SessionStatus,
  VoteErrorCode,
} from '../../shared/types';

interface SessionRow {
  id: string;
  slug: string;
  title: string;
  status: SessionStatus;
  is_demo: number;
  access_mode: AccessMode;
  expected_participants: number | null;
  created_at: string;
}

interface RoundRow {
  id: string;
  session_id: string;
  number: number;
  type: RoundType;
  status: RoundStatus;
  eligible_option_ids: string;
  slots: number | null;
  carried_option_ids: string;
  outcome: string | null;
  opened_at: string;
  closed_at: string | null;
  published_at: string | null;
}

interface DecisionRow {
  session_id: string;
  winning_option_id: OptionId;
  confirmed_at: string;
  confirmation_method: 'vote' | 'ceo';
  source_round_id: string | null;
}

export class ServiceError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
  }
}

export class VoteError extends Error {
  constructor(public code: VoteErrorCode, message: string, public httpStatus: number) {
    super(message);
  }
}

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VOTER_KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;

const now = () => new Date().toISOString();

function randomString(alphabet: string, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export class VecheService {
  constructor(private db: DB, private secret: string) {}

  // ---------- хеширование ----------

  private hmac(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  hashIp(ip: string | undefined): string | null {
    return ip ? this.hmac('ip:' + ip).slice(0, 16) : null;
  }

  // ---------- чтение ----------

  private sessionBySlug(slug: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM voting_sessions WHERE slug = ?').get(slug) as SessionRow | undefined;
  }

  private sessionById(id: string): SessionRow {
    const s = this.db.prepare('SELECT * FROM voting_sessions WHERE id = ?').get(id) as SessionRow | undefined;
    if (!s) throw new ServiceError('session_not_found', 'Сессия не найдена', 404);
    return s;
  }

  private rounds(sessionId: string): RoundRow[] {
    return this.db.prepare('SELECT * FROM voting_rounds WHERE session_id = ? ORDER BY number').all(sessionId) as RoundRow[];
  }

  private roundById(id: string): RoundRow {
    const r = this.db.prepare('SELECT * FROM voting_rounds WHERE id = ?').get(id) as RoundRow | undefined;
    if (!r) throw new ServiceError('round_not_found', 'Тур не найден', 404);
    return r;
  }

  private decision(sessionId: string): DecisionRow | undefined {
    return this.db.prepare('SELECT * FROM final_decisions WHERE session_id = ?').get(sessionId) as DecisionRow | undefined;
  }

  private voteCount(roundId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM votes WHERE round_id = ?').get(roundId) as { n: number }).n;
  }

  private counts(roundId: string, eligible: OptionId[]): Record<string, number> {
    const rows = this.db.prepare('SELECT option_id, COUNT(*) AS n FROM votes WHERE round_id = ? GROUP BY option_id').all(roundId) as {
      option_id: string;
      n: number;
    }[];
    const counts: Record<string, number> = {};
    for (const id of eligible) counts[id] = 0;
    for (const r of rows) if (r.option_id in counts) counts[r.option_id] = r.n;
    return counts;
  }

  private eligible(r: RoundRow): OptionId[] {
    return JSON.parse(r.eligible_option_ids) as OptionId[];
  }

  sessionIdBySlug(slug: string): string | null {
    return this.sessionBySlug(slug)?.id ?? null;
  }

  /** Текущая реальная (не демо) сессия — для корневой ссылки. */
  currentSlug(): string | null {
    const row = this.db
      .prepare(`SELECT slug FROM voting_sessions WHERE is_demo = 0 AND status <> 'archived' ORDER BY created_at DESC LIMIT 1`)
      .get() as { slug: string } | undefined;
    return row?.slug ?? null;
  }

  private publicSession(s: SessionRow): PublicState['session'] {
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      status: s.status,
      isDemo: s.is_demo === 1,
      accessMode: s.access_mode,
      expectedParticipants: s.expected_participants,
    };
  }

  private publicDecision(d: DecisionRow | undefined): PublicDecision | null {
    return d ? { optionId: d.winning_option_id, method: d.confirmation_method, confirmedAt: d.confirmed_at } : null;
  }

  /** Публичное состояние: без сырых голосов и без распределения до публикации. */
  publicState(sessionId: string): PublicState {
    const s = this.sessionById(sessionId);
    const rounds = this.rounds(s.id);
    const current = rounds[rounds.length - 1] ?? null;
    const results: PublicRoundResult[] = rounds
      .filter((r) => r.status === 'published')
      .map((r) => {
        const eligible = this.eligible(r);
        const counts = this.counts(r.id, eligible);
        return {
          roundId: r.id,
          number: r.number,
          type: r.type,
          eligible,
          counts,
          percents: percentages(eligible, counts),
          total: Object.values(counts).reduce((a, b) => a + b, 0),
          outcome: JSON.parse(r.outcome ?? '{"kind":"no_votes"}') as RoundOutcome,
          publishedAt: r.published_at!,
        };
      });
    return {
      session: this.publicSession(s),
      round: current
        ? {
            id: current.id,
            number: current.number,
            type: current.type,
            status: current.status,
            eligible: this.eligible(current),
            openedAt: current.opened_at,
            closedAt: current.closed_at,
          }
        : null,
      voteCount: current ? this.voteCount(current.id) : 0,
      results,
      decision: this.publicDecision(this.decision(s.id)),
      serverTime: now(),
    };
  }

  publicStateBySlug(slug: string): PublicState {
    const s = this.sessionBySlug(slug);
    if (!s) throw new ServiceError('session_not_found', 'Сессия не найдена', 404);
    return this.publicState(s.id);
  }

  // ---------- голосование ----------

  /** Ключ участника → хеш. В режиме кодов ключом служит одноразовый код. */
  private resolveVoterHash(s: SessionRow, voterKey: unknown, code: unknown): string {
    if (s.access_mode === 'codes') {
      if (typeof code !== 'string' || !normalizeCode(code)) throw new VoteError('invalid_code', 'Введите код участника', 400);
      const hash = this.hmac('code:' + s.id + ':' + normalizeCode(code));
      const exists = this.db.prepare('SELECT 1 FROM access_codes WHERE code_hash = ? AND session_id = ?').get(hash, s.id);
      if (!exists) throw new VoteError('invalid_code', 'Код не найден. Проверьте написание.', 403);
      return hash;
    }
    if (typeof voterKey !== 'string' || !VOTER_KEY_RE.test(voterKey)) {
      throw new VoteError('invalid_voter_key', 'Некорректный идентификатор устройства. Обновите страницу.', 400);
    }
    return this.hmac('device:' + s.id + ':' + voterKey);
  }

  checkCode(slug: string, code: unknown): boolean {
    const s = this.sessionBySlug(slug);
    if (!s || s.access_mode !== 'codes') return false;
    try {
      this.resolveVoterHash(s, null, code);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Принимает голос. Идемпотентно: повторная отправка того же выбора тем же
   * ключом возвращает «accepted, duplicate». Другой выбор — already_voted.
   */
  castVote(slug: string, input: { roundId: unknown; optionId: unknown; voterKey?: unknown; code?: unknown }) {
    const s = this.sessionBySlug(slug);
    if (!s) throw new VoteError('session_not_found', 'Сессия не найдена', 404);
    if (typeof input.roundId !== 'string') throw new VoteError('round_not_found', 'Тур не найден', 404);
    const voterHash = this.resolveVoterHash(s, input.voterKey, input.code);

    return this.db.transaction(() => {
      const r = this.db.prepare('SELECT * FROM voting_rounds WHERE id = ? AND session_id = ?').get(input.roundId, s.id) as
        | RoundRow
        | undefined;
      if (!r) throw new VoteError('round_not_found', 'Тур не найден', 404);

      const existing = this.db.prepare('SELECT option_id FROM votes WHERE round_id = ? AND anonymous_voter_key = ?').get(r.id, voterHash) as
        | { option_id: string }
        | undefined;
      if (existing) {
        if (existing.option_id === input.optionId) return { roundId: r.id, duplicate: true };
        throw new VoteError('already_voted', 'Вы уже проголосовали в этом туре', 409);
      }
      if (r.status !== 'open') throw new VoteError('round_closed', 'Тур уже закрыт — голос не учтён', 409);
      if (!isOptionId(input.optionId) || !this.eligible(r).includes(input.optionId)) {
        throw new VoteError('invalid_option', 'Этот вариант не участвует в текущем туре', 400);
      }
      this.db
        .prepare('INSERT INTO votes (id, round_id, option_id, anonymous_voter_key, is_synthetic, created_at) VALUES (?, ?, ?, ?, 0, ?)')
        .run(randomUUID(), r.id, input.optionId, voterHash, now());
      return { roundId: r.id, duplicate: false };
    })();
  }

  /** В каких турах этот ключ уже голосовал (без раскрытия выбора). */
  votedRounds(slug: string, voterKey: unknown, code: unknown): string[] {
    const s = this.sessionBySlug(slug);
    if (!s) throw new VoteError('session_not_found', 'Сессия не найдена', 404);
    const hash = this.resolveVoterHash(s, voterKey, code);
    return (
      this.db
        .prepare('SELECT v.round_id FROM votes v JOIN voting_rounds r ON r.id = v.round_id WHERE r.session_id = ? AND v.anonymous_voter_key = ?')
        .all(s.id, hash) as { round_id: string }[]
    ).map((r) => r.round_id);
  }

  // ---------- добровольцы ----------

  addVolunteer(slug: string, idea: unknown, contact: unknown) {
    const s = this.sessionBySlug(slug);
    if (!s) throw new ServiceError('session_not_found', 'Сессия не найдена', 404);
    const d = this.decision(s.id);
    if (!d || d.winning_option_id !== 'relay') throw new ServiceError('not_available', 'Форма доступна только при выборе «Цифровой эстафеты»', 409);
    const ideaStr = typeof idea === 'string' ? idea.trim() : '';
    const contactStr = typeof contact === 'string' ? contact.trim() : '';
    if (!ideaStr || ideaStr.length > 2000) throw new ServiceError('invalid_idea', 'Опишите кейс (до 2000 символов)');
    if (!contactStr || contactStr.length > 300) throw new ServiceError('invalid_contact', 'Укажите, как с вами связаться (до 300 символов)');
    this.db.prepare('INSERT INTO volunteer_ideas (id, session_id, idea, contact, created_at) VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      s.id,
      ideaStr,
      contactStr,
      now(),
    );
  }

  listVolunteers(sessionId: string) {
    this.sessionById(sessionId);
    return this.db.prepare('SELECT id, idea, contact, created_at AS createdAt FROM volunteer_ideas WHERE session_id = ? ORDER BY created_at').all(sessionId);
  }

  deleteVolunteer(id: string): string | null {
    const row = this.db.prepare('SELECT session_id FROM volunteer_ideas WHERE id = ?').get(id) as { session_id: string } | undefined;
    if (!row) throw new ServiceError('not_found', 'Запись не найдена', 404);
    this.db.prepare('DELETE FROM volunteer_ideas WHERE id = ?').run(id);
    return row.session_id;
  }

  deleteAllVolunteers(sessionId: string): number {
    return this.db.prepare('DELETE FROM volunteer_ideas WHERE session_id = ?').run(sessionId).changes;
  }

  // ---------- организатор ----------

  audit(action: string, sessionId: string | null, roundId: string | null, details: unknown, ipHash: string | null) {
    this.db
      .prepare('INSERT INTO admin_audit_log (action, session_id, round_id, details, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(action, sessionId, roundId, details === undefined ? null : JSON.stringify(details), ipHash, now());
  }

  auditLog(sessionId: string | null, limit = 100) {
    const rows = sessionId
      ? this.db.prepare('SELECT * FROM admin_audit_log WHERE session_id = ? ORDER BY id DESC LIMIT ?').all(sessionId, limit)
      : this.db.prepare('SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT ?').all(limit);
    return (rows as { id: number; action: string; session_id: string | null; round_id: string | null; details: string | null; created_at: string }[]).map(
      (r) => ({ id: r.id, action: r.action, sessionId: r.session_id, roundId: r.round_id, details: r.details ? JSON.parse(r.details) : null, createdAt: r.created_at }),
    );
  }

  listSessions(): AdminSessionSummary[] {
    return (this.db.prepare('SELECT * FROM voting_sessions ORDER BY created_at DESC LIMIT 50').all() as SessionRow[]).map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      status: s.status,
      isDemo: s.is_demo === 1,
      createdAt: s.created_at,
    }));
  }

  createSession(input: { title?: unknown; expectedParticipants?: unknown; accessMode?: unknown; isDemo?: unknown }): string {
    const isDemo = input.isDemo === true;
    const accessMode: AccessMode = input.accessMode === 'codes' ? 'codes' : 'open';
    const expected = parseExpected(input.expectedParticipants);
    const title =
      typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 120) : isDemo ? 'Демо IT-вече' : 'IT-вече';
    const id = randomUUID();
    this.db.transaction(() => {
      // Новая реальная сессия архивирует предыдущие реальные; демо их не трогает.
      if (!isDemo) this.db.prepare(`UPDATE voting_sessions SET status = 'archived' WHERE is_demo = 0 AND status <> 'archived'`).run();
      // Закрываем открытые туры в архивных сессиях, чтобы в них нельзя было голосовать.
      this.db
        .prepare(
          `UPDATE voting_rounds SET status = 'closed', closed_at = ? WHERE status = 'open' AND session_id IN (SELECT id FROM voting_sessions WHERE status = 'archived')`,
        )
        .run(now());
      let slug = randomString(SLUG_ALPHABET, 6);
      while (this.sessionBySlug(slug)) slug = randomString(SLUG_ALPHABET, 6);
      this.db
        .prepare(
          'INSERT INTO voting_sessions (id, slug, title, status, is_demo, access_mode, expected_participants, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(id, slug, title, 'draft', isDemo ? 1 : 0, accessMode, expected, now());
    })();
    return id;
  }

  updateSession(sessionId: string, input: { expectedParticipants?: unknown; title?: unknown }) {
    const s = this.sessionById(sessionId);
    const expected = input.expectedParticipants === undefined ? s.expected_participants : parseExpected(input.expectedParticipants);
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 120) : s.title;
    this.db.prepare('UPDATE voting_sessions SET expected_participants = ?, title = ? WHERE id = ?').run(expected, title, s.id);
  }

  /** Следующий допустимый шаг организатора — вычисляется сервером. */
  nextStep(sessionId: string): NextStep {
    const s = this.sessionById(sessionId);
    if (this.decision(s.id) || s.status === 'archived') return { kind: 'done' };
    const rounds = this.rounds(s.id);
    const last = rounds[rounds.length - 1];
    if (!last) return { kind: 'start_main' };
    if (last.status === 'open') return { kind: 'close', roundId: last.id };
    if (last.status === 'closed') return { kind: 'publish', roundId: last.id };
    const outcome = JSON.parse(last.outcome ?? '{"kind":"no_votes"}') as RoundOutcome;
    switch (outcome.kind) {
      case 'winner':
        return { kind: 'decide', optionId: outcome.optionId };
      case 'runoff':
        return { kind: 'start_round', type: 'runoff', eligible: outcome.finalists };
      case 'tiebreak':
        return { kind: 'start_round', type: 'tiebreak', eligible: outcome.contenders };
      case 'tie':
        return { kind: 'tie', optionIds: outcome.optionIds };
      case 'no_votes':
        return { kind: 'no_votes', roundType: last.type };
    }
  }

  /**
   * Открывает новый тур. mode:
   *  - 'next'   — следующий тур по правилам (первый тур, тай-брейк или второй тур);
   *  - 'repeat' — повтор последнего тура (после ничьей или если голосов не было).
   */
  startRound(sessionId: string, mode: 'next' | 'repeat'): string {
    return this.db.transaction(() => {
      const s = this.sessionById(sessionId);
      if (s.status === 'archived') throw new ServiceError('archived', 'Сессия в архиве', 409);
      if (this.decision(s.id)) throw new ServiceError('decided', 'Решение уже зафиксировано', 409);
      const rounds = this.rounds(s.id);
      const last = rounds[rounds.length - 1];
      if (last && last.status !== 'published') throw new ServiceError('round_in_progress', 'Сначала завершите текущий тур и покажите результаты', 409);

      let type: RoundType;
      let eligible: OptionId[];
      let slots: number | null = null;
      let carried: OptionId[] = [];

      if (!last) {
        if (mode !== 'next') throw new ServiceError('invalid_step', 'Нет тура для повтора', 409);
        type = 'main';
        eligible = [...OPTION_IDS];
      } else {
        const outcome = JSON.parse(last.outcome ?? '{"kind":"no_votes"}') as RoundOutcome;
        if (mode === 'repeat') {
          if (outcome.kind !== 'tie' && outcome.kind !== 'no_votes') throw new ServiceError('invalid_step', 'Повтор возможен только после ничьей или тура без голосов', 409);
          type = outcome.kind === 'tie' ? 'revote' : last.type;
          eligible = this.eligible(last);
          slots = last.slots;
          carried = JSON.parse(last.carried_option_ids) as OptionId[];
        } else if (outcome.kind === 'runoff') {
          type = 'runoff';
          eligible = outcome.finalists;
        } else if (outcome.kind === 'tiebreak') {
          type = 'tiebreak';
          eligible = outcome.contenders;
          slots = outcome.slots;
          carried = outcome.carried;
        } else {
          throw new ServiceError('invalid_step', 'По правилам следующий тур не требуется', 409);
        }
      }

      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO voting_rounds (id, session_id, number, type, status, eligible_option_ids, slots, carried_option_ids, opened_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
        )
        .run(id, s.id, (last?.number ?? 0) + 1, type, JSON.stringify(eligible), slots, JSON.stringify(carried), now());
      this.db.prepare(`UPDATE voting_sessions SET status = 'active' WHERE id = ?`).run(s.id);
      return id;
    })();
  }

  closeRound(roundId: string): RoundOutcome {
    return this.db.transaction(() => {
      const r = this.roundById(roundId);
      if (r.status !== 'open') throw new ServiceError('not_open', 'Тур уже закрыт', 409);
      const eligible = this.eligible(r);
      const outcome = computeOutcome({
        type: r.type,
        eligible,
        counts: this.counts(r.id, eligible),
        slots: r.slots ?? undefined,
        carried: JSON.parse(r.carried_option_ids) as OptionId[],
      });
      this.db.prepare(`UPDATE voting_rounds SET status = 'closed', closed_at = ?, outcome = ? WHERE id = ?`).run(now(), JSON.stringify(outcome), r.id);
      return outcome;
    })();
  }

  publishRound(roundId: string) {
    const r = this.roundById(roundId);
    if (r.status !== 'closed') throw new ServiceError('not_closed', r.status === 'open' ? 'Сначала завершите голосование' : 'Результаты уже показаны', 409);
    this.db.prepare(`UPDATE voting_rounds SET status = 'published', published_at = ? WHERE id = ?`).run(now(), r.id);
  }

  /**
   * Фиксирует решение. method 'vote' — победитель по правилам, подтверждённый
   * генеральным директором; 'ceo' — решение ГД после ничьей.
   */
  recordDecision(sessionId: string, optionId: unknown, method: unknown) {
    this.db.transaction(() => {
      const s = this.sessionById(sessionId);
      if (this.decision(s.id)) throw new ServiceError('decided', 'Решение уже зафиксировано', 409);
      if (!isOptionId(optionId)) throw new ServiceError('invalid_option', 'Неизвестный вариант');
      const rounds = this.rounds(s.id);
      const last = rounds[rounds.length - 1];
      if (!last || last.status !== 'published') throw new ServiceError('not_ready', 'Сначала покажите результаты тура', 409);
      const outcome = JSON.parse(last.outcome ?? '{"kind":"no_votes"}') as RoundOutcome;
      if (method === 'vote') {
        if (outcome.kind !== 'winner' || outcome.optionId !== optionId) throw new ServiceError('not_winner', 'Этот вариант не победил по правилам', 409);
      } else if (method === 'ceo') {
        if (outcome.kind !== 'tie' || !outcome.optionIds.includes(optionId)) {
          throw new ServiceError('not_tie', 'Решение ГД фиксируется только при ничьей и только из вариантов с равным результатом', 409);
        }
      } else {
        throw new ServiceError('invalid_method', 'Неизвестный способ подтверждения');
      }
      this.db
        .prepare('INSERT INTO final_decisions (session_id, winning_option_id, confirmed_at, confirmation_method, source_round_id) VALUES (?, ?, ?, ?, ?)')
        .run(s.id, optionId, now(), method, last.id);
      this.db.prepare(`UPDATE voting_sessions SET status = 'decided' WHERE id = ?`).run(s.id);
    })();
  }

  adminState(sessionId: string): AdminState {
    const s = this.sessionById(sessionId);
    const codes = this.db.prepare('SELECT COUNT(*) AS n FROM access_codes WHERE session_id = ?').get(s.id) as { n: number };
    const codesUsed = this.db
      .prepare(
        `SELECT COUNT(DISTINCT v.anonymous_voter_key) AS n FROM votes v JOIN voting_rounds r ON r.id = v.round_id
         WHERE r.session_id = ? AND v.anonymous_voter_key IN (SELECT code_hash FROM access_codes WHERE session_id = ?)`,
      )
      .get(s.id, s.id) as { n: number };
    const rounds: AdminRound[] = this.rounds(s.id).map((r) => {
      const eligible = this.eligible(r);
      // Распределение видно организатору только после закрытия тура.
      const counts = r.status === 'open' ? null : this.counts(r.id, eligible);
      return {
        id: r.id,
        number: r.number,
        type: r.type,
        status: r.status,
        eligible,
        openedAt: r.opened_at,
        closedAt: r.closed_at,
        publishedAt: r.published_at,
        voteCount: this.voteCount(r.id),
        slots: r.slots,
        carried: JSON.parse(r.carried_option_ids) as OptionId[],
        counts,
        percents: counts ? percentages(eligible, counts) : null,
        outcome: r.outcome ? (JSON.parse(r.outcome) as RoundOutcome) : null,
      };
    });
    const vol = this.db.prepare('SELECT COUNT(*) AS n FROM volunteer_ideas WHERE session_id = ?').get(s.id) as { n: number };
    return {
      session: { ...this.publicSession(s), createdAt: s.created_at, codesTotal: codes.n, codesUsed: codesUsed.n },
      rounds,
      decision: this.publicDecision(this.decision(s.id)),
      volunteerCount: vol.n,
      next: this.nextStep(s.id),
    };
  }

  // ---------- одноразовые коды ----------

  generateCodes(sessionId: string, count: unknown): string[] {
    const s = this.sessionById(sessionId);
    if (s.access_mode !== 'codes') throw new ServiceError('not_codes_mode', 'Сессия создана без режима кодов', 409);
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 500) throw new ServiceError('invalid_count', 'Количество кодов: от 1 до 500');
    const codes: string[] = [];
    const insert = this.db.prepare('INSERT OR IGNORE INTO access_codes (code_hash, session_id, created_at) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      while (codes.length < n) {
        const code = randomString(CODE_ALPHABET, 4) + '-' + randomString(CODE_ALPHABET, 4);
        const res = insert.run(this.hmac('code:' + s.id + ':' + normalizeCode(code)), s.id, now());
        if (res.changes === 1) codes.push(code);
      }
    })();
    return codes;
  }

  // ---------- демо ----------

  private requireDemo(sessionId: string): SessionRow {
    const s = this.sessionById(sessionId);
    if (s.is_demo !== 1) throw new ServiceError('not_demo', 'Действие доступно только в демо-сессии', 403);
    return s;
  }

  /** Синтетические голоса — только в открытый тур демо-сессии. */
  addSyntheticVotes(sessionId: string, counts: unknown): number {
    const s = this.requireDemo(sessionId);
    const rounds = this.rounds(s.id);
    const last = rounds[rounds.length - 1];
    if (!last || last.status !== 'open') throw new ServiceError('not_open', 'Откройте тур, чтобы добавить тестовые голоса', 409);
    const eligible = this.eligible(last);
    const plan: [OptionId, number][] = [];
    if (counts && typeof counts === 'object') {
      for (const [k, v] of Object.entries(counts as Record<string, unknown>)) {
        const n = Number(v);
        if (!isOptionId(k) || !eligible.includes(k) || !Number.isInteger(n) || n < 0 || n > 200) continue;
        plan.push([k, n]);
      }
    }
    const insert = this.db.prepare(
      'INSERT INTO votes (id, round_id, option_id, anonymous_voter_key, is_synthetic, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    );
    let added = 0;
    this.db.transaction(() => {
      for (const [opt, n] of plan) {
        for (let i = 0; i < n; i++) {
          insert.run(randomUUID(), last.id, opt, 'demo:' + randomBytes(16).toString('hex'), now());
          added++;
        }
      }
    })();
    return added;
  }

  resetDemo(sessionId: string) {
    const s = this.requireDemo(sessionId);
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM final_decisions WHERE session_id = ?').run(s.id);
      this.db.prepare('DELETE FROM voting_rounds WHERE session_id = ?').run(s.id);
      this.db.prepare('DELETE FROM volunteer_ideas WHERE session_id = ?').run(s.id);
      this.db.prepare(`UPDATE voting_sessions SET status = 'draft' WHERE id = ?`).run(s.id);
    })();
  }

  deleteDemo(sessionId: string) {
    const s = this.requireDemo(sessionId);
    this.db.prepare('DELETE FROM voting_sessions WHERE id = ?').run(s.id);
  }

  // ---------- экспорт ----------

  /** CSV по турам. Без анонимных ключей и без контактов добровольцев. */
  exportCsv(sessionId: string): string {
    const s = this.sessionById(sessionId);
    const d = this.decision(s.id);
    const decisionText = d ? `${getOption(d.winning_option_id)?.title} (${d.confirmation_method === 'vote' ? 'по итогам голосования' : 'решение ГД после ничьей'})` : '';
    const header = ['session_id', 'demo', 'round_id', 'round_number', 'round_type', 'round_status', 'option_id', 'option_title', 'votes', 'share_percent', 'round_outcome', 'final_decision'];
    const lines = [header];
    for (const r of this.rounds(s.id)) {
      const eligible = this.eligible(r);
      const counts = r.status === 'open' ? null : this.counts(r.id, eligible);
      const perc = counts ? percentages(eligible, counts) : null;
      for (const opt of eligible) {
        lines.push([
          s.id,
          s.is_demo ? 'yes' : 'no',
          r.id,
          String(r.number),
          r.type,
          r.status,
          opt,
          getOption(opt)?.title ?? opt,
          counts ? String(counts[opt]) : '',
          perc ? String(perc[opt]) : '',
          r.outcome ? describeOutcome(JSON.parse(r.outcome) as RoundOutcome) : 'тур открыт',
          decisionText,
        ]);
      }
    }
    return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
}

function parseExpected(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 1000) throw new ServiceError('invalid_expected', 'Ожидаемое число участников: от 1 до 1000');
  return n;
}

function csvCell(v: string): string {
  // Защита от CSV-инъекций в Excel и корректное экранирование.
  const safe = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export function describeOutcome(o: RoundOutcome): string {
  const t = (id: OptionId) => getOption(id)?.title ?? id;
  switch (o.kind) {
    case 'no_votes':
      return 'голосов нет';
    case 'winner':
      return `победа: ${t(o.optionId)}`;
    case 'runoff':
      return `второй тур: ${o.finalists.map(t).join(' / ')}`;
    case 'tiebreak':
      return `тай-брейк: ${o.contenders.map(t).join(' / ')} (мест: ${o.slots})`;
    case 'tie':
      return `ничья: ${o.optionIds.map(t).join(' / ')}`;
  }
}
