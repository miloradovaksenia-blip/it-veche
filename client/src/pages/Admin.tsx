import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FlaskConical,
  Gavel,
  KeyRound,
  LogOut,
  MonitorPlay,
  Play,
  Plus,
  Printer,
  RotateCcw,
  Smartphone,
  Square,
  Trash2,
  Users,
} from 'lucide-react';
import { getOption, type OptionId } from '../../../shared/options';
import type { AdminRound, AdminSessionSummary, AdminState } from '../../../shared/types';
import { ApiError, api, store } from '../lib/api';
import { useLive, usePublicBaseUrl } from '../lib/live';
import { accentStyles } from '../lib/accent';
import { outcomeDetail, outcomeHeadline, roundLabel, title, votesWord } from '../lib/text';
import { Backdrop, Button, ConnectionBanner, DemoBadge, Logo, Modal, OptionIcon, QrCode, Spinner } from '../components/ui';

export default function Admin() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    document.title = 'IT-ВЕЧЕ · организатор';
    api
      .get<{ admin: boolean }>('/api/admin/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(false));
  }, []);
  if (admin === null) return <Spinner />;
  return admin ? <Dashboard onLogout={() => setAdmin(false)} /> : <Login onSuccess={() => setAdmin(true)} />;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/admin/login', { password });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <Backdrop intensity={0.7} />
      <form onSubmit={submit} className="glass w-full max-w-sm rounded-3xl p-7">
        <Logo />
        <h1 className="mt-6 font-display text-2xl font-semibold">Вход организатора</h1>
        <label htmlFor="password" className="mt-5 block text-sm font-semibold text-white/70">
          Пароль
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-2xl border border-white/15 bg-ink-900 px-4 py-3"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-coral-soft">
            {error}
          </p>
        )}
        <Button type="submit" className="mt-5 w-full" loading={busy} disabled={!password}>
          Войти
        </Button>
      </form>
    </div>
  );
}

interface Confirm {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<unknown>;
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [sessions, setSessions] = useState<AdminSessionSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(() => store.get('veche:admin:session'));
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [newOpen, setNewOpen] = useState<false | 'real' | 'demo'>(false);

  const loadSessions = useCallback(async () => {
    const r = await api.admin.get<{ sessions: AdminSessionSummary[] }>('/api/admin/sessions');
    setSessions(r.sessions);
    setSelected((cur) => {
      if (cur && r.sessions.some((s) => s.id === cur)) return cur;
      const pick = r.sessions.find((s) => !s.isDemo && s.status !== 'archived') ?? r.sessions[0];
      return pick?.id ?? null;
    });
  }, []);

  useEffect(() => {
    loadSessions().catch((e) => {
      if (e instanceof ApiError && e.status === 401) onLogout();
    });
  }, [loadSessions, onLogout]);

  useEffect(() => {
    if (selected) store.set('veche:admin:session', selected);
  }, [selected]);

  const live = useLive<AdminState>(selected ? `/api/admin/sessions/${selected}/stream` : null, selected ? `/api/admin/sessions/${selected}` : null);
  const state = live.data && live.data.session.id === selected ? live.data : null;

