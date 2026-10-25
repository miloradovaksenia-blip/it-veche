import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Db } from './db';
import { DEFAULT_AGENDA, OPTION_IDS, getOption, isOptionId, type OptionId } from '../../shared/options';
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
  agenda: string;
  live_results: number;
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
const n = (v: unknown) => Number(v ?? 0);

function randomString(alphabet: string, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === '23505' || err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/.test(err?.message ?? '');
}

function isRoundNotOpen(e: unknown): boolean {
  return /round_not_open/.test((e as { message?: string })?.message ?? '');
}

export class VecheService {
  constructor(private db: Db, private secret: string) {}

  // ---------- хеширование ----------

  private hmac(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  hashIp(ip: string | undefined): string | null {
    return ip ? this.hmac('ip:' + ip).slice(0, 16) : null;
  }

  // ---------- чтение ----------

  private sessionBySlug(slug: string, db: Db = this.db) {
    return db.get<SessionRow>('SELECT * FROM voting_sessions WHERE slug = ?', [slug]);
  }

  private async sessionById(id: string, db: Db = this.db): Promise<SessionRow> {
    const s = await db.get<SessionRow>('SELECT * FROM voting_sessions WHERE id = ?', [id]);
    if (!s) throw new ServiceError('session_not_found', 'Сессия не найдена', 404);
    return s;
  }

  private rounds(sessionId: string, db: Db = this.db) {
    return db.all<RoundRow>('SELECT * FROM voting_rounds WHERE session_id = ? ORDER BY number', [sessionId]);
  }

  private async lastRound(sessionId: string, db: Db = this.db): Promise<RoundRow | undefined> {
    return db.get<RoundRow>('SELECT * FROM voting_rounds WHERE session_id = ? ORDER BY number DESC LIMIT 1', [sessionId]);
  }

  private async roundById(id: string, db: Db = this.db): Promise<RoundRow> {
    const r = await db.get<RoundRow>('SELECT * FROM voting_rounds WHERE id = ?', [id]);
    if (!r) throw new ServiceError('round_not_found', 'Тур не найден', 404);
    return r;
  }

  async roundSessionId(roundId: string): Promise<string> {
    return (await this.roundById(roundId)).session_id;
  }

  private decision(sessionId: string, db: Db = this.db) {
    return db.get<DecisionRow>('SELECT * FROM final_decisions WHERE session_id = ?', [sessionId]);
  }

  private async voteCount(roundId: string, db: Db = this.db): Promise<number> {
    return n((await db.get<{ n: number }>('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM votes WHERE round_id = ?', [roundId]))?.n);
  }

  private async counts(roundId: string, eligible: OptionId[], db: Db = this.db): Promise<Record<string, number>> {
    const rows = await db.all<{ option_id: string; n: number }>(
      'SELECT option_id, CAST(COUNT(*) AS INTEGER) AS n FROM votes WHERE round_id = ? GROUP BY option_id',
      [roundId],
    );
    const counts: Record<string, number> = {};
    for (const id of eligible) counts[id] = 0;
    for (const r of rows) if (r.option_id in counts) counts[r.option_id] = n(r.n);
    return counts;
  }

  private eligible(r: RoundRow): OptionId[] {
    return JSON.parse(r.eligible_option_ids) as OptionId[];
  }

  async sessionIdBySlug(slug: string): Promise<string | null> {
    return (await this.sessionBySlug(slug))?.id ?? null;
  }

  /** Текущая реальная (не демо) сессия — для корневой ссылки. */
  async currentSlug(): Promise<string | null> {
    const row = await this.db.get<{ slug: string }>(
      `SELECT slug FROM voting_sessions WHERE is_demo = 0 AND status <> 'archived' ORDER BY created_at DESC LIMIT 1`,
    );
    return row?.slug ?? null;
  }

  private publicSession(s: SessionRow): PublicState['session'] {
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      status: s.status,
      isDemo: n(s.is_demo) === 1,
      accessMode: s.access_mode,
      expectedParticipants: s.expected_participants === null ? null : n(s.expected_participants),
      agenda: s.agenda,
      liveResults: n(s.live_results) === 1,
    };
  }

