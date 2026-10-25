import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { openDb, openDbRaw, type Db } from '../src/db';
import { createApp, type AppContext } from '../src/app';
import { loadConfig } from '../src/config';

const PASSWORD = 'test-admin-password';
let db: Db;
let ctx: AppContext;
let cookie: string;

const key = () => randomBytes(32).toString('base64url');

async function login(): Promise<string> {
  const res = await request(ctx.app).post('/api/admin/login').send({ password: PASSWORD });
  expect(res.status).toBe(200);
  return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

const adminPost = (path: string, body: object = {}) => request(ctx.app).post(path).set('Cookie', cookie).set('X-Veche-Admin', '1').send(body);
const adminGet = (path: string) => request(ctx.app).get(path).set('Cookie', cookie);

async function createSession(extra: object = {}) {
  const res = await adminPost('/api/admin/sessions', { expectedParticipants: 20, ...extra });
  expect(res.status).toBe(200);
  const state = (await adminGet(`/api/admin/sessions/${res.body.id}`)).body;
  return { id: res.body.id as string, slug: state.session.slug as string };
}

async function openRound(sessionId: string, mode: 'next' | 'repeat' = 'next') {
  const res = await adminPost(`/api/admin/sessions/${sessionId}/rounds`, { mode });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.rounds[res.body.rounds.length - 1].id as string;
}

const vote = (slug: string, roundId: string, optionId: string, voterKey = key()) =>
  request(ctx.app).post(`/api/sessions/${slug}/vote`).send({ roundId, optionId, voterKey });

async function castMany(slug: string, roundId: string, plan: Record<string, number>) {
  for (const [opt, n] of Object.entries(plan)) for (let i = 0; i < n; i++) expect((await vote(slug, roundId, opt)).status).toBe(200);
}

const closeAndPublish = async (roundId: string) => {
  expect((await adminPost(`/api/admin/rounds/${roundId}/close`)).status).toBe(200);
  const res = await adminPost(`/api/admin/rounds/${roundId}/publish`);
  expect(res.status).toBe(200);
  return res.body;
};

const PG_URL = process.env.TEST_DATABASE_URL;
const backends = [{ name: 'SQLite', url: null as string | null }, ...(PG_URL ? [{ name: 'PostgreSQL', url: PG_URL }] : [])];

describe.each(backends)('$name', ({ url }) => {
beforeEach(async () => {
  if (url) {
    // Чистая схема для каждого теста.
    const reset = await openDbRaw(url);
    await reset.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await reset.close();
  }
  db = await openDb({ databaseUrl: url, dbPath: ':memory:' });
  ctx = createApp(db, loadConfig({ NODE_ENV: 'test', ADMIN_PASSWORD: PASSWORD, APP_SECRET: 'x'.repeat(40) }));
  cookie = await login();
});

afterEach(async () => {
  ctx.close();
  await db.close();
});

describe('доступ организатора', () => {
  it('без входа нельзя выполнять админ-действия', async () => {
    const { id } = await createSession();
    expect((await request(ctx.app).post('/api/admin/sessions').send({})).status).toBe(401);
    expect((await request(ctx.app).post(`/api/admin/sessions/${id}/rounds`).set('X-Veche-Admin', '1').send({})).status).toBe(401);
    expect((await request(ctx.app).get(`/api/admin/sessions/${id}`)).status).toBe(401);
    expect((await request(ctx.app).get(`/api/admin/sessions/${id}/export.csv`)).status).toBe(401);
  });

  it('неверный пароль отклоняется', async () => {
    expect((await request(ctx.app).post('/api/admin/login').send({ password: 'nope' })).status).toBe(401);
  });

  it('подделанный cookie не работает', async () => {
    const forged = 'veche_admin=' + (Date.now() + 1e6) + '.AAAA';
    expect((await request(ctx.app).get('/api/admin/sessions').set('Cookie', forged)).status).toBe(401);
  });

  it('изменяющий запрос без заголовка защиты (CSRF) отклоняется', async () => {
    expect((await request(ctx.app).post('/api/admin/sessions').set('Cookie', cookie).send({})).status).toBe(403);
  });
});

describe('голосование', () => {
  it('голос принимается только в открытый тур', async () => {
    const { id, slug } = await createSession();
    const roundId = await openRound(id);
    const k = key();
    const ok = await vote(slug, roundId, 'relay', k);
    expect(ok.body).toEqual({ status: 'accepted', roundId, duplicate: false });

    await adminPost(`/api/admin/rounds/${roundId}/close`);
    const late = await vote(slug, roundId, 'relay');
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('round_closed');
  });

  it('один ключ — один голос; повтор идемпотентен', async () => {
    const { id, slug } = await createSession();
    const roundId = await openRound(id);
    const k = key();
    expect((await vote(slug, roundId, 'navigator', k)).body.duplicate).toBe(false);
    const again = await vote(slug, roundId, 'navigator', k);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    const other = await vote(slug, roundId, 'freedom', k);
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('already_voted');
    expect((await request(ctx.app).get(`/api/sessions/${slug}/state`)).body.voteCount).toBe(1);

    const voted = await request(ctx.app).post(`/api/sessions/${slug}/voted`).send({ voterKey: k });
    expect(voted.body.votedRoundIds).toEqual([roundId]);
  });

  it('параллельная отправка одного голоса не создаёт дубликатов', async () => {
    const { id, slug } = await createSession();
    const roundId = await openRound(id);
    const k = key();
    const results = await Promise.all(Array.from({ length: 8 }, () => vote(slug, roundId, 'relay', k)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.duplicate === false)).toHaveLength(1);
    expect(Number((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM votes'))!.n)).toBe(1);
  });

  it('40 одновременных участников', async () => {
    const { id, slug } = await createSession({ expectedParticipants: 40 });
    const roundId = await openRound(id);
    const opts = ['freedom', 'navigator', 'relay'];
    const res = await Promise.all(Array.from({ length: 40 }, (_, i) => vote(slug, roundId, opts[i % 3])));
    expect(res.every((r) => r.status === 200 && r.body.status === 'accepted')).toBe(true);
    const admin = (await adminGet(`/api/admin/sessions/${id}`)).body;
    expect(admin.rounds[0].voteCount).toBe(40);
  });

  it('голоса во время закрытия тура: каждый либо принят и посчитан, либо отклонён', async () => {
    const { id, slug } = await createSession();
    const roundId = await openRound(id);
    const votes = Array.from({ length: 30 }, () => vote(slug, roundId, 'relay'));
    const close = adminPost(`/api/admin/rounds/${roundId}/close`);
    const results = await Promise.all(votes);
    expect((await close).status).toBe(200);
    const accepted = results.filter((r) => r.status === 200).length;
    expect(results.every((r) => r.status === 200 || r.body.code === 'round_closed')).toBe(true);
    await adminPost(`/api/admin/rounds/${roundId}/publish`);
    const pub = (await request(ctx.app).get(`/api/sessions/${slug}/state`)).body;
    expect(pub.results[0].counts.relay).toBe(accepted);
  });

  it('недопустимый вариант и некорректный ключ отклоняются', async () => {
    const { id, slug } = await createSession();
    const roundId = await openRound(id);
    expect((await vote(slug, roundId, 'hacker')).body.code).toBe('invalid_option');
    expect((await vote(slug, roundId, 'relay', 'short')).body.code).toBe('invalid_voter_key');
    expect((await vote(slug, 'no-such-round', 'relay')).status).toBe(404);
  });

  it('во втором туре нельзя голосовать за выбывший вариант', async () => {
    const { id, slug } = await createSession();
    const r1 = await openRound(id);
    await castMany(slug, r1, { freedom: 4, navigator: 3, relay: 2 });
    await closeAndPublish(r1);
    const r2 = await openRound(id);
    const res = await vote(slug, r2, 'relay');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_option');
  });
});

describe('повестка, живое распределение и удаление', () => {
  const adminPatch = (path: string, body: object) => request(ctx.app).patch(path).set('Cookie', cookie).set('X-Veche-Admin', '1').send(body);
  const adminDelete = (path: string) => request(ctx.app).delete(path).set('Cookie', cookie).set('X-Veche-Admin', '1');

  it('повестка видна до старта и редактируется организатором', async () => {
    const { id, slug } = await createSession({ agenda: 'Что делаем с цифровыми 15 минутами?' });
    let pub = (await request(ctx.app).get(`/api/sessions/${slug}/state`)).body;
    expect(pub.session.agenda).toBe('Что делаем с цифровыми 15 минутами?');
    expect(pub.round).toBeNull();
    expect((await adminPatch(`/api/admin/sessions/${id}`, { agenda: 'Новый вопрос' })).status).toBe(200);
    pub = (await request(ctx.app).get(`/api/sessions/${slug}/state`)).body;
    expect(pub.session.agenda).toBe('Новый вопрос');
    expect((await adminPatch(`/api/admin/sessions/${id}`, { agenda: 'x'.repeat(301) })).status).toBe(400);
    const def = await createSession({ isDemo: true });
    expect((await request(ctx.app).get(`/api/sessions/${def.slug}/state`)).body.session.agenda).toContain('цифровых 15 минут');
  });

  it('при включённом режиме распределение видно всем во время тура', async () => {
    const { id, slug } = await createSession({ liveResults: true });
    const roundId = await openRound(id);
    await castMany(slug, roundId, { freedom: 1, navigator: 2, relay: 1 });
    const pub = (await request(ctx.app).get(`/api/sessions/${slug}/state`)).body;
    expect(pub.session.liveResults).toBe(true);
    expect(pub.live).toEqual({ roundId, counts: { freedom: 1, navigator: 2, relay: 1 }, percents: { freedom: 25, navigator: 50, relay: 25 }, total: 4 });
    expect((await adminGet(`/api/admin/sessions/${id}`)).body.rounds[0].counts).toEqual({ freedom: 1, navigator: 2, relay: 1 });
    await closeAndPublish(roundId);
    expect((await request(ctx.app).get(`/api/sessions/${slug}/state`)).body.live).toBeNull();
  });

  it('режим можно выключить — распределение снова скрыто', async () => {
    const { id, slug } = await createSession({ liveResults: true });
    const roundId = await openRound(id);
    await castMany(slug, roundId, { relay: 2 });
    await adminPatch(`/api/admin/sessions/${id}`, { liveResults: false });
    expect((await request(ctx.app).get(`/api/sessions/${slug}/state`)).body.live).toBeNull();
    expect((await adminGet(`/api/admin/sessions/${id}`)).body.rounds[0].counts).toBeNull();
  });

  it('организатор может удалить любую сессию вместе с голосами', async () => {
    const { id, slug } = await createSession();
    const roundId = await openRound(id);
    await castMany(slug, roundId, { relay: 2 });
    expect((await request(ctx.app).delete(`/api/admin/sessions/${id}`).set('X-Veche-Admin', '1')).status).toBe(401);
    expect((await adminDelete(`/api/admin/sessions/${id}`)).status).toBe(200);
    expect((await request(ctx.app).get(`/api/sessions/${slug}/state`)).status).toBe(404);
    expect((await adminGet('/api/admin/sessions')).body.sessions.find((s: { id: string }) => s.id === id)).toBeUndefined();
    expect(await db.get('SELECT 1 AS x FROM votes WHERE round_id = ?', [roundId])).toBeUndefined();
    expect((await adminDelete(`/api/admin/sessions/${id}`)).status).toBe(404);
  });
});

describe('скрытие результатов', () => {
  it('публичное состояние не раскрывает распределение до публикации', async () => {
    const { id, slug } = await createSession();
    const roundId = await openRound(id);
    await castMany(slug, roundId, { freedom: 3, navigator: 1, relay: 1 });
    const open = (await request(ctx.app).get(`/api/sessions/${slug}/state`)).body;
    expect(open.voteCount).toBe(5);
    expect(open.results).toEqual([]);
    expect(JSON.stringify(open)).not.toContain('counts');
    expect(open.live).toBeNull();

    // Организатор тоже не видит распределение, пока тур открыт.
    expect((await adminGet(`/api/admin/sessions/${id}`)).body.rounds[0].counts).toBeNull();

    await adminPost(`/api/admin/rounds/${roundId}/close`);
    const closed = (await request(ctx.app).get(`/api/sessions/${slug}/state`)).body;
    expect(closed.results).toEqual([]);

    await adminPost(`/api/admin/rounds/${roundId}/publish`);
    const pub = (await request(ctx.app).get(`/api/sessions/${slug}/state`)).body;
    expect(pub.results[0].counts).toEqual({ freedom: 3, navigator: 1, relay: 1 });
    expect(pub.results[0].percents).toEqual({ freedom: 60, navigator: 20, relay: 20 });
    expect(pub.results[0].outcome).toEqual({ kind: 'winner', optionId: 'freedom', majority: true });
  });

  it('публичный клиент не может прочитать сырые голоса', async () => {
    const { id, slug } = await createSession();
    const roundId = await openRound(id);
    const k = key();
    await vote(slug, roundId, 'relay', k);
    await closeAndPublish(roundId);
    const body = JSON.stringify((await request(ctx.app).get(`/api/sessions/${slug}/state`)).body);
    expect(body).not.toContain(k);
    expect(body).not.toContain('anonymous_voter_key');
    // В БД хранится только HMAC ключа.
    const stored = (await db.get<{ anonymous_voter_key: string }>('SELECT anonymous_voter_key FROM votes'))!;
    expect(stored.anonymous_voter_key).not.toContain(k);
    expect(stored.anonymous_voter_key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('полный сценарий турами', () => {
  it('победа в первом туре → решение подтверждается', async () => {
    const { id, slug } = await createSession();
    const r1 = await openRound(id);
    await castMany(slug, r1, { relay: 6, navigator: 2, freedom: 1 });
    const state = await closeAndPublish(r1);
    expect(state.next).toEqual({ kind: 'decide', optionId: 'relay' });
    // Нельзя зафиксировать не того победителя.
    expect((await adminPost(`/api/admin/sessions/${id}/decision`, { optionId: 'navigator', method: 'vote' })).status).toBe(409);
    const done = await adminPost(`/api/admin/sessions/${id}/decision`, { optionId: 'relay', method: 'vote' });
    expect(done.body.decision.optionId).toBe('relay');
    expect((await request(ctx.app).get(`/api/sessions/${slug}/state`)).body.decision.optionId).toBe('relay');
  });

  it('равенство за второе место → тай-брейк → второй тур → ничья → решение ГД', async () => {
    const { id, slug } = await createSession();
    const r1 = await openRound(id);
    await castMany(slug, r1, { freedom: 4, navigator: 2, relay: 2 });
    let s = await closeAndPublish(r1);
    expect(s.next).toEqual({ kind: 'start_round', type: 'tiebreak', eligible: ['navigator', 'relay'] });

    const r2 = await openRound(id);
    await castMany(slug, r2, { navigator: 5, relay: 3 });
    s = await closeAndPublish(r2);
    expect(s.next).toEqual({ kind: 'start_round', type: 'runoff', eligible: ['freedom', 'navigator'] });

    const r3 = await openRound(id);
    await castMany(slug, r3, { freedom: 4, navigator: 4 });
    s = await closeAndPublish(r3);
    expect(s.next).toEqual({ kind: 'tie', optionIds: ['freedom', 'navigator'] });
    // При ничьей победитель не назначается автоматически.
    expect((await adminPost(`/api/admin/sessions/${id}/decision`, { optionId: 'freedom', method: 'vote' })).status).toBe(409);

    // Переголосование возможно…
    const r4 = await openRound(id, 'repeat');
    const st = (await adminGet(`/api/admin/sessions/${id}`)).body;
    expect(st.rounds[3]).toMatchObject({ id: r4, type: 'revote', eligible: ['freedom', 'navigator'] });
    await castMany(slug, r4, { freedom: 3, navigator: 3 });
    await closeAndPublish(r4);
    // …или передача решения ГД.
    const done = await adminPost(`/api/admin/sessions/${id}/decision`, { optionId: 'navigator', method: 'ceo' });
    expect(done.status).toBe(200);
    expect(done.body.decision).toMatchObject({ optionId: 'navigator', method: 'ceo' });

    // Результаты туров хранятся раздельно.
    const pub = (await request(ctx.app).get(`/api/sessions/${slug}/state`)).body;
    expect(pub.results.map((r: { type: string }) => r.type)).toEqual(['main', 'tiebreak', 'runoff', 'revote']);
  });

  it('нельзя открыть второй тур, пока первый не опубликован', async () => {
    const { id } = await createSession();
    await openRound(id);
    expect((await adminPost(`/api/admin/sessions/${id}/rounds`, { mode: 'next' })).status).toBe(409);
  });
});

describe('демо-режим', () => {
  it('синтетические голоса только в демо, реальная сессия не затронута', async () => {
    const real = await createSession();
    const realRound = await openRound(real.id);
    await vote(real.slug, realRound, 'navigator');

    const demo = await createSession({ isDemo: true });
    await openRound(demo.id);
    const added = await adminPost(`/api/admin/sessions/${demo.id}/demo/votes`, { counts: { freedom: 10, navigator: 5, relay: 5 } });
    expect(added.body.rounds[0].voteCount).toBe(20);

    expect((await adminPost(`/api/admin/sessions/${real.id}/demo/votes`, { counts: { freedom: 10 } })).status).toBe(403);
    expect((await adminGet(`/api/admin/sessions/${real.id}`)).body.rounds[0].voteCount).toBe(1);
    // Текущая публичная сессия — реальная, не демо.
    expect((await request(ctx.app).get('/api/current')).body.slug).toBe(real.slug);

    // Защита на уровне БД.
    await expect(
      db.run(`INSERT INTO votes (id, round_id, option_id, anonymous_voter_key, is_synthetic, created_at) VALUES ('x', ?, 'relay', 'k', 1, 'now')`, [realRound]),
    ).rejects.toThrow(/synthetic_votes_demo_only/);
    await expect(db.run(`UPDATE votes SET option_id = 'freedom'`)).rejects.toThrow(/votes_are_immutable/);

    await adminPost(`/api/admin/sessions/${demo.id}/demo/reset`);
    expect((await adminGet(`/api/admin/sessions/${demo.id}`)).body.rounds).toEqual([]);
    expect((await adminGet(`/api/admin/sessions/${real.id}`)).body.rounds[0].voteCount).toBe(1);
  });
});

describe('одноразовые коды', () => {
  it('код даёт один голос в туре и не связан с именем', async () => {
    const { id, slug } = await createSession({ accessMode: 'codes' });
    const codes = (await adminPost(`/api/admin/sessions/${id}/codes`, { count: 3 })).body.codes as string[];
    expect(codes).toHaveLength(3);
    const roundId = await openRound(id);
    const send = (code: string, optionId: string) => request(ctx.app).post(`/api/sessions/${slug}/vote`).send({ roundId, optionId, code });
    expect((await send(codes[0], 'relay')).body.status).toBe('accepted');
    expect((await send(codes[0].toLowerCase().replace('-', ''), 'navigator')).body.code).toBe('already_voted');
    expect((await send('ZZZZ-ZZZZ', 'relay')).body.code).toBe('invalid_code');
    // Ключ устройства без кода не принимается.
    expect((await vote(slug, roundId, 'relay')).body.code).toBe('invalid_code');
    expect((await request(ctx.app).post(`/api/sessions/${slug}/check-code`).send({ code: codes[1] })).body.valid).toBe(true);
  });
});

describe('добровольцы и экспорт', () => {
  it('форма эстафеты доступна только после выбора эстафеты и не связана с голосом', async () => {
    const { id, slug } = await createSession();
    expect((await request(ctx.app).post(`/api/sessions/${slug}/volunteer`).send({ idea: 'x', contact: 'y' })).status).toBe(409);
    const r1 = await openRound(id);
    await castMany(slug, r1, { relay: 5, navigator: 1 });
    await closeAndPublish(r1);
    await adminPost(`/api/admin/sessions/${id}/decision`, { optionId: 'relay', method: 'vote' });
    expect((await request(ctx.app).post(`/api/sessions/${slug}/volunteer`).send({ idea: 'Бот для протоколов', contact: '@ivanov' })).status).toBe(200);

    const cols = Object.keys((await db.get('SELECT * FROM volunteer_ideas'))!);
    expect(cols).toEqual(['id', 'session_id', 'idea', 'contact', 'created_at']);

    const list = (await adminGet(`/api/admin/sessions/${id}/volunteers`)).body.volunteers;
    expect(list).toHaveLength(1);
    expect((await request(ctx.app).delete(`/api/admin/volunteers/${list[0].id}`).set('Cookie', cookie).set('X-Veche-Admin', '1')).status).toBe(200);
    expect((await adminGet(`/api/admin/sessions/${id}/volunteers`)).body.volunteers).toHaveLength(0);
  });

  it('CSV соответствует БД и не содержит ключей и контактов', async () => {
    const { id, slug } = await createSession();
    const r1 = await openRound(id);
    const k = key();
    await vote(slug, r1, 'relay', k);
    await castMany(slug, r1, { relay: 2, navigator: 1, freedom: 1 });
    await closeAndPublish(r1);
    await adminPost(`/api/admin/sessions/${id}/decision`, { optionId: 'relay', method: 'vote' });
    await request(ctx.app).post(`/api/sessions/${slug}/volunteer`).send({ idea: 'Кейс', contact: 'secret-contact@example.com' });

    const csv = (await adminGet(`/api/admin/sessions/${id}/export.csv`)).text;
    const rows = csv.replace('﻿', '').trim().split('\r\n');
    expect(rows[0]).toBe('session_id,demo,round_id,round_number,round_type,round_status,option_id,option_title,votes,share_percent,round_outcome,final_decision');
    expect(rows).toHaveLength(4);
    const relay = rows.find((r) => r.includes(',relay,'))!;
    expect(relay).toContain(',3,60,');
    expect(csv).not.toContain(k);
    expect(csv).not.toContain('secret-contact');
    const hashes = (await db.all<{ anonymous_voter_key: string }>('SELECT anonymous_voter_key FROM votes')).map((r) => r.anonymous_voter_key);
    for (const h of hashes) expect(csv).not.toContain(h);
  });

  it('журнал фиксирует действия организатора без данных участников', async () => {
    const { id, slug } = await createSession();
    const r1 = await openRound(id);
    const k = key();
    await vote(slug, r1, 'relay', k);
    await adminPost(`/api/admin/rounds/${r1}/close`);
    const log = (await adminGet(`/api/admin/audit?sessionId=${id}`)).body.entries as { action: string }[];
    expect(log.map((e) => e.action)).toEqual(['round_closed', 'round_opened', 'session_created']);
    expect(JSON.stringify(log)).not.toContain(k);
  });
});

describe('новая сессия', () => {
  it('архивирует предыдущую и закрывает её открытый тур', async () => {
    const a = await createSession();
    const r = await openRound(a.id);
    const b = await createSession();
    expect((await request(ctx.app).get('/api/current')).body.slug).toBe(b.slug);
    const res = await vote(a.slug, r, 'relay');
    expect(res.body.code).toBe('round_closed');
  });
});
});