  const notify = (text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 3500);
  };

  /** Выполнить действие; результат подтягивается через realtime и сразу из ответа. */
  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && typeof res === 'object' && 'session' in (res as object)) live.setData(res as AdminState);
      else void live.refresh();
      if (okText) notify(okText);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Ошибка', true);
    } finally {
      setBusy(false);
    }
  };

  const ask = (c: Confirm) => setConfirm(c);

  if (!sessions) return <Spinner />;

  return (
    <div className="min-h-screen">
      <Backdrop intensity={0.5} />
      <ConnectionBanner connection={selected ? live.connection : 'live'} />
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-center gap-3">
          <Logo />
          <span className="text-white/40">·</span>
          <span className="font-semibold text-white/70">Панель организатора</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {sessions.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-white/60">
                <span className="sr-only sm:not-sr-only">Сессия</span>
                <select
                  value={selected ?? ''}
                  onChange={(e) => setSelected(e.target.value)}
                  className="max-w-[260px] rounded-xl border border-white/15 bg-ink-850 px-3 py-2.5 text-white"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.isDemo ? '[DEMO] ' : ''}
                      {s.title} · {new Date(s.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {s.status === 'archived' ? ' (архив)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button variant="secondary" onClick={() => setNewOpen('real')}>
              <Plus className="h-4 w-4" aria-hidden /> Новая сессия
            </Button>
            <Button variant="secondary" onClick={() => setNewOpen('demo')}>
              <FlaskConical className="h-4 w-4" aria-hidden /> Демо
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await api.post('/api/admin/logout');
                onLogout();
              }}
              aria-label="Выйти"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </header>

        {!selected ? (
          <div className="glass mx-auto mt-16 max-w-lg rounded-3xl p-8 text-center">
            <h1 className="font-display text-2xl font-semibold">Создайте первую сессию</h1>
            <p className="mt-2 text-white/65">Сессия — это одно IT-вече: ссылка, QR-код и туры голосования.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={() => setNewOpen('real')}>
                <Plus className="h-4 w-4" aria-hidden /> Новая сессия
              </Button>
              <Button variant="secondary" onClick={() => setNewOpen('demo')}>
                <FlaskConical className="h-4 w-4" aria-hidden /> Демо-сессия
              </Button>
            </div>
          </div>
        ) : !state ? (
          <Spinner />
        ) : (
          <SessionView state={state} busy={busy} run={run} ask={ask} reloadSessions={loadSessions} onDeleted={() => setSelected(null)} />
        )}
      </div>

      <NewSessionModal
        mode={newOpen}
        onClose={() => setNewOpen(false)}
        hasActive={!!sessions.find((s) => !s.isDemo && s.status !== 'archived')}
        onCreate={async (body) => {
          const r = await api.admin.post<{ id: string }>('/api/admin/sessions', body);
          setNewOpen(false);
          await loadSessions();
          setSelected(r.id);
          notify(body.isDemo ? 'Демо-сессия создана' : 'Сессия создана');
        }}
      />

      <Modal open={!!confirm} onClose={() => !busy && setConfirm(null)} title={confirm?.title ?? ''}>
        {confirm && (
          <>
            <div className="text-white/75">{confirm.body}</div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
                Отмена
              </Button>
              <Button
                variant={confirm.danger ? 'danger' : 'primary'}
                loading={busy}
                data-autofocus
                onClick={async () => {
                  await run(confirm.run);
                  setConfirm(null);
                }}
              >
                {confirm.confirmLabel}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {toast && (
        <div role="status" className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 font-semibold shadow-2xl ${toast.error ? 'bg-coral-deep' : 'bg-white text-ink-900'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function SessionView({
  state,
  busy,
  run,
  ask,
  reloadSessions,
  onDeleted,
}: {
  state: AdminState;
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  ask: (c: Confirm) => void;
  reloadSessions: () => Promise<void>;
  onDeleted: () => void;
}) {
  const s = state.session;
  const id = s.id;
  const current = state.rounds[state.rounds.length - 1] ?? null;
  const base = usePublicBaseUrl();
  const voteUrl = `${base}/s/${s.slug}`;
  const hallUrl = `/hall/${s.slug}`;
  const archived = s.status === 'archived';

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        {/* Статус */}
        <section className="glass rounded-3xl p-6" aria-labelledby="status-h">
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="status-h" className="font-display text-2xl font-semibold">
              {s.title}
            </h1>
            {s.isDemo && <DemoBadge />}
            <SessionStatusBadge status={s.status} />
            {s.accessMode === 'codes' && (
              <span className="rounded-full bg-electric/15 px-3 py-1 text-xs font-semibold text-electric-soft">Вход по кодам</span>
            )}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Тур" value={current ? `${current.number} · ${roundLabel(current.type, current.number)}` : '—'} />
            <Stat label="Статус тура" value={current ? roundStatusText(current.status) : 'не начат'} />
            <Stat label="Открыт" value={current ? time(current.openedAt) : '—'} />
            <Stat label="Закрыт" value={current?.closedAt ? time(current.closedAt) : '—'} />
          </dl>
          <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <p className="text-sm text-white/55">Голосов принято</p>
              <p className="font-display text-6xl font-extrabold tabular-nums leading-none" aria-live="polite">
                {current?.voteCount ?? 0}
                {s.expectedParticipants ? <span className="text-3xl text-white/40"> из {s.expectedParticipants}</span> : null}
              </p>
            </div>
            <ExpectedEditor key={id + String(s.expectedParticipants)} value={s.expectedParticipants} disabled={archived} onSave={(v) => run(() => api.admin.patch(`/api/admin/sessions/${id}`, { expectedParticipants: v }), 'Сохранено')} />
          </div>
          {current?.status === 'open' && <p className="mt-3 text-sm text-white/50">Распределение голосов скрыто, пока тур открыт — даже здесь.</p>}
        </section>

        {/* Главное действие */}
        <section className="glass rounded-3xl p-6" aria-label="Управление голосованием">
          <NextAction state={state} busy={busy} run={run} ask={ask} />
        </section>

        {/* Результаты по турам */}
        {state.rounds.length > 0 && (
          <section className="glass rounded-3xl p-6" aria-labelledby="rounds-h">
            <h2 id="rounds-h" className="font-display text-lg font-semibold">
              Туры
            </h2>
            <div className="mt-4 space-y-4">
              {[...state.rounds].reverse().map((r) => (
                <RoundCard key={r.id} round={r} />
              ))}
            </div>
          </section>
        )}

        {s.isDemo && <DemoTools state={state} busy={busy} run={run} ask={ask} reloadSessions={reloadSessions} onDeleted={onDeleted} />}
      </div>

      <aside className="space-y-5">
        <section className="glass rounded-3xl p-6" aria-labelledby="links-h">
          <h2 id="links-h" className="font-display text-lg font-semibold">
            Ссылки
          </h2>
          <div className="mt-4 flex items-center gap-4">
            <QrCode value={voteUrl} size={120} />
            <div className="min-w-0">
              <p className="text-sm text-white/55">Для участников</p>
              <p className="break-all font-semibold">{voteUrl.replace(/^https?:\/\//, '')}</p>
              {!base.startsWith('https://') && <p className="mt-1 text-xs text-amber-200">Для зала нужен публичный HTTPS-адрес (PUBLIC_BASE_URL)</p>}
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <a href={hallUrl} target="_blank" rel="noreferrer" className="glass flex min-h-[48px] items-center gap-2 rounded-2xl px-4 font-semibold hover:bg-white/10">
              <MonitorPlay className="h-4 w-4" aria-hidden /> Экран зала (16:9) <ExternalLink className="ml-auto h-4 w-4 text-white/50" aria-hidden />
            </a>
            <a href={`/s/${s.slug}`} target="_blank" rel="noreferrer" className="glass flex min-h-[48px] items-center gap-2 rounded-2xl px-4 font-semibold hover:bg-white/10">
              <Smartphone className="h-4 w-4" aria-hidden /> Страница голосования <ExternalLink className="ml-auto h-4 w-4 text-white/50" aria-hidden />
            </a>
            <Button
              variant="secondary"
              className="justify-start"
              onClick={() => {
                void navigator.clipboard?.writeText(voteUrl);
              }}
            >
              <ClipboardCopy className="h-4 w-4" aria-hidden /> Скопировать ссылку
            </Button>
            <a
              href={`/api/admin/sessions/${id}/export.csv`}
              className="glass flex min-h-[48px] items-center gap-2 rounded-2xl px-4 font-semibold hover:bg-white/10"
              download
            >
              <Download className="h-4 w-4" aria-hidden /> Экспортировать CSV
            </a>
            <Link to="/admin/guide" className="px-1 pt-1 text-sm text-white/60 underline-offset-4 hover:text-white hover:underline">
              Памятка организатору
            </Link>
          </div>
        </section>

        {s.accessMode === 'codes' && <CodesPanel state={state} run={run} />}
        <VolunteersPanel state={state} ask={ask} />
        <AuditPanel sessionId={id} version={state.rounds.length + (state.decision ? 1 : 0) + (current?.status ?? '')} />
      </aside>
    </div>
  );
}

function NextAction({ state, busy, run, ask }: { state: AdminState; busy: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; ask: (c: Confirm) => void }) {
  const id = state.session.id;
  const n = state.next;
  const startNext = () => run(() => api.admin.post(`/api/admin/sessions/${id}/rounds`, { mode: 'next' }), 'Тур открыт');
  const repeat = () => run(() => api.admin.post(`/api/admin/sessions/${id}/rounds`, { mode: 'repeat' }), 'Тур открыт заново');
  const big = 'w-full sm:w-auto text-lg px-7 min-h-[60px]';

  if (state.session.status === 'archived') return <p className="text-white/70">Сессия в архиве. Создайте новую сессию для следующего IT-вече.</p>;

  switch (n.kind) {
    case 'start_main':
      return (
        <ActionBlock hint="Участники увидят три варианта и смогут проголосовать.">
          <Button className={big} onClick={startNext} loading={busy}>
            <Play className="h-5 w-5" aria-hidden /> Начать голосование
          </Button>
        </ActionBlock>
      );
    case 'close': {
      const r = state.rounds.find((x) => x.id === n.roundId)!;
      return (
        <ActionBlock hint="После завершения новые голоса не принимаются. Результаты пока увидите только вы.">
          <Button
            className={big}
            variant="danger"
            loading={busy}
            onClick={() =>
              ask({
                title: 'Завершить голосование?',
                body: (
                  <>
                    Принято {r.voteCount} {votesWord(r.voteCount)}
                    {state.session.expectedParticipants ? ` из ${state.session.expectedParticipants} ожидаемых` : ''}. После завершения голосовать будет нельзя.
                  </>
                ),
                confirmLabel: 'Завершить',
                danger: true,
                run: () => api.admin.post(`/api/admin/rounds/${n.roundId}/close`),
              })
            }
          >
            <Square className="h-5 w-5" aria-hidden /> Завершить голосование
          </Button>
        </ActionBlock>
      );
    }
    case 'publish': {
      const r = state.rounds.find((x) => x.id === n.roundId)!;
      return (
        <ActionBlock hint="Результаты видите только вы. Покажите их, когда будете готовы — на экране зала начнётся анимация.">
          {r.outcome && (
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-semibold">{outcomeHeadline(r.outcome)}</p>
              <p className="text-sm text-white/65">{outcomeDetail(r.outcome)}</p>
            </div>
          )}
          <Button className={big} loading={busy} onClick={() => run(() => api.admin.post(`/api/admin/rounds/${n.roundId}/publish`), 'Результаты показаны')}>
            <BarChart3 className="h-5 w-5" aria-hidden /> Показать результаты
          </Button>
        </ActionBlock>
      );
    }
    case 'start_round':
      return (
        <ActionBlock
          hint={
            n.type === 'runoff'
              ? `Во второй тур выходят: ${n.eligible.map((x) => `«${title(x)}»`).join(' и ')}.`
              : `Равенство мешает определить финалистов. Тай-брейк между: ${n.eligible.map((x) => `«${title(x)}»`).join(', ')}.`
          }
        >
          <Button className={big} loading={busy} onClick={startNext}>
            <Play className="h-5 w-5" aria-hidden /> {n.type === 'runoff' ? 'Запустить второй тур' : 'Запустить тай-брейк'}
          </Button>
        </ActionBlock>
      );
    case 'tie':
      return (
        <ActionBlock hint={`Ничья: ${n.optionIds.map((x) => `«${title(x)}»`).join(' и ')}. Победитель автоматически не назначается.`}>
          <div className="flex flex-wrap gap-3">
            <Button className={big} loading={busy} onClick={repeat}>
              <RotateCcw className="h-5 w-5" aria-hidden /> Переголосовать
            </Button>
            {n.optionIds.map((opt) => (
              <Button
                key={opt}
                variant="secondary"
                className={big}
                onClick={() =>
                  ask({
                    title: `Решение генерального директора: «${title(opt)}»?`,
                    body: 'Фиксируется как решение генерального директора после равенства голосов. Действие необратимо.',
                    confirmLabel: 'Зафиксировать',
                    run: () => api.admin.post(`/api/admin/sessions/${id}/decision`, { optionId: opt, method: 'ceo' }),
                  })
                }
              >
                <Gavel className="h-5 w-5" aria-hidden /> ГД выбрал «{title(opt)}»
              </Button>
            ))}
          </div>
        </ActionBlock>
      );
    case 'no_votes':
      return (
        <ActionBlock hint="В туре не было голосов.">
          <Button className={big} loading={busy} onClick={repeat}>
            <RotateCcw className="h-5 w-5" aria-hidden /> Повторить тур
          </Button>
        </ActionBlock>
      );
    case 'decide':
      return (
        <ActionBlock hint="Итоговое решение подтверждает генеральный директор. После фиксации на экране зала появится «Решение принято».">
          <Button
            className={big}
            loading={busy}
            onClick={() =>
              ask({
                title: `Зафиксировать решение «${title(n.optionId)}»?`,
                body:
                  n.optionId === 'freedom'
                    ? 'Генеральный директор подтвердил решение. Фиксируется прекращение регулярного формата с контрольным пересмотром через три месяца.'
                    : 'Генеральный директор подтвердил решение. Формат запускается как трёхмесячный пилот.',
                confirmLabel: 'Зафиксировать',
                run: () => api.admin.post(`/api/admin/sessions/${id}/decision`, { optionId: n.optionId, method: 'vote' }),
              })
            }
          >
            <Gavel className="h-5 w-5" aria-hidden /> Зафиксировать решение
          </Button>
        </ActionBlock>
      );
    case 'done': {
      const d = state.decision!;
      const o = getOption(d.optionId)!;
      return (
        <div className="flex items-center gap-4">
          <CheckCircle2 className={`h-10 w-10 shrink-0 ${accentStyles[o.accent].text}`} aria-hidden />
          <div>
            <p className="font-display text-xl font-semibold">Решение зафиксировано: «{o.title}»</p>
            <p className="text-sm text-white/60">
              {d.method === 'ceo' ? 'Решение ГД после ничьей' : 'По итогам голосования'} · {time(d.confirmedAt)}
            </p>
          </div>
        </div>
      );
    }
  }
}

function ActionBlock({ hint, children }: { hint: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-4 text-white/70">{hint}</p>
      {children}
    </div>
  );
}

function RoundCard({ round }: { round: AdminRound }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">
          {round.number}. {roundLabel(round.type, round.number)}
        </span>
        <span className="text-white/50">· {roundStatusText(round.status)}</span>
        <span className="ml-auto text-white/50">
          {round.voteCount} {votesWord(round.voteCount)}
        </span>
      </div>
      {round.counts && round.percents ? (
        <ul className="mt-3 space-y-2">
          {round.eligible.map((opt) => {
            const o = getOption(opt)!;
            const a = accentStyles[o.accent];
            return (
              <li key={opt} className="flex items-center gap-3 text-sm">
                <OptionIcon id={opt} className={`h-4 w-4 shrink-0 ${a.text}`} />
                <span className="w-44 shrink-0 truncate">{o.title}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className={`block h-full ${a.bg}`} style={{ width: `${round.percents![opt]}%` }} />
                </span>
                <span className="w-20 text-right tabular-nums text-white/75">
                  {round.counts![opt]} · {round.percents![opt]}%
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-white/50">Распределение появится после завершения тура.</p>
      )}
      {round.outcome && <p className="mt-3 text-sm text-white/70">{outcomeHeadline(round.outcome)}. {outcomeDetail(round.outcome)}</p>}
    </div>
  );
}

function DemoTools({
  state,
  busy,
  run,
  ask,
  reloadSessions,
  onDeleted,
}: {
  state: AdminState;
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  ask: (c: Confirm) => void;
  reloadSessions: () => Promise<void>;
  onDeleted: () => void;
}) {
  const id = state.session.id;
  const current = state.rounds[state.rounds.length - 1];
  const open = current?.status === 'open';
  const eligible = open ? current.eligible : [];
  const [counts, setCounts] = useState<Record<string, string>>({});

  const add = (plan: Partial<Record<OptionId, number>>) => run(() => api.admin.post(`/api/admin/sessions/${id}/demo/votes`, { counts: plan }), 'Тестовые голоса добавлены');

  const presets: { label: string; plan: () => Partial<Record<OptionId, number>> }[] =
    eligible.length === 3
      ? [
          { label: 'Победа в 1-м туре', plan: () => ({ freedom: 3, navigator: 5, relay: 12 }) },
          { label: 'Нет большинства', plan: () => ({ freedom: 7, navigator: 9, relay: 5 }) },
          { label: 'Равенство за 2-е место', plan: () => ({ freedom: 6, navigator: 9, relay: 6 }) },
          { label: 'Все поровну', plan: () => ({ freedom: 6, navigator: 6, relay: 6 }) },
        ]
      : [
          { label: 'Явный победитель', plan: () => Object.fromEntries(eligible.map((e, i) => [e, i === 0 ? 12 : 7])) },
          { label: 'Ничья', plan: () => Object.fromEntries(eligible.map((e) => [e, 8])) },
        ];

  return (
    <section className="rounded-3xl border border-amber-300/30 bg-amber-300/5 p-6" aria-labelledby="demo-h">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-5 w-5 text-amber-200" aria-hidden />
        <h2 id="demo-h" className="font-display text-lg font-semibold">
          Демо-инструменты
        </h2>
      </div>
      <p className="mt-2 text-sm text-white/65">Синтетические голоса попадают только в эту демо-сессию и не влияют на реальные итоги.</p>
      {open ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button key={p.label} variant="secondary" disabled={busy} onClick={() => add(p.plan())}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            {eligible.map((opt) => (
              <label key={opt} className="text-sm">
                <span className="mb-1 block text-white/65">{title(opt)}</span>
                <input
                  type="number"
                  min={0}
                  max={200}
                  inputMode="numeric"
                  value={counts[opt] ?? ''}
                  onChange={(e) => setCounts((c) => ({ ...c, [opt]: e.target.value }))}
                  className="w-28 rounded-xl border border-white/15 bg-ink-900 px-3 py-2.5"
                />
              </label>
            ))}
            <Button
              disabled={busy}
              onClick={() => {
                const plan = Object.fromEntries(eligible.map((o) => [o, Number(counts[o] || 0)]));
                void add(plan);
                setCounts({});
              }}
            >
              Добавить голоса
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-white/55">Откройте тур, чтобы добавить тестовые голоса.</p>
      )}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-5">
        <Button
          variant="secondary"
          onClick={() =>
            ask({
              title: 'Сбросить демо?',
              body: 'Все туры, голоса, решение и заявки этой демо-сессии будут удалены. Ссылка останется прежней.',
              confirmLabel: 'Сбросить',
              danger: true,
              run: () => api.admin.post(`/api/admin/sessions/${id}/demo/reset`),
            })
          }
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> Сбросить демо
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            ask({
              title: 'Удалить демо-сессию?',
              body: 'Демо-сессия будет удалена полностью.',
              confirmLabel: 'Удалить',
              danger: true,
              run: async () => {
                await api.admin.del(`/api/admin/sessions/${id}`);
                onDeleted();
                await reloadSessions();
              },
            })
          }
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Удалить демо
        </Button>
      </div>
    </section>
  );
}

function CodesPanel({ state, run }: { state: AdminState; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [count, setCount] = useState(String(state.session.expectedParticipants ?? 30));
  const [codes, setCodes] = useState<string[] | null>(null);
  return (
    <section className="glass rounded-3xl p-6" aria-labelledby="codes-h">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-electric-soft" aria-hidden />
        <h2 id="codes-h" className="font-display text-lg font-semibold">
          Одноразовые коды
        </h2>
      </div>
      <p className="mt-2 text-sm text-white/65">
        Выдано: {state.session.codesTotal}, использовано: {state.session.codesUsed}. Код даёт один голос в каждом туре и не связан с именем. Коды показываются один раз —
        распечатайте их сразу.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          type="number"
          min={1}
          max={500}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          aria-label="Количество кодов"
          className="w-24 rounded-xl border border-white/15 bg-ink-900 px-3 py-2.5"
        />
        <Button
          variant="secondary"
          onClick={() =>
            run(async () => {
              const r = await api.admin.post<{ codes: string[] }>(`/api/admin/sessions/${state.session.id}/codes`, { count: Number(count) });
              setCodes(r.codes);
            }, 'Коды созданы')
          }
        >
          Создать коды
        </Button>
      </div>
      {codes && (
        <div className="mt-4">
          <div id="codes-print" className="grid grid-cols-3 gap-2 font-mono text-sm">
            {codes.map((c) => (
              <span key={c} className="rounded-lg bg-white/10 px-2 py-1.5 text-center">
                {c}
              </span>
            ))}
          </div>
          <Button variant="ghost" className="mt-2" onClick={() => printCodes(codes, `${window.location.origin}/s/${state.session.slug}`)}>
            <Printer className="h-4 w-4" aria-hidden /> Печать карточек
          </Button>
        </div>
      )}
    </section>
  );
}

function printCodes(codes: string[], url: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const doc = w.document;
  doc.title = 'Коды IT-вече';
  const style = doc.createElement('style');
  style.textContent =
    'body{font-family:system-ui,sans-serif;margin:16px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.c{border:1px dashed #999;padding:14px;text-align:center}.k{font:700 22px monospace;letter-spacing:2px;margin:6px 0}.u{font-size:11px;color:#555}';
  doc.head.appendChild(style);
  const grid = doc.createElement('div');
  grid.className = 'g';
  for (const code of codes) {
    const card = doc.createElement('div');
    card.className = 'c';
    const t = doc.createElement('div');
    t.textContent = 'IT-ВЕЧЕ · код участника';
    const k = doc.createElement('div');
    k.className = 'k';
    k.textContent = code;
    const u = doc.createElement('div');
    u.className = 'u';
    u.textContent = url;
    card.append(t, k, u);
    grid.appendChild(card);
  }
  doc.body.appendChild(grid);
  w.print();
}

function VolunteersPanel({ state, ask }: { state: AdminState; ask: (c: Confirm) => void }) {
  const [list, setList] = useState<{ id: string; idea: string; contact: string; createdAt: string }[] | null>(null);
  const id = state.session.id;
  const load = useCallback(() => {
    api.admin
      .get<{ volunteers: { id: string; idea: string; contact: string; createdAt: string }[] }>(`/api/admin/sessions/${id}/volunteers`)
      .then((r) => setList(r.volunteers))
      .catch(() => setList([]));
  }, [id]);
  useEffect(() => {
    if (state.volunteerCount > 0 || state.decision?.optionId === 'relay') load();
  }, [load, state.volunteerCount, state.decision?.optionId]);

  if (state.decision?.optionId !== 'relay' && state.volunteerCount === 0) return null;
  return (
    <section className="glass rounded-3xl p-6" aria-labelledby="vol-h">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-emerald" aria-hidden />
        <h2 id="vol-h" className="font-display text-lg font-semibold">
          Добровольцы эстафеты · {state.volunteerCount}
        </h2>
      </div>
      <p className="mt-2 text-sm text-white/55">Заявки не связаны с голосами и не попадают в CSV-отчёт.</p>
      <ul className="mt-4 space-y-3">
        {(list ?? []).map((v) => (
          <li key={v.id} className="rounded-2xl border border-white/10 bg-ink-900/40 p-3 text-sm">
            <p className="whitespace-pre-wrap">{v.idea}</p>
            <p className="mt-1 text-white/60">{v.contact}</p>
            <button
              type="button"
              className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-xs text-coral-soft hover:text-coral"
              onClick={() =>
                ask({
                  title: 'Удалить заявку?',
                  body: 'Заявка будет удалена без возможности восстановления.',
                  confirmLabel: 'Удалить',
                  danger: true,
                  run: async () => {
                    await api.admin.del(`/api/admin/volunteers/${v.id}`);
                    load();
                  },
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Удалить
            </button>
          </li>
        ))}
      </ul>
      {list && list.length > 1 && (
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() =>
            ask({
              title: 'Удалить все заявки?',
              body: 'Все заявки добровольцев этой сессии будут удалены.',
              confirmLabel: 'Удалить все',
              danger: true,
              run: async () => {
                await api.admin.del(`/api/admin/sessions/${id}/volunteers`);
                load();
              },
            })
          }
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Удалить все
        </Button>
      )}
    </section>
  );
}

const AUDIT_LABELS: Record<string, string> = {
  session_created: 'Сессия создана',
  session_updated: 'Настройки изменены',
  round_opened: 'Тур открыт',
  round_repeated: 'Тур открыт повторно',
  round_closed: 'Тур завершён',
  results_published: 'Результаты показаны',
  decision_recorded: 'Решение зафиксировано',
  export_csv: 'Экспорт CSV',
  codes_generated: 'Созданы коды',
  demo_votes_added: 'Тестовые голоса',
  demo_reset: 'Сброс демо',
  volunteer_deleted: 'Заявка удалена',
  volunteers_deleted: 'Заявки удалены',
};

function AuditPanel({ sessionId, version }: { sessionId: string; version: string | number }) {
  const [entries, setEntries] = useState<{ id: number; action: string; createdAt: string }[]>([]);
  useEffect(() => {
    api.admin
      .get<{ entries: { id: number; action: string; createdAt: string }[] }>(`/api/admin/audit?sessionId=${sessionId}`)
      .then((r) => setEntries(r.entries))
      .catch(() => undefined);
  }, [sessionId, version]);
  return (
    <details className="glass rounded-3xl p-6">
      <summary className="cursor-pointer font-display text-lg font-semibold">Журнал действий</summary>
      <ul className="mt-4 space-y-1.5 text-sm">
        {entries.map((e) => (
          <li key={e.id} className="flex justify-between gap-3 text-white/75">
            <span>{AUDIT_LABELS[e.action] ?? e.action}</span>
            <span className="tabular-nums text-white/45">{time(e.createdAt)}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="text-white/50">Пока пусто</li>}
      </ul>
    </details>
  );
}

function NewSessionModal({
  mode,
  onClose,
  onCreate,
  hasActive,
}: {
  mode: false | 'real' | 'demo';
  onClose: () => void;
  onCreate: (b: { title?: string; expectedParticipants?: number; accessMode: 'open' | 'codes'; isDemo: boolean }) => Promise<void>;
  hasActive: boolean;
}) {
  const [titleV, setTitle] = useState('');
  const [expected, setExpected] = useState('25');
  const [codes, setCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const demo = mode === 'demo';
  return (
    <Modal open={!!mode} onClose={onClose} title={demo ? 'Новая демо-сессия' : 'Новая сессия'} labelledBy="new-session-title">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onCreate({ title: titleV || undefined, expectedParticipants: expected ? Number(expected) : undefined, accessMode: codes ? 'codes' : 'open', isDemo: demo });
            setTitle('');
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Ошибка');
          } finally {
            setBusy(false);
          }
        }}
      >
        {!demo && hasActive && (
          <p className="rounded-2xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">
            Текущая сессия будет перенесена в архив, её открытый тур закроется. Ссылка и QR-код изменятся.
          </p>
        )}
        {demo && <p className="text-sm text-white/65">Отдельная тестовая сессия с меткой DEMO. Реальные итоги не затрагиваются.</p>}
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-white/70">Название</span>
          <input value={titleV} onChange={(e) => setTitle(e.target.value)} placeholder={demo ? 'Демо IT-вече' : 'IT-вече'} className="w-full rounded-2xl border border-white/15 bg-ink-900 px-4 py-3" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-white/70">Ожидаемое число участников</span>
          <input type="number" min={1} max={1000} value={expected} onChange={(e) => setExpected(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-ink-900 px-4 py-3" />
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={codes} onChange={(e) => setCodes(e.target.checked)} className="mt-1 h-5 w-5 accent-white" />
          <span className="text-sm">
            <span className="font-semibold">Вход по одноразовым кодам</span>
            <span className="block text-white/60">Строже ограничивает повторное голосование с нескольких устройств. Коды не привязаны к именам.</span>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-coral-soft">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={busy}>
            Создать
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ExpectedEditor({ value, onSave, disabled }: { value: number | null; onSave: (v: number | null) => void; disabled: boolean }) {
  const [v, setV] = useState(value ? String(value) : '');
  const changed = (v ? Number(v) : null) !== value;
  return (
    <form
      className="ml-auto flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v ? Number(v) : null);
      }}
    >
      <label className="text-sm">
        <span className="mb-1 block text-white/55">Ожидаем участников</span>
        <input
          type="number"
          min={1}
          max={1000}
          value={v}
          disabled={disabled}
          onChange={(e) => setV(e.target.value)}
          className="w-28 rounded-xl border border-white/15 bg-ink-900 px-3 py-2.5"
        />
      </label>
      {changed && (
        <Button type="submit" variant="secondary">
          Сохранить
        </Button>
      )}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-white/45">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: AdminState['session']['status'] }) {
  const map = { draft: ['Готова', 'bg-white/10 text-white/80'], active: ['Идёт', 'bg-emerald/15 text-emerald'], decided: ['Решение принято', 'bg-electric/15 text-electric-soft'], archived: ['Архив', 'bg-white/5 text-white/50'] } as const;
  const [label, cls] = map[status];
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}

function roundStatusText(s: AdminRound['status']) {
  return s === 'open' ? 'идёт голосование' : s === 'closed' ? 'завершён, результаты скрыты' : 'результаты показаны';
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