  private publicDecision(d: DecisionRow | undefined): PublicDecision | null {
    return d ? { optionId: d.winning_option_id, method: d.confirmation_method, confirmedAt: d.confirmed_at } : null;
  }

  /** Публичное состояние: без сырых голосов и без распределения до публикации. */
  async publicState(sessionId: string): Promise<PublicState> {
    const s = await this.sessionById(sessionId);
    const rounds = await this.rounds(s.id);
    const current = rounds[rounds.length - 1] ?? null;
    const results: PublicRoundResult[] = [];
    for (const r of rounds.filter((x) => x.status === 'published')) {
      const eligible = this.eligible(r);
      const counts = await this.counts(r.id, eligible);
      results.push({
        roundId: r.id,
        number: n(r.number),
        type: r.type,
        eligible,
        counts,
        percents: percentages(eligible, counts),
        total: Object.values(counts).reduce((a, b) => a + b, 0),
        outcome: JSON.parse(r.outcome ?? '{"kind":"no_votes"}') as RoundOutcome,
        publishedAt: r.published_at!,
      });
    }
    // Живое распределение — только если организатор включил этот режим для сессии.
    let live: PublicState['live'] = null;
    if (current && current.status !== 'published' && n(s.live_results) === 1) {
      const eligible = this.eligible(current);
      const counts = await this.counts(current.id, eligible);
      live = { roundId: current.id, counts, percents: percentages(eligible, counts), total: Object.values(counts).reduce((a, b) => a + b, 0) };
    }
    return {
      session: this.publicSession(s),
      live,
      round: current
        ? {
            id: current.id,
            number: n(current.number),
            type: current.type,
            status: current.status,
            eligible: this.eligible(current),
            openedAt: current.opened_at,
            closedAt: current.closed_at,
          }
        : null,
      voteCount: current ? await this.voteCount(current.id) : 0,
      results,
      decision: this.publicDecision(await this.decision(s.id)),
      serverTime: now(),
    };
  }

  async publicStateBySlug(slug: string): Promise<PublicState> {
    const s = await this.sessionBySlug(slug);
    if (!s) throw new ServiceError('session_not_found', 'Сессия не найдена', 404);
    return this.publicState(s.id);
  }

  // ---------- голосование ----------

  /** Ключ участника → хеш. В режиме кодов ключом служит одноразовый код. */
  private async resolveVoterHash(s: SessionRow, voterKey: unknown, code: unknown): Promise<string> {
    if (s.access_mode === 'codes') {
      if (typeof code !== 'string' || !normalizeCode(code)) throw new VoteError('invalid_code', 'Введите код участника', 400);
      const hash = this.hmac('code:' + s.id + ':' + normalizeCode(code));
      const exists = await this.db.get('SELECT 1 AS x FROM access_codes WHERE code_hash = ? AND session_id = ?', [hash, s.id]);
      if (!exists) throw new VoteError('invalid_code', 'Код не найден. Проверьте написание.', 403);
      return hash;
    }
    if (typeof voterKey !== 'string' || !VOTER_KEY_RE.test(voterKey)) {
      throw new VoteError('invalid_voter_key', 'Некорректный идентификатор устройства. Обновите страницу.', 400);
    }
    return this.hmac('device:' + s.id + ':' + voterKey);
  }

