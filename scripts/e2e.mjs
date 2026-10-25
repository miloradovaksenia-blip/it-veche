// Сквозная проверка в настоящем браузере + скриншоты ключевых экранов.
// Запуск: npm run build && npm run e2e   (нужен установленный Playwright с Chromium)
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const PASSWORD = 'e2e-admin-password';
const OUT = 'screenshots';
const dbDir = join(tmpdir(), 'veche-e2e-' + Date.now());
mkdirSync(OUT, { recursive: true });

const server = spawn('node', ['dist/server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: join(dbDir, 'e2e.db'), ADMIN_PASSWORD: PASSWORD, APP_SECRET: 'e'.repeat(40), NODE_ENV: 'development' },
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
const iphone = devices['iPhone 13'];
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

// Голос «другого участника» напрямую через API.
const apiVote = async (slug, roundId, optionId) => {
  const r = await fetch(`${BASE}/api/sessions/${slug}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundId, optionId, voterKey: randomBytes(32).toString('base64url') }),
  });
  return r.json();
};
const publicState = async (slug) => (await fetch(`${BASE}/api/sessions/${slug}/state`)).json();

try {
  // ---------- организатор ----------
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const admin = await adminCtx.newPage();
  await admin.goto(`${BASE}/admin`);
  await admin.getByLabel('Пароль').fill('wrong');
  await admin.getByRole('button', { name: 'Войти' }).click();
  await admin.getByText('Неверный пароль').waitFor({ timeout: 3000 });
  check('неверный пароль отклоняется', true);
  await admin.getByLabel('Пароль').fill(PASSWORD);
  await admin.getByRole('button', { name: 'Войти' }).click();
  await admin.getByText('Создайте первую сессию').waitFor();
  await admin.getByRole('button', { name: 'Новая сессия' }).first().click();
  await admin.getByLabel('Ожидаемое число участников').fill('14');
  await admin.getByRole('button', { name: 'Создать' }).click();
  await admin.getByRole('button', { name: 'Начать голосование' }).waitFor();
  const slug = (await (await fetch(`${BASE}/api/current`)).json()).slug;
  check('сессия создана', !!slug, slug);
  await shot(admin, '05-admin-ready');

  // ---------- экран зала ----------
  const hallCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const hall = await hallCtx.newPage();
  await hall.goto(`${BASE}/hall/${slug}`);
  await hall.getByText('Будущее цифровых 15 минут').waitFor();
  await sleep(1500);
  await shot(hall, '01-hall-intro');

  // ---------- телефон участника ----------
  const phoneCtx = await browser.newContext({ ...iphone });
  const phone = await phoneCtx.newPage();
  await phone.goto(`${BASE}/s/${slug}`);
  await phone.getByText('Голосование скоро начнётся', { exact: false }).waitFor();
  await shot(phone, '10-phone-before-start');

  // Второй телефон загрузит форму, а проголосовать попытается после закрытия тура.
  const lateCtx = await browser.newContext({ ...iphone });
  const late = await lateCtx.newPage();
  await late.goto(`${BASE}/s/${slug}`);

  // Третий телефон — потеря сети.
  const offCtx = await browser.newContext({ ...iphone });
  const off = await offCtx.newPage();
  await off.goto(`${BASE}/s/${slug}`);

  await admin.getByRole('button', { name: 'Начать голосование' }).click();
  await phone.getByText('Ваш голос имеет значение').waitFor({ timeout: 5000 });
  check('телефон получил открытие тура без перезагрузки (realtime)', true);
  await shot(phone, '11-phone-vote-form');

  await phone.getByRole('radio', { name: /Цифровая эстафета/ }).click();
  await shot(phone, '12-phone-selected');
  await phone.getByRole('button', { name: 'Отдать голос' }).click();
  await phone.getByText('Вы выбираете «Цифровая эстафета»').waitFor();
  await shot(phone, '13-phone-confirm');
  // Двойное нажатие на «Подтвердить».
  await phone.getByRole('button', { name: 'Подтвердить' }).dblclick();
  await phone.getByText('Ваш голос принят!').waitFor();
  await shot(phone, '14-phone-accepted');

  // Потеря сети: ложного подтверждения быть не должно.
  await off.getByRole('radio', { name: /Цифровой навигатор/ }).click();
  await off.getByRole('button', { name: 'Отдать голос' }).click();
  await offCtx.setOffline(true);
  await off.getByRole('button', { name: 'Подтвердить' }).click();
  await off.getByText('Голос НЕ отправлен', { exact: false }).waitFor();
  check('без сети нет ложного «Голос принят»', !(await off.getByText('Ваш голос принят!').isVisible()));
  await sleep(500);
  await shot(off, '15-phone-offline');
  await offCtx.setOffline(false);
  await off.getByRole('button', { name: 'Отправить ещё раз' }).click();
  await off.getByText('Ваш голос принят!').waitFor();
  check('после восстановления сети голос отправлен повторно', true);

  // Остальные участники.
  let st = await publicState(slug);
  const r1 = st.round.id;
  for (const [opt, n] of [['freedom', 3], ['navigator', 4], ['relay', 3]]) for (let i = 0; i < n; i++) await apiVote(slug, r1, opt);
  st = await publicState(slug);
  check('счётчик: 12 голосов, распределение скрыто', st.voteCount === 12 && st.results.length === 0, `voteCount=${st.voteCount}`);
  await hall.getByText('Голосование идёт').waitFor();
  await hall.locator('text=12').first().waitFor({ timeout: 5000 });
  check('экран зала обновил счётчик в реальном времени', true);
  await sleep(600);
  await shot(hall, '02-hall-voting');
  await shot(admin, '06-admin-voting');

  // Повторное открытие — «Вы уже проголосовали».
  await phone.reload();
  await phone.getByText('Вы уже проголосовали').waitFor();
  check('повторное открытие показывает «Вы уже проголосовали»', true);
  await shot(phone, '16-phone-already-voted');

  // Опоздавший выбирает, но тур закрывают до отправки.
  await late.getByRole('radio', { name: /Цифровая свобода/ }).click();
  await late.getByRole('button', { name: 'Отдать голос' }).click();

  await admin.getByRole('button', { name: 'Завершить голосование' }).click();
  await admin.getByRole('button', { name: 'Завершить', exact: true }).click();
  await admin.getByRole('button', { name: 'Показать результаты' }).waitFor();
  await shot(admin, '07-admin-preview');

  await late.getByRole('button', { name: 'Подтвердить' }).click().catch(() => undefined);
  await sleep(800);
  const lateText = await late.locator('body').innerText();
  check('закрытый тур: голос не принят, ложного подтверждения нет', !lateText.includes('Ваш голос принят') , lateText.includes('Тур уже закрыт') ? 'показано «Тур уже закрыт»' : 'форма скрыта (тур завершён)');

  await hall.getByText('Голосование завершено').waitFor();
  await shot(hall, '03a-hall-closed');
  check('после закрытия публичные результаты всё ещё скрыты', (await publicState(slug)).results.length === 0);

  await admin.getByRole('button', { name: 'Показать результаты' }).click();
  await hall.getByText('IT-вече завершено').waitFor();
  await sleep(4200);
  await shot(hall, '03-hall-results-round1');
  await phone.getByText('Абсолютного большинства нет').waitFor();
  await sleep(1200);
  await shot(phone, '17-phone-results');
  st = await publicState(slug);
  const p = st.results[0].percents;
  check('проценты в сумме 100', p.freedom + p.navigator + p.relay === 100, JSON.stringify(p));
  check('нет большинства → второй тур navigator/relay', st.results[0].outcome.kind === 'runoff' && st.results[0].outcome.finalists.join() === 'navigator,relay');

  // Второй тур.
  await admin.getByRole('button', { name: 'Запустить второй тур' }).click();
  await phone.getByText('Второй тур').first().waitFor();
  await phone.getByRole('radio').first().waitFor();
  check('во втором туре только два варианта', (await phone.getByRole('radio').count()) === 2);
  await shot(phone, '18-phone-runoff');
  await phone.getByRole('radio', { name: /Цифровая эстафета/ }).click();
  await phone.getByRole('button', { name: 'Отдать голос' }).click();
  await phone.getByRole('button', { name: 'Подтвердить' }).click();
  await phone.getByText('Ваш голос принят!').waitFor();
  st = await publicState(slug);
  const r2 = st.round.id;
  for (const [opt, n] of [['navigator', 5], ['relay', 6]]) for (let i = 0; i < n; i++) await apiVote(slug, r2, opt);
  const bad = await apiVote(slug, r2, 'freedom');
  check('голос за выбывший вариант отклонён', bad.code === 'invalid_option');
  await sleep(400);
  await shot(hall, '04a-hall-runoff-voting');

  await admin.getByRole('button', { name: 'Завершить голосование' }).click();
  await admin.getByRole('button', { name: 'Завершить', exact: true }).click();
  await admin.getByRole('button', { name: 'Показать результаты' }).click();
  await hall.getByText('Второй тур завершён').waitFor();
  await sleep(4200);
  await shot(hall, '04b-hall-results-runoff');

  await admin.getByRole('button', { name: 'Зафиксировать решение' }).click();
  await admin.getByRole('button', { name: 'Зафиксировать', exact: true }).click();
  await hall.getByText('Решение принято').first().waitFor();
  await sleep(4000);
  await shot(hall, '04-hall-decision-relay');
  await shot(admin, '08-admin-decided');

  await phone.getByRole('button', { name: 'У меня есть кейс!' }).waitFor();
  await sleep(800);
  await shot(phone, '19-phone-decision');
  await phone.getByRole('button', { name: 'У меня есть кейс!' }).click();
  await phone.getByLabel('Какой кейс хотите показать?').fill('Как я собираю протокол совещания за 3 минуты с помощью ИИ');
  await phone.getByLabel('Как с вами связаться?').fill('Иван, внутр. 1234');
  await shot(phone, '20-phone-volunteer-form');
  await phone.getByRole('button', { name: 'Отправить' }).click();
  await phone.getByText('Спасибо! Организатор свяжется с вами.').waitFor();
  check('заявка добровольца отправлена', true);

  await admin.getByText('Как я собираю протокол').waitFor({ timeout: 5000 });
  check('организатор видит заявку', true);

  // CSV
  const sessions = await (await adminCtx.request.get(`${BASE}/api/admin/sessions`)).json();
  const csv = await (await adminCtx.request.get(`${BASE}/api/admin/sessions/${sessions.sessions[0].id}/export.csv`)).text();
  check('CSV без контактов добровольцев', !csv.includes('1234') && csv.includes('relay'));

  // ---------- демо ----------
  await admin.getByRole('button', { name: 'Демо' }).click();
  await admin.getByRole('button', { name: 'Создать' }).click();
  await admin.getByText('Демо-инструменты').waitFor();
  await admin.getByRole('button', { name: 'Начать голосование' }).click();
  await admin.getByRole('button', { name: 'Равенство за 2-е место' }).click();
  await admin.getByText('21 голос', { exact: false }).first().waitFor();
  await admin.getByRole('button', { name: 'Завершить голосование' }).click();
  await admin.getByRole('button', { name: 'Завершить', exact: true }).click();
  await admin.getByRole('button', { name: 'Показать результаты' }).click();
  await admin.getByRole('button', { name: 'Запустить тай-брейк' }).waitFor();
  check('демо: равенство за 2-е место → тай-брейк', true);
  await shot(admin, '09-admin-demo-tiebreak');
  const realAfter = await publicState(slug);
  check('демо не затронуло реальную сессию', realAfter.results.length === 2 && realAfter.decision.optionId === 'relay');
  check('корневая ссылка ведёт на реальную сессию', (await (await fetch(`${BASE}/api/current`)).json()).slug === slug);

  // Доступ без входа
  const anon = await fetch(`${BASE}/api/admin/sessions`);
  check('админ-API без входа недоступно', anon.status === 401);
} catch (e) {
  console.error(e);
  check('сценарий выполнен без исключений', false, String(e));
} finally {
  await browser.close();
  server.kill();
  rmSync(dbDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено. Скриншоты: ${OUT}/`);
process.exit(failed.length ? 1 : 0);
