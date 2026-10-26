/* global document, innerWidth, innerHeight */
// Дополнительные сквозные сценарии: коды, ничья → решение ГД, переключатель живых голосов,
// правка повестки на лету, архивирование и удаление сессии, разные экраны, ошибки в консоли.
// Запуск: npm run build && node scripts/e2e-extra.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const PORT = 3998;
const BASE = `http://localhost:${PORT}`;
const PASSWORD = 'e2e-admin-password';
const OUT = 'screenshots/extra';
const dbDir = join(tmpdir(), 'veche-e2e-extra-' + Date.now());
mkdirSync(OUT, { recursive: true });

const server = spawn('node', ['dist/server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: join(dbDir, 'e2e.db'), ADMIN_PASSWORD: PASSWORD, APP_SECRET: 'f'.repeat(40), NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('запущено') && resolve()));

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

const consoleErrors = [];
const watch = (page, label) => {
  page.on('pageerror', (e) => consoleErrors.push(`${label}: ${e.message}`));
  page.on('console', (m) => {
    // 404 у удалённой сессии и обрывы потока при удалении/перезапуске — ожидаемы.
    if (m.type() === 'error' && !/404|ERR_|EventSource|Failed to load resource/.test(m.text())) consoleErrors.push(`${label}: ${m.text()}`);
  });
  return page;
};

const apiVote = async (slug, roundId, optionId, extra = {}) => {
  const r = await fetch(`${BASE}/api/sessions/${slug}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundId, optionId, voterKey: randomBytes(32).toString('base64url'), ...extra }),
  });
  return { status: r.status, body: await r.json() };
};
const castMany = async (slug, plan) => {
  const roundId = (await publicState(slug)).round.id;
  for (const [opt, n] of Object.entries(plan)) for (let i = 0; i < n; i++) await apiVote(slug, roundId, opt);
};
const publicState = async (slug) => (await fetch(`${BASE}/api/sessions/${slug}/state`)).json();

/** Нет горизонтальной прокрутки и ничего не вылезает за правый край. */
const noOverflow = (page) =>
  page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const sw = document.scrollingElement.scrollWidth;
    return { ok: sw <= w + 1, w, sw };
  });

let failPages = [];
try {
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const admin = watch(await adminCtx.newPage(), 'admin');
  failPages.push(['admin', admin]);
  await admin.goto(`${BASE}/admin`);
  await admin.getByLabel('Пароль').fill(PASSWORD);
  await admin.getByRole('button', { name: 'Войти' }).click();
  await admin.getByText('Создайте первую сессию').waitFor();

  const newSession = async ({ codes = false, live = true, expected = '10' } = {}) => {
    await admin.getByRole('button', { name: 'Новая сессия' }).first().click();
    const dialog = admin.getByRole('dialog');
    await dialog.getByLabel('Ожидаемое число участников').fill(expected);
    const liveBox = dialog.getByRole('checkbox', { name: /Голоса в реальном времени/ });
    const codesBox = dialog.getByRole('checkbox', { name: /Вход по одноразовым кодам/ });
    if (!((await codesBox.isChecked()) === false && (await liveBox.isChecked()) === true)) check('форма новой сессии открывается с настройками по умолчанию', false);
    if (codes) await codesBox.click();
    if (!live) await liveBox.click();
    await dialog.getByRole('button', { name: 'Создать' }).click();
    await admin.getByRole('button', { name: 'Начать голосование' }).waitFor();
    await sleep(300);
    return (await (await fetch(`${BASE}/api/current`)).json()).slug;
  };
  const closeAndPublish = async () => {
    await admin.getByRole('button', { name: 'Завершить голосование' }).click();
    await admin.getByRole('button', { name: 'Завершить', exact: true }).click();
    await admin.getByRole('button', { name: 'Показать результаты' }).click();
  };

  // ================= 1. Повестка на лету + разные экраны + выключенные живые голоса =================
  const slugA = await newSession({ live: false, expected: '12' });
  const hallCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const hall = watch(await hallCtx.newPage(), 'hall');
  failPages.push(['hall', hall]);
  await hall.goto(`${BASE}/hall/${slugA}`);
  await hall.getByText('Какой формат «цифровых 15 минут» выбираем дальше?').waitFor();

  // Правка вопроса в админке → экран зала и телефоны обновляются без перезагрузки.
  const newQuestion = 'Как проводим «цифровые 15 минут» в следующем квартале?';
  await admin.getByLabel('Вопрос, выносимый на вече').fill(newQuestion);
  await admin.getByRole('button', { name: 'Сохранить вопрос' }).click();
  await hall.getByText(newQuestion).waitFor({ timeout: 5000 });
  check('правка повестки сразу видна на экране зала (без перезагрузки)', true);

  const phones = {
    'android-360': { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    'iphone-se': devices['iPhone SE'],
    'iphone-13': devices['iPhone 13'],
    'pixel-7': devices['Pixel 7'],
    'ipad-mini': devices['iPad Mini'],
  };
  const phonePages = {};
  for (const [name, dev] of Object.entries(phones)) {
    const ctx = await browser.newContext({ ...dev });
    const p = watch(await ctx.newPage(), name);
    await p.goto(`${BASE}/s/${slugA}`);
    await p.getByText(newQuestion).waitFor();
    phonePages[name] = p;
  }
  const overflowAll = async (stage) => {
    const bad = [];
    for (const [name, p] of Object.entries(phonePages)) {
      const r = await noOverflow(p);
      if (!r.ok) bad.push(`${name} ${r.sw}>${r.w}`);
    }
    check(`нет горизонтальной прокрутки на 5 устройствах: ${stage}`, bad.length === 0, bad.join(', '));
  };
  await overflowAll('повестка');
  await shot(phonePages['android-360'], 'a1-android-agenda');
  await shot(phonePages['iphone-se'], 'a2-se-agenda');

  // Кнопка «Смотреть варианты» прокручивает к вариантам.
  const se = phonePages['iphone-se'];
  await se.getByRole('link', { name: /Смотреть варианты/ }).click();
  await sleep(600);
  check('кнопка «Смотреть варианты» ведёт к вариантам', await se.getByRole('heading', { name: 'Варианты' }).isVisible());

  await admin.getByRole('button', { name: 'Начать голосование' }).click();
  for (const p of Object.values(phonePages)) await p.getByText('Ваш голос имеет значение').waitFor({ timeout: 6000 });
  check('все 5 устройств переключились на голосование', true);
  await overflowAll('форма голосования');
  await shot(phonePages['android-360'], 'a3-android-form');

  // Голосуем с каждого устройства.
  const picks = ['Цифровая свобода', 'Цифровой навигатор', 'Цифровая эстафета', 'Цифровая эстафета', 'Цифровой навигатор'];
  let i = 0;
  for (const p of Object.values(phonePages)) {
    await p.getByRole('radio', { name: new RegExp(picks[i++]) }).click();
    await p.getByRole('button', { name: 'Отдать голос' }).click();
    await p.getByRole('button', { name: 'Подтвердить' }).click();
    await p.getByText('Ваш голос принят!').waitFor();
  }
  check('голос принят со всех 5 устройств', true);
  await overflowAll('голос принят');

  // Живые голоса выключены: распределение скрыто везде.
  let st = await publicState(slugA);
  check('живые голоса выключены → распределение не передаётся', st.live === null && st.voteCount === 5);
  await hall.getByText('Скрыто').waitFor();
  check('экран зала: «Распределение скрыто»', !(await hall.getByText('Голоса в реальном времени').isVisible()));
  check('телефон: «Результаты скрыты до завершения тура»', await se.getByText('Результаты скрыты до завершения тура').isVisible());

  // Включаем в админке → появляется на зале и телефоне без перезагрузки.
  await admin.getByRole('checkbox', { name: /Голоса в реальном времени/ }).click();
  await hall.getByText('Голоса в реальном времени').waitFor({ timeout: 5000 });
  await se.getByText('Голоса в реальном времени').waitFor({ timeout: 5000 });
  st = await publicState(slugA);
  check('включение живых голосов срабатывает сразу (зал + телефон)', st.live?.total === 5, JSON.stringify(st.live?.counts));
  await shot(hall, 'a4-hall-live');
  await shot(se, 'a5-se-live');

  // Живые голоса обновляются по мере голосования.
  await castMany(slugA, { relay: 3 });
  await hall.getByText('5 голосов').first().waitFor({ timeout: 5000 });
  check('живое распределение растёт на экране зала по мере голосов', true);
  await overflowAll('живые голоса');

  // Итоги: 1 / 2 / 5 → эстафета побеждает (5 из 8 > 50%).
  await closeAndPublish();
  await hall.getByText('ИТ-вече завершено').waitFor();
  await se.getByText('Победа «Цифровая эстафета»', { exact: false }).or(se.getByText('Цифровая эстафета').first()).waitFor();
  await overflowAll('итоги');
  st = await publicState(slugA);
  check('победа в первом туре (>50%)', st.results[0].outcome.kind === 'winner' && st.results[0].outcome.optionId === 'relay', JSON.stringify(st.results[0].counts));
  await sleep(3500);
  await shot(hall, 'a6-hall-results');
  await shot(phonePages['android-360'], 'a7-android-results');

  await admin.getByRole('button', { name: 'Зафиксировать решение' }).click();
  await admin.getByRole('button', { name: 'Зафиксировать', exact: true }).click();
  await hall.getByText('Решение принято').first().waitFor();
  for (const p of Object.values(phonePages)) await p.getByRole('button', { name: 'У меня есть кейс!' }).waitFor();
  check('решение видно на зале и всех телефонах', true);
  await overflowAll('решение');
  await shot(phonePages['android-360'], 'a8-android-decision');

  // Экран зала на разных пропорциях: сцена масштабируется и не обрезается.
  for (const [w, h] of [
    [1280, 720],
    [1024, 768],
    [3840, 2160],
  ]) {
    await hall.setViewportSize({ width: w, height: h });
    await sleep(300);
    const r = await hall.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, sh: document.scrollingElement.scrollHeight, w: innerWidth, h: innerHeight }));
    check(`экран зала ${w}×${h}: без прокрутки`, r.sw <= r.w + 1 && r.sh <= r.h + 1, JSON.stringify(r));
  }
  await shot(hall, 'a9-hall-4k-decision');
  await hall.setViewportSize({ width: 1920, height: 1080 });

  // ================= 2. Коды, ничья → решение ГД, архивирование =================
  const oldPhone = phonePages['iphone-13'];
  const slugB = await newSession({ codes: true, live: true, expected: '6' });
  await sleep(1500);
  check('у прошлой сессии с принятым решением телефон продолжает показывать решение', await oldPhone.getByRole('button', { name: 'У меня есть кейс!' }).isVisible());

  await admin.getByLabel('Количество кодов').fill('6');
  await admin.getByRole('button', { name: 'Создать коды' }).click();
  await admin.locator('#codes-print span').first().waitFor();
  const codes = await admin.locator('#codes-print span').allInnerTexts();
  check('админка выдала 6 одноразовых кодов', codes.length === 6, codes.join(' '));

  await hall.goto(`${BASE}/hall/${slugB}`);
  const p1Ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p1 = watch(await p1Ctx.newPage(), 'code-phone-1');
  await p1.goto(`${BASE}/s/${slugB}`);
  await admin.getByRole('button', { name: 'Начать голосование' }).click();
  await p1.getByText('Введите код участника').waitFor();
  await p1.getByPlaceholder('ABCD-EFGH').fill('ZZZZ-ZZZZ');
  await p1.getByRole('button', { name: 'Продолжить' }).click();
  await p1.getByText('Код не найден', { exact: false }).waitFor();
  check('неверный код отклоняется', true);
  await p1.getByPlaceholder('ABCD-EFGH').fill(codes[0].toLowerCase());
  await p1.getByRole('button', { name: 'Продолжить' }).click();
  await p1.getByRole('radio', { name: /Цифровой навигатор/ }).click();
  await p1.getByRole('button', { name: 'Отдать голос' }).click();
  await p1.getByRole('button', { name: 'Подтвердить' }).click();
  await p1.getByText('Ваш голос принят!').waitFor();
  check('голос по коду принят (регистр кода не важен)', true);

  // Тот же код на другом телефоне — второй голос не принимается.
  const p2Ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const p2 = watch(await p2Ctx.newPage(), 'code-phone-2');
  await p2.goto(`${BASE}/s/${slugB}`);
  await p2.getByPlaceholder('ABCD-EFGH').fill(codes[0]);
  await p2.getByRole('button', { name: 'Продолжить' }).click();
  await p2.getByText('Вы уже проголосовали').waitFor({ timeout: 6000 });
  check('тот же код на другом устройстве → «Вы уже проголосовали»', true);
  const noCode = await apiVote(slugB, (await publicState(slugB)).round.id, 'relay');
  check('без кода голос в режиме кодов не принимается', noCode.status >= 400, String(noCode.status));

  // Остальные коды: 1 / 2 / 2 (+навигатор от p1) → нет большинства, второй тур навигатор/эстафета.
  const r1 = (await publicState(slugB)).round.id;
  for (const [c, o] of [
    [codes[1], 'freedom'],
    [codes[2], 'navigator'],
    [codes[3], 'relay'],
    [codes[4], 'relay'],
  ])
    await apiVote(slugB, r1, o, { code: c });
  await closeAndPublish();
  await admin.getByRole('button', { name: 'Запустить второй тур' }).click();
  await p1.getByText('Второй тур').first().waitFor();
  check('во втором туре два финалиста', (await p1.getByRole('radio').count()) === 2);
  // Ничья 2:2.
  const r2 = (await publicState(slugB)).round.id;
  for (const [c, o] of [
    [codes[0], 'navigator'],
    [codes[1], 'navigator'],
    [codes[2], 'relay'],
    [codes[3], 'relay'],
  ])
    await apiVote(slugB, r2, o, { code: c });
  await closeAndPublish();
  await admin.getByRole('button', { name: 'Переголосовать' }).waitFor();
  st = await publicState(slugB);
  check('ничья во втором туре: победитель не назначен автоматически', st.results[1].outcome.kind === 'tie' && !st.decision);
  await sleep(3500);
  await shot(hall, 'b1-hall-tie');
  await admin.getByRole('button', { name: 'ГД выбрал «Цифровой навигатор»' }).click();
  await admin.getByRole('button', { name: 'Зафиксировать', exact: true }).click();
  await hall.getByText('Решение генерального директора после равенства голосов').waitFor();
  check('решение ГД после ничьей показано на экране зала', true);
  await sleep(3500);
  await shot(hall, 'b2-hall-ceo-decision');
  check('форма «У меня есть кейс!» не показывается, если выбрана не эстафета', !(await p1.getByRole('button', { name: 'У меня есть кейс!' }).isVisible()));

  // ================= 3. Тай-брейк на реальной сессии =================
  const slugC = await newSession({ live: true, expected: '21' });
  await hall.goto(`${BASE}/hall/${slugC}`);
  await admin.getByRole('button', { name: 'Начать голосование' }).click();
  await castMany(slugC, { freedom: 6, navigator: 9, relay: 6 });
  await closeAndPublish();
  await admin.getByRole('button', { name: 'Запустить тай-брейк' }).click();
  st = await publicState(slugC);
  check('равенство за 2-е место → тай-брейк между freedom/relay', st.round.type === 'tiebreak' && st.round.eligible.join() === 'freedom,relay', st.round.eligible.join());
  await castMany(slugC, { freedom: 4, relay: 7 });
  await closeAndPublish();
  await admin.getByRole('button', { name: 'Запустить второй тур' }).click();
  st = await publicState(slugC);
  check('после тай-брейка второй тур: navigator/relay', st.round.type === 'runoff' && st.round.eligible.join() === 'navigator,relay', st.round.eligible.join());
  await castMany(slugC, { navigator: 12, relay: 9 });
  await closeAndPublish();
  await admin.getByRole('button', { name: 'Зафиксировать решение' }).click();
  await admin.getByRole('button', { name: 'Зафиксировать', exact: true }).click();
  await hall.getByText('Решение принято').first().waitFor();
  st = await publicState(slugC);
  check('итог после тай-брейка и второго тура: навигатор', st.decision?.optionId === 'navigator');

  // CSV по этой сессии
  const sessions = (await (await adminCtx.request.get(`${BASE}/api/admin/sessions`)).json()).sessions;
  const idC = sessions.find((s) => s.slug === slugC).id;
  const csv = await (await adminCtx.request.get(`${BASE}/api/admin/sessions/${idC}/export.csv`)).text();
  check('CSV содержит все 3 тура', csv.includes('tiebreak') && csv.includes('runoff') && csv.includes('main'));

  // ================= 4. Архивирование и удаление открытой сессии =================
  const slugD = await newSession({ live: true });
  const dPhone = watch(await (await browser.newContext({ ...devices['iPhone 13'] })).newPage(), 'archive-phone');
  await dPhone.goto(`${BASE}/s/${slugD}`);
  await admin.getByRole('button', { name: 'Начать голосование' }).click();
  await dPhone.getByText('Ваш голос имеет значение').waitFor();
  const roundD = (await publicState(slugD)).round.id;
  const slugE = await newSession({ live: true });
  await dPhone.getByText('Эта сессия завершена').waitFor({ timeout: 8000 });
  check('новая сессия архивирует прошлую: телефон показывает «Эта сессия завершена»', true);
  const lateVote = await apiVote(slugD, roundD, 'relay');
  check('в архивную сессию проголосовать нельзя', lateVote.status === 409, String(lateVote.status));

  await hall.goto(`${BASE}/hall/${slugE}`);
  const ePhone = watch(await (await browser.newContext({ ...devices['iPhone 13'] })).newPage(), 'delete-phone');
  await ePhone.goto(`${BASE}/s/${slugE}`);
  await admin.getByRole('button', { name: 'Начать голосование' }).click();
  await ePhone.getByText('Ваш голос имеет значение').waitFor();
  await admin.getByRole('button', { name: 'Удалить вече' }).click();
  await admin.getByText('Сейчас идёт голосование — оно прервётся.').waitFor();
  await admin.getByRole('button', { name: 'Удалить навсегда' }).click();
  await hall.getByText('Сессия не найдена', { exact: false }).waitFor({ timeout: 10000 });
  await ePhone.getByText('Сессия не найдена').waitFor({ timeout: 10000 });
  check('удаление открытой сессии: зал и телефон показывают «Сессия не найдена»', true);
  const left = (await (await adminCtx.request.get(`${BASE}/api/admin/sessions`)).json()).sessions;
  check('остальные сессии не затронуты', !left.some((s) => s.slug === slugE) && [slugA, slugB, slugC, slugD].every((x) => left.some((s) => s.slug === x)));
  const dl = await fetch(`${BASE}/api/admin/sessions/${idC}`, { method: 'DELETE', headers: { 'X-Veche-Admin': '1' } });
  check('удаление без входа запрещено', dl.status === 401);

  // ================= 5. Стартовая страница без активной сессии =================
  await admin.getByRole('button', { name: 'Удалить вече' }).waitFor();
  const home = watch(await (await browser.newContext({ ...devices['iPhone SE'] })).newPage(), 'home');
  await home.goto(`${BASE}/`);
  await home.getByText('ИТ-вече ещё не открыто').waitFor();
  check('без открытой сессии корень показывает «ИТ-вече ещё не открыто»', (await noOverflow(home)).ok);
  await shot(home, 'c1-home-empty');

  check('форма новой сессии каждый раз открывается с настройками по умолчанию', !results.some((r) => r.name.startsWith('форма новой сессии') && !r.ok));
  check('нет ошибок JavaScript в консоли', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
} catch (e) {
  console.error(e);
  for (const [n, p] of failPages) await shot(p, 'zz-fail-' + n).catch(() => undefined);
  check('сценарий выполнен без исключений', false, String(e).slice(0, 300));
} finally {
  await browser.close();
  server.kill();
  rmSync(dbDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено. Скриншоты: ${OUT}/`);
process.exit(failed.length ? 1 : 0);