  async checkCode(slug: string, code: unknown): Promise<boolean> {
    const s = await this.sessionBySlug(slug);
    if (!s || s.access_mode !== 'codes') return false;
    try {
      await this.resolveVoterHash(s, null, code);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Принимает голос. Идемпотентно: повторная отправка того же выбора тем же
   * ключом возвращает «accepted, duplicate». Другой выбор — already_voted.
   */
  async castVote(slug: string, input: { roundId: unknown; optionId: unknown; voterKey?: unknown; code?: unknown }) {
    const s = await this.sessionBySlug(slug);
    if (!s) throw new VoteError('session_not_found', 'Сессия не найдена', 404);
    if (typeof input.roundId !== 'string') throw new VoteError('round_not_found', 'Тур не найден', 404);
    const voterHash = await this.resolveVoterHash(s, input.voterKey, input.code);

    const existingVote = (db: Db) =>
      db.get<{ option_id: string }>('SELECT option_id FROM votes WHERE round_id = ? AND anonymous_voter_key = ?', [input.roundId, voterHash]);

    try {
      return await this.db.tx(async (tx) => {
        // FOR SHARE: закрытие тура дождётся завершения уже начатых голосов и наоборот.
        const r = await tx.get<RoundRow>('SELECT * FROM voting_rounds WHERE id = ? AND session_id = ?{{FOR_SHARE}}', [input.roundId, s.id]);
        if (!r) throw new VoteError('round_not_found', 'Тур не найден', 404);
        const existing = await existingVote(tx);
        if (existing) {
          if (existing.option_id === input.optionId) return { roundId: r.id, duplicate: true };
          throw new VoteError('already_voted', 'Вы уже проголосовали в этом туре', 409);
        }
        if (r.status !== 'open') throw new VoteError('round_closed', 'Тур уже закрыт — голос не учтён', 409);
        if (!isOptionId(input.optionId) || !this.eligible(r).includes(input.optionId)) {
          throw new VoteError('invalid_option', 'Этот вариант не участвует в текущем туре', 400);
        }
        await tx.run('INSERT INTO votes (id, round_id, option_id, anonymous_voter_key, is_synthetic, created_at) VALUES (?, ?, ?, ?, 0, ?)', [
          randomUUID(),
          r.id,
          input.optionId,
          voterHash,
          now(),
        ]);
        return { roundId: r.id, duplicate: false };
      });
    } catch (e) {
      // Две одновременные отправки одним ключом: вторая упирается в UNIQUE — отвечаем как на повтор.
      if (isUniqueViolation(e)) {
        const existing = await existingVote(this.db);
        if (existing?.option_id === input.optionId) return { roundId: input.roundId, duplicate: true };
        throw new VoteError('already_voted', 'Вы уже проголосовали в этом туре', 409);
      }
      if (isRoundNotOpen(e)) throw new VoteError('round_closed', 'Тур уже закрыт — голос не учтён', 409);
      throw e;
    }
  }

  /** В каких турах этот ключ уже голосовал (без раскрытия выбора). */
  async votedRounds(slug: string, voterKey: unknown, code: unknown): Promise<string[]> {
    const s = await this.sessionBySlug(slug);
    if (!s) throw new VoteError('session_not_found', 'Сессия не найдена', 404);
    const hash = await this.resolveVoterHash(s, voterKey, code);
    const rows = await this.db.all<{ round_id: string }>(
      'SELECT v.round_id FROM votes v JOIN voting_rounds r ON r.id = v.round_id WHERE r.session_id = ? AND v.anonymous_voter_key = ?',
      [s.id, hash],
    );
    return rows.map((r) => r.round_id);
  }

  // ---------- добровольцы ----------

  async addVolunteer(slug: string, idea: unknown, contact: unknown) {
    const s = await this.sessionBySlug(slug);
    if (!s) throw new ServiceError('session_not_found', 'Сессия не найдена', 404);
    const d = await this.decision(s.id);
    if (!d || d.winning_option_id !== 'relay') throw new ServiceError('not_available', 'Форма доступна только при выборе «Цифровой эстафеты»', 409);
    const ideaStr = typeof idea === 'string' ? idea.trim() : '';
    const contactStr = typeof contact === 'string' ? contact.trim() : '';
    if (!ideaStr || ideaStr.length > 2000) throw new ServiceError('invalid_idea', 'Опишите кейс (до 2000 символов)');
    if (!contactStr || contactStr.length > 300) throw new ServiceError('invalid_contact', 'Укажите, как с вами связаться (до 300 символов)');
    await this.db.run('INSERT INTO volunteer_ideas (id, session_id, idea, contact, created_at) VALUES (?, ?, ?, ?, ?)', [
      randomUUID(),
      s.id,
      ideaStr,
      contactStr,
      now(),
    ]);
  }

  async listVolunteers(sessionId: string) {
    await this.sessionById(sessionId);
    return this.db.all('SELECT id, idea, contact, created_at AS "createdAt" FROM volunteer_ideas WHERE session_id = ? ORDER BY created_at', [sessionId]);
  }

  async deleteVolunteer(id: string): Promise<string> {
    const row = await this.db.get<{ session_id: string }>('SELECT session_id FROM volunteer_ideas WHERE id = ?', [id]);
    if (!row) throw new ServiceError('not_found', 'Запись не найдена', 404);
    await this.db.run('DELETE FROM volunteer_ideas WHERE id = ?', [id]);
    return row.session_id;
  }

  async deleteAllVolunteers(sessionId: string): Promise<number> {
    return (await this.db.run('DELETE FROM volunteer_ideas WHERE session_id = ?', [sessionId])).changes;
  }

  // ---------- организатор ----------

  async audit(action: string, sessionId: string | null, roundId: string | null, details: unknown, ipHash: string | null) {
    await this.db.run('INSERT INTO admin_audit_log (action, session_id, round_id, details, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      action,
      sessionId,
      roundId,
      details === undefined ? null : JSON.stringify(details),
      ipHash,
      now(),
    ]);
  }

  async auditLog(sessionId: string | null, limit = 100) {
    const rows = sessionId
      ? await this.db.all('SELECT * FROM admin_audit_log WHERE session_id = ? ORDER BY id DESC LIMIT ?', [sessionId, limit])
      : await this.db.all('SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT ?', [limit]);
    return (rows as { id: number; action: string; session_id: string | null; round_id: string | null; details: string | null; created_at: string }[]).map((r) => ({
      id: n(r.id),
      action: r.action,
      sessionId: r.session_id,
      roundId: r.round_id,
      details: r.details ? JSON.parse(r.details) : null,
      createdAt: r.created_at,
    }));
  }

  async listSessions(): Promise<AdminSessionSummary[]> {
    const rows = await this.db.all<SessionRow>('SELECT * FROM voting_sessions ORDER BY created_at DESC LIMIT 50');
    return rows.map((s) => ({ id: s.id, slug: s.slug, title: s.title, status: s.status, isDemo: n(s.is_demo) === 1, createdAt: s.created_at }));
  }

  async createSession(input: {
    title?: unknown;
    expectedParticipants?: unknown;
    accessMode?: unknown;
    isDemo?: unknown;
    agenda?: unknown;
    liveResults?: unknown;
  }): Promise<string> {
    const isDemo = input.isDemo === true;
    const agenda = parseAgenda(input.agenda) ?? DEFAULT_AGENDA;
    const live = input.liveResults === true ? 1 : 0;
    const accessMode: AccessMode = input.accessMode === 'codes' ? 'codes' : 'open';
    const expected = parseExpected(input.expectedParticipants);
    const title =
      typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 120) : isDemo ? 'Демо ИТ-вече' : 'ИТ-вече';
    const id = randomUUID();
    await this.db.tx(async (tx) => {
      // Новая реальная сессия архивирует предыдущие реальные; демо их не трогает.
      if (!isDemo) await tx.run(`UPDATE voting_sessions SET status = 'archived' WHERE is_demo = 0 AND status <> 'archived'`);
      // Закрываем открытые туры в архивных сессиях, чтобы в них нельзя было голосовать.
      await tx.run(
        `UPDATE voting_rounds SET status = 'closed', closed_at = ? WHERE status = 'open' AND session_id IN (SELECT id FROM voting_sessions WHERE status = 'archived')`,
        [now()],
      );
      let slug = randomString(SLUG_ALPHABET, 6);
      while (await this.sessionBySlug(slug, tx)) slug = randomString(SLUG_ALPHABET, 6);
      await tx.run(
        `INSERT INTO voting_sessions (id, slug, title, status, is_demo, access_mode, expected_participants, created_at, agenda, live_results)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, slug, title, 'draft', isDemo ? 1 : 0, accessMode, expected, now(), agenda, live],
      );
    });
    return id;
  }

  async updateSession(sessionId: string, input: { expectedParticipants?: unknown; title?: unknown; agenda?: unknown; liveResults?: unknown }) {
    const s = await this.sessionById(sessionId);
    const expected = input.expectedParticipants === undefined ? s.expected_participants : parseExpected(input.expectedParticipants);
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 120) : s.title;
    const agenda = input.agenda === undefined ? s.agenda : (parseAgenda(input.agenda) ?? s.agenda);
    const live = typeof input.liveResults === 'boolean' ? (input.liveResults ? 1 : 0) : n(s.live_results);
    await this.db.run('UPDATE voting_sessions SET expected_participants = ?, title = ?, agenda = ?, live_results = ? WHERE id = ?', [
      expected,
      title,
      agenda,
      live,
      s.id,
    ]);
  }

  /** Полное удаление сессии со всеми турами, голосами, решением, кодами и заявками. */
  async deleteSession(sessionId: string) {
    const s = await this.sessionById(sessionId);
    await this.db.run('DELETE FROM voting_sessions WHERE id = ?', [s.id]);
  }

  /** Следующий допустимый шаг организатора — вычисляется сервером. */
  async nextStep(sessionId: string): Promise<NextStep> {
    const s = await this.sessionById(sessionId);
    if ((await this.decision(s.id)) || s.status === 'archived') return { kind: 'done' };
    const last = await this.lastRound(s.id);
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
  async startRound(sessionId: string, mode: 'next' | 'repeat'): Promise<string> {
    try {
      return await this.db.tx(async (tx) => {
        const s = await this.sessionById(sessionId, tx);
        if (s.status === 'archived') throw new ServiceError('archived', 'Сессия в архиве', 409);
        if (await this.decision(s.id, tx)) throw new ServiceError('decided', 'Решение уже зафиксировано', 409);
        const last = await this.lastRound(s.id, tx);
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
            if (outcome.kind !== 'tie' && outcome.kind !== 'no_votes') {
              throw new ServiceError('invalid_step', 'Повтор возможен только после ничьей или тура без голосов', 409);
            }
            type = outcome.kind === 'tie' ? 'revote' : last.type;
            eligible = this.eligible(last);
            slots = last.slots === null ? null : n(last.slots);
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
        await tx.run(
          `INSERT INTO voting_rounds (id, session_id, number, type, status, eligible_option_ids, slots, carried_option_ids, opened_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
          [id, s.id, n(last?.number) + 1, type, JSON.stringify(eligible), slots, JSON.stringify(carried), now()],
        );
        await tx.run(`UPDATE voting_sessions SET status = 'active' WHERE id = ?`, [s.id]);
        return id;
      });
    } catch (e) {
      // Двойной клик «Начать голосование»: второй запрос упирается в уникальность номера тура.
      if (isUniqueViolation(e)) throw new ServiceError('round_in_progress', 'Тур уже открыт', 409);
      throw e;
    }
  }

  async closeRound(roundId: string): Promise<RoundOutcome> {
    return this.db.tx(async (tx) => {
      // Сначала меняем статус: строка блокируется, новые голоса после этого отклоняются.
      const changed = await tx.run(`UPDATE voting_rounds SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'`, [now(), roundId]);
      if (changed.changes !== 1) {
        await this.roundById(roundId, tx);
        throw new ServiceError('not_open', 'Тур уже закрыт', 409);
      }
      const r = await this.roundById(roundId, tx);
      const eligible = this.eligible(r);
      const outcome = computeOutcome({
        type: r.type,
        eligible,
        counts: await this.counts(r.id, eligible, tx),
        slots: r.slots === null ? undefined : n(r.slots),
        carried: JSON.parse(r.carried_option_ids) as OptionId[],
      });
      await tx.run('UPDATE voting_rounds SET outcome = ? WHERE id = ?', [JSON.stringify(outcome), r.id]);
      return outcome;
    });
  }

  async publishRound(roundId: string) {
    const r = await this.roundById(roundId);
    if (r.status !== 'closed') throw new ServiceError('not_closed', r.status === 'open' ? 'Сначала завершите голосование' : 'Результаты уже показаны', 409);
    await this.db.run(`UPDATE voting_rounds SET status = 'published', published_at = ? WHERE id = ? AND status = 'closed'`, [now(), r.id]);
  }

  /**
   * Фиксирует решение. method 'vote' — победитель по правилам, подтверждённый
   * генеральным директором; 'ceo' — решение ГД после ничьей.
   */
  async recordDecision(sessionId: string, optionId: unknown, method: unknown) {
    try {
      await this.db.tx(async (tx) => {
        const s = await this.sessionById(sessionId, tx);
        if (await this.decision(s.id, tx)) throw new ServiceError('decided', 'Решение уже зафиксировано', 409);
        if (!isOptionId(optionId)) throw new ServiceError('invalid_option', 'Неизвестный вариант');
        const last = await this.lastRound(s.id, tx);
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
        await tx.run(
          'INSERT INTO final_decisions (session_id, winning_option_id, confirmed_at, confirmation_method, source_round_id) VALUES (?, ?, ?, ?, ?)',
          [s.id, optionId, now(), method, last.id],
        );
        await tx.run(`UPDATE voting_sessions SET status = 'decided' WHERE id = ?`, [s.id]);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ServiceError('decided', 'Решение уже зафиксировано', 409);
      throw e;
    }
  }

  async adminState(sessionId: string): Promise<AdminState> {
    const s = await this.sessionById(sessionId);
    const codes = await this.db.get<{ n: number }>('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM access_codes WHERE session_id = ?', [s.id]);
    const codesUsed = await this.db.get<{ n: number }>(
      `SELECT CAST(COUNT(DISTINCT v.anonymous_voter_key) AS INTEGER) AS n FROM votes v JOIN voting_rounds r ON r.id = v.round_id
       WHERE r.session_id = ? AND v.anonymous_voter_key IN (SELECT code_hash FROM access_codes WHERE session_id = ?)`,
      [s.id, s.id],
    );
    const rounds: AdminRound[] = [];
    for (const r of await this.rounds(s.id)) {
      const eligible = this.eligible(r);
      // Во время тура распределение видно, только если включён режим «голоса в реальном времени».
      const counts = r.status === 'open' && n(s.live_results) !== 1 ? null : await this.counts(r.id, eligible);
      rounds.push({
        id: r.id,
        number: n(r.number),
        type: r.type,
        status: r.status,
        eligible,
        openedAt: r.opened_at,
        closedAt: r.closed_at,
        publishedAt: r.published_at,
        voteCount: await this.voteCount(r.id),
        slots: r.slots === null ? null : n(r.slots),
        carried: JSON.parse(r.carried_option_ids) as OptionId[],
        counts,
        percents: counts ? percentages(eligible, counts) : null,
        outcome: r.outcome ? (JSON.parse(r.outcome) as RoundOutcome) : null,
      });
    }
    const vol = await this.db.get<{ n: number }>('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM volunteer_ideas WHERE session_id = ?', [s.id]);
    return {
      session: { ...this.publicSession(s), createdAt: s.created_at, codesTotal: n(codes?.n), codesUsed: n(codesUsed?.n) },
      rounds,
      decision: this.publicDecision(await this.decision(s.id)),
      volunteerCount: n(vol?.n),
      next: await this.nextStep(s.id),
    };
  }

  // ---------- одноразовые коды ----------

  async generateCodes(sessionId: string, count: unknown): Promise<string[]> {
    const s = await this.sessionById(sessionId);
    if (s.access_mode !== 'codes') throw new ServiceError('not_codes_mode', 'Сессия создана без режима кодов', 409);
    const total = Number(count);
    if (!Number.isInteger(total) || total < 1 || total > 500) throw new ServiceError('invalid_count', 'Количество кодов: от 1 до 500');
    const codes: string[] = [];
    await this.db.tx(async (tx) => {
      while (codes.length < total) {
        const code = randomString(CODE_ALPHABET, 4) + '-' + randomString(CODE_ALPHABET, 4);
        const res = await tx.run('INSERT INTO access_codes (code_hash, session_id, created_at) VALUES (?, ?, ?) ON CONFLICT (code_hash) DO NOTHING', [
          this.hmac('code:' + s.id + ':' + normalizeCode(code)),
          s.id,
          now(),
        ]);
        if (res.changes === 1) codes.push(code);
      }
    });
    return codes;
  }

  // ---------- демо ----------

  private async requireDemo(sessionId: string): Promise<SessionRow> {
    const s = await this.sessionById(sessionId);
    if (n(s.is_demo) !== 1) throw new ServiceError('not_demo', 'Действие доступно только в демо-сессии', 403);
    return s;
  }

  /** Синтетические голоса — только в открытый тур демо-сессии. */
  async addSyntheticVotes(sessionId: string, counts: unknown): Promise<number> {
    const s = await this.requireDemo(sessionId);
    const last = await this.lastRound(s.id);
    if (!last || last.status !== 'open') throw new ServiceError('not_open', 'Откройте тур, чтобы добавить тестовые голоса', 409);
    const eligible = this.eligible(last);
    const plan: [OptionId, number][] = [];
    if (counts && typeof counts === 'object') {
      for (const [k, v] of Object.entries(counts as Record<string, unknown>)) {
        const c = Number(v);
        if (!isOptionId(k) || !eligible.includes(k) || !Number.isInteger(c) || c < 0 || c > 200) continue;
        plan.push([k, c]);
      }
    }
    let added = 0;
    await this.db.tx(async (tx) => {
      for (const [opt, c] of plan) {
        for (let i = 0; i < c; i++) {
          await tx.run('INSERT INTO votes (id, round_id, option_id, anonymous_voter_key, is_synthetic, created_at) VALUES (?, ?, ?, ?, 1, ?)', [
            randomUUID(),
            last.id,
            opt,
            'demo:' + randomBytes(16).toString('hex'),
            now(),
          ]);
          added++;
        }
      }
    });
    return added;
  }

  async resetDemo(sessionId: string) {
    const s = await this.requireDemo(sessionId);
    await this.db.tx(async (tx) => {
      await tx.run('DELETE FROM final_decisions WHERE session_id = ?', [s.id]);
      await tx.run('DELETE FROM voting_rounds WHERE session_id = ?', [s.id]);
      await tx.run('DELETE FROM volunteer_ideas WHERE session_id = ?', [s.id]);
      await tx.run(`UPDATE voting_sessions SET status = 'draft' WHERE id = ?`, [s.id]);
    });
  }

  // ---------- экспорт ----------

  /** CSV по турам. Без анонимных ключей и без контактов добровольцев. */
  async exportCsv(sessionId: string): Promise<string> {
    const s = await this.sessionById(sessionId);
    const d = await this.decision(s.id);
    const decisionText = d
      ? `${getOption(d.winning_option_id)?.title} (${d.confirmation_method === 'vote' ? 'по итогам голосования' : 'решение ГД после ничьей'})`
      : '';
    const header = ['session_id', 'demo', 'round_id', 'round_number', 'round_type', 'round_status', 'option_id', 'option_title', 'votes', 'share_percent', 'round_outcome', 'final_decision'];
    const lines = [header];
    for (const r of await this.rounds(s.id)) {
      const eligible = this.eligible(r);
      const counts = r.status === 'open' ? null : await this.counts(r.id, eligible);
      const perc = counts ? percentages(eligible, counts) : null;
      for (const opt of eligible) {
        lines.push([
          s.id,
          n(s.is_demo) ? 'yes' : 'no',
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

function parseAgenda(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new ServiceError('invalid_agenda', 'Вопрос повестки должен быть текстом');
  const t = v.trim();
  if (!t) return null;
  if (t.length > 300) throw new ServiceError('invalid_agenda', 'Вопрос повестки — до 300 символов');
  return t;
}

function parseExpected(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const num = Number(v);
  if (!Number.isInteger(num) || num < 1 || num > 1000) throw new ServiceError('invalid_expected', 'Ожидаемое число участников: от 1 до 1000');
  return num;
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
