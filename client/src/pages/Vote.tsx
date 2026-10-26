import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, CheckCircle2, Hourglass, KeyRound, LayoutGrid, Send, ShieldCheck, Sparkles, Target, Users } from 'lucide-react';
import { OPTIONS, getOption, type OptionId } from '../../../shared/options';
import type { PublicRoundResult, PublicState } from '../../../shared/types';
import { ApiError, api, store, voterKey } from '../lib/api';
import { useLive } from '../lib/live';
import { accentStyles } from '../lib/accent';
import { outcomeDetail, outcomeHeadline, roundLabel, votesWord } from '../lib/text';
import { AgendaOptionCard, SelectOptionCard } from '../components/OptionCard';
import { LiveBars, PhoneBars } from '../components/Results';
import { OptionArt } from '../components/Scene';
import { Backdrop, Button, ChromeText, ConnectionBanner, DemoBadge, HeroPhoto, Logo, MetalTitle, Modal, PowerBanner, Spinner, StatPanel } from '../components/ui';

export default function Vote() {
  const { slug = '' } = useParams();
  const { data, connection, notFound } = useLive<PublicState>(`/api/sessions/${slug}/stream`, `/api/sessions/${slug}/state`);
  const codeKey = `veche:code:${slug}`;
  const [code, setCode] = useState<string | null>(() => store.get(codeKey));
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [justVoted, setJustVoted] = useState<string | null>(null);

  const codesMode = data?.session.accessMode === 'codes';
  const roundId = data?.round?.id;

  // Источник истины о том, голосовал ли этот ключ, — сервер.
  const syncVoted = useCallback(async () => {
    if (!data) return;
    if (codesMode && !code) return;
    try {
      const res = await api.post<{ votedRoundIds: string[] }>(`/api/sessions/${slug}/voted`, codesMode ? { code } : { voterKey: voterKey() });
      setVoted(new Set(res.votedRoundIds));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'invalid_code') {
        store.del(codeKey);
        setCode(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, codesMode, code, !!data, codeKey]);

  useEffect(() => {
    void syncVoted();
  }, [syncVoted, roundId]);

  useEffect(() => {
    document.title = 'ИТ ВЕЧЕ · голосование';
  }, []);

  if (notFound)
    return (
      <Shell>
        <Message icon={<AlertTriangle className="h-10 w-10 text-danger" />} title="Сессия не найдена">
          Проверьте ссылку или отсканируйте QR-код на экране ещё раз.
        </Message>
      </Shell>
    );
  if (!data) return <Spinner />;

  const s = data;
  const round = s.round;
  const last = s.results[s.results.length - 1];
  let content: ReactNode;

  if (s.session.status === 'archived' && !s.decision) {
    content = (
      <Message icon={<Hourglass className="h-10 w-10 text-muted" />} title="Эта сессия завершена">
        Отсканируйте актуальный QR-код на экране зала.
      </Message>
    );
  } else if (s.decision) {
    content = <DecisionView state={s} slug={slug} />;
  } else if (!round) {
    content = <BeforeStart state={s} />;
  } else if (round.status === 'open') {
    if (codesMode && !code) {
      content = (
        <CodeEntry
          slug={slug}
          onValid={(c) => {
            store.set(codeKey, c);
            setCode(c);
          }}
        />
      );
    } else if (voted.has(round.id)) {
      content = <VotedView state={s} fresh={justVoted === round.id} />;
    } else {
      content = (
        <VoteForm
          key={round.id}
          state={s}
          slug={slug}
          credentials={codesMode ? { code: code! } : { voterKey: voterKey() }}
          onAccepted={(id, opt) => {
            store.set(`veche:choice:${id}`, opt);
            setVoted((v) => new Set(v).add(id));
            setJustVoted(id);
          }}
          onAlreadyVoted={(id) => setVoted((v) => new Set(v).add(id))}
          onInvalidCode={() => {
            store.del(codeKey);
            setCode(null);
          }}
        />
      );
    }
  } else if (round.status === 'closed') {
    content = (
      <Message icon={<Hourglass className="h-10 w-10 text-electric-soft" />} title="Голосование завершено">
        {voted.has(round.id) ? 'Ваш голос учтён. ' : ''}Подводим итоги — результаты появятся на экране зала и здесь.
      </Message>
    );
  } else {
    content = last ? <ResultsView result={last} /> : null;
  }

  return (
    <Shell demo={s.session.isDemo} connection={connection}>
      <AnimatePresence mode="wait">
        <motion.div
          key={(round?.id ?? 'none') + (round?.status ?? '') + (s.decision ? 'd' : '') + (round && voted.has(round.id) ? 'v' : '')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

function Shell({ children, demo, connection }: { children: ReactNode; demo?: boolean; connection?: Parameters<typeof ConnectionBanner>[0]['connection'] }) {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden">
      <Backdrop intensity={0.8} />
      {connection && <ConnectionBanner connection={connection} />}
      <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="relative z-10 flex items-center justify-between py-2">
          <Logo size="sm" />
          {demo && <DemoBadge />}
        </header>
        <main className="flex flex-1 flex-col pt-4">{children}</main>
      </div>
    </div>
  );
}

function Message({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[65dvh] flex-col items-center justify-center text-center">
      <div className="glass mb-6 flex h-20 w-20 items-center justify-center rounded-3xl">{icon}</div>
      <h1 className="font-display text-2xl font-semibold leading-tight">{title}</h1>
      <p className="mt-3 max-w-sm text-base leading-relaxed text-ice/85">{children}</p>
    </div>
  );
}

/** Повестка до старта: вопрос и варианты ответа, чтобы участники успели ознакомиться. */
function BeforeStart({ state }: { state: PublicState }) {
  return (
    <div>
      <PhoneHero>
        <a href="#options" className="btn-primary mt-6 inline-flex min-h-[52px] items-center gap-2 rounded-full px-7 text-[15px]">
          Смотреть варианты <ArrowRight className="h-5 w-5" aria-hidden />
        </a>
      </PhoneHero>
      <StatPanel
        cells={[
          { icon: <LayoutGrid strokeWidth={1.6} />, value: OPTIONS.length, label: 'варианта' },
          { icon: <Users strokeWidth={1.6} />, value: state.session.expectedParticipants ?? '—', label: 'участников' },
          { icon: <ShieldCheck strokeWidth={1.6} />, value: 1, label: 'анонимный голос' },
          { icon: <Target strokeWidth={1.6} />, value: 1, label: 'общее решение' },
        ]}
      />
      <section aria-labelledby="agenda-h" className="mt-8">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-neon">Повестка вече</p>
        <h2 id="agenda-h" className="mt-2 font-display text-[22px] font-extrabold leading-tight text-ice">
          {state.session.agenda}
        </h2>
      </section>
      <div className="glass mt-5 flex items-center gap-3 rounded-2xl p-4">
        <Hourglass className="h-5 w-5 shrink-0 text-neon" aria-hidden />
        <p className="text-sm text-ice/85">Голосование скоро начнётся. Ознакомьтесь с вариантами — страница обновится сама.</p>
      </div>
      <h2 id="options" className="mt-9 scroll-mt-6 font-display text-[26px] font-black uppercase tracking-wide text-ice">
        Варианты
      </h2>
      <ul className="mt-4 space-y-4">
        {OPTIONS.map((o) => (
          <li key={o.id}>
            <AgendaOptionCard option={o} />
          </li>
        ))}
      </ul>
      <PowerBanner className="mt-8" />
    </div>
  );
}

/** Герой-блок телефона: фото площадки с дугой, хромовый титул, слоган. */
function PhoneHero({ children, compact = false }: { children?: ReactNode; compact?: boolean }) {
  return (
    <section className={`relative -mx-5 -mt-16 overflow-x-clip px-5 pt-16 ${compact ? 'pb-4' : 'pb-8'}`}>
      <HeroPhoto className={`-right-6 top-0 ${compact ? 'h-[280px] w-[70%]' : 'h-[470px] w-[80%]'}`} words={!compact} wordsClass="!right-[9%] !top-[39%] text-[11px] max-[419px]:hidden" />
      <div className="relative">
        <MetalTitle bar className={compact ? 'text-[44px]' : 'text-[68px]'} />
        {!compact && (
          <>
            <p className="mt-6 font-display text-[21px] font-black uppercase leading-[1.12] text-ice [text-shadow:0_2px_12px_rgb(5_13_29)]">
              Твой голос.
              <br />
              Наше будущее.
            </p>
            <p className="mt-4 max-w-[330px] text-[15px] leading-snug text-ice/90 [text-shadow:0_1px_8px_rgb(5_13_29)]">
              <span className="text-neon">Выбирай формат</span>, поддерживай коллег и определяй <span className="text-neon">будущее цифровых 15 минут</span> вместе с нами.
            </p>
          </>
        )}
        {children}
      </div>
    </section>
  );
}

function CodeEntry({ slug, onValid }: { slug: string; onValid: (code: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ valid: boolean }>(`/api/sessions/${slug}/check-code`, { code: value });
      if (res.valid) onValid(value);
      else setError('Код не найден. Проверьте написание.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка проверки кода');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex min-h-[60dvh] flex-col justify-center">
      <div className="glass mb-6 flex h-16 w-16 items-center justify-center rounded-2xl">
        <KeyRound className="h-8 w-8 text-electric-soft" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-semibold">Введите код участника</h1>
      <p className="mt-2 text-ice/85">Код напечатан на карточке. Он анонимный и не связан с вашим именем.</p>
      <label htmlFor="code" className="sr-only">
        Код участника
      </label>
      <input
        id="code"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCD-EFGH"
        className="mt-6 w-full rounded-2xl border border-line bg-ink-850 px-5 py-4 text-center font-display text-2xl tracking-[0.2em] placeholder:text-muted/50"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger-soft">
          {error}
        </p>
      )}
      <Button type="submit" className="mt-5 w-full text-lg" loading={busy} disabled={value.replace(/[^A-Z0-9]/g, '').length < 8}>
        Продолжить
      </Button>
    </form>
  );
}

function VoteForm({
  state,
  slug,
  credentials,
  onAccepted,
  onAlreadyVoted,
  onInvalidCode,
}: {
  state: PublicState;
  slug: string;
  credentials: { voterKey: string } | { code: string };
  onAccepted: (roundId: string, optionId: OptionId) => void;
  onAlreadyVoted: (roundId: string) => void;
  onInvalidCode: () => void;
}) {
  const round = state.round!;
  const options = round.eligible.map((id) => getOption(id)!);
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; retry: boolean } | null>(null);
  const sendingRef = useRef(false);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const submit = async () => {
    if (!selected || sendingRef.current) return; // защита от двойного нажатия
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ status: string; roundId: string }>(`/api/sessions/${slug}/vote`, { roundId: round.id, optionId: selected, ...credentials });
      if (res.status === 'accepted') onAccepted(res.roundId, selected);
      else
        setError({
          text: 'Сервер не подтвердил голос. Попробуйте ещё раз.',
          retry: true,
        });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'network', '');
      if (err.code === 'already_voted') onAlreadyVoted(round.id);
      else if (err.code === 'invalid_code') onInvalidCode();
      else if (err.code === 'round_closed') setError({ text: 'Тур уже закрыт — голос не учтён.', retry: false });
      else if (err.code === 'network' || err.status >= 500)
        setError({
          text: 'Нет связи с сервером. Голос НЕ отправлен. Проверьте интернет и повторите.',
          retry: true,
        });
      else setError({ text: err.message, retry: true });
    } finally {
      sendingRef.current = false;
      setSending(false);
      setConfirm(false);
    }
  };

  const onKey = (i: number) => (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    setSelected(options[next].id);
    refs.current[next]?.focus();
  };

  const sel = selected ? getOption(selected)! : null;

  return (
    <div className="flex flex-1 flex-col">
      <PhoneHero compact />
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-neon">{roundLabel(round.type, round.number)}</p>
      <h1 className="mt-1 font-display text-[26px] font-black uppercase leading-tight">Ваш голос имеет значение</h1>
      <p className="mt-2 text-muted">
        {round.type === 'main' ? 'Выберите один из трёх сценариев.' : 'Выберите один из вариантов этого тура.'} Голосование анонимное.
      </p>

      <div role="radiogroup" aria-label="Варианты" className="mt-5 space-y-3">
        {options.map((o, i) => (
          <SelectOptionCard
            key={o.id}
            option={o}
            selected={selected === o.id}
            onSelect={() => {
              setSelected(o.id);
              setError(null);
            }}
            disabled={sending}
            tabIndex={selected ? (selected === o.id ? 0 : -1) : i === 0 ? 0 : -1}
            onKeyDown={onKey(i)}
            inputRef={(el) => (refs.current[i] = el)}
          />
        ))}
      </div>

      <div className="sticky bottom-0 -mx-5 mt-auto bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent px-5 pb-2 pt-6">
        <AnimatePresence>
          {error && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-3 flex items-start gap-3 rounded-2xl border border-danger/50 bg-ink-850 p-4"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
              <p className="text-sm text-ice/85">{error.text}</p>
            </motion.div>
          )}
        </AnimatePresence>
        <Button className="w-full text-lg" disabled={!selected} loading={sending} onClick={() => (error?.retry && selected ? void submit() : setConfirm(true))}>
          <Send className="h-5 w-5" aria-hidden />
          {error?.retry ? 'Отправить ещё раз' : 'Отдать голос'}
        </Button>
      </div>

      <Modal open={confirm && !!sel} onClose={() => !sending && setConfirm(false)} title={sel ? `Вы выбираете «${sel.title}»` : ''}>
        {sel && (
          <>
            <p className="text-ice/85">«{sel.slogan}». После подтверждения изменить выбор в этом туре нельзя.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setConfirm(false)} disabled={sending}>
                Изменить
              </Button>
              <Button data-autofocus onClick={() => void submit()} loading={sending}>
                Подтвердить
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function VotedView({ state, fresh }: { state: PublicState; fresh: boolean }) {
  const round = state.round!;
  const choice = store.get(`veche:choice:${round.id}`) as OptionId | null;
  const opt = choice ? getOption(choice) : undefined;
  const live = state.live && state.live.roundId === round.id ? state.live : null;
  return (
    <div className="flex min-h-[65dvh] flex-col items-center justify-center text-center">
      <motion.div
        initial={fresh ? { scale: 0.6, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-neon/15 ring-2 ring-neon/50"
      >
        <CheckCircle2 className="h-12 w-12 text-neon" aria-hidden />
      </motion.div>
      <h1 className="font-display text-[26px] font-semibold leading-tight" role="status">
        {fresh ? 'Ваш голос принят!' : 'Вы уже проголосовали'}
      </h1>
      <p className="mt-2 text-ice/85">{fresh ? 'Спасибо за участие в ИТ-вече' : 'В этом туре ваш голос уже учтён сервером'}</p>
      {opt && (
        <p className="mt-4 text-sm text-muted">
          Ваш выбор: <span className={`font-semibold ${accentStyles[opt.accent].text}`}>{opt.title}</span>
        </p>
      )}
      <div className="glass mt-8 w-full rounded-2xl p-5 text-left">
        <p className="text-center text-sm uppercase tracking-[0.2em] text-muted">Голосование идёт</p>
        <p className="mt-2 text-center text-sm text-muted">Голосов принято</p>
        <p className="text-center font-display text-3xl font-semibold tabular-nums" aria-live="polite">
          {state.voteCount}
          {state.session.expectedParticipants ? <span className="text-muted"> из {state.session.expectedParticipants}</span> : null}
        </p>
        {live ? (
          <div className="mt-5 border-t border-line pt-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neon">Голоса в реальном времени</p>
            <LiveBars eligible={round.eligible} counts={live.counts} percents={live.percents} />
          </div>
        ) : (
          <p className="mt-1 text-center text-sm text-muted">Результаты скрыты до завершения тура</p>
        )}
      </div>
    </div>
  );
}

function ResultsView({ result }: { result: PublicRoundResult }) {
  const more = result.outcome.kind === 'runoff' || result.outcome.kind === 'tiebreak' || result.outcome.kind === 'tie' || result.outcome.kind === 'no_votes';
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">{roundLabel(result.type, result.number)} · итоги</p>
      <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight">{result.type === 'main' ? 'ИТ-вече завершено' : 'Тур завершён'}</h1>
      <p className="mt-1 text-muted">Действительных голосов: {result.total}</p>
      <div className="glass mt-6 rounded-3xl p-5">
        <PhoneBars result={result} />
      </div>
      <div className="mt-5 rounded-2xl border border-line bg-ink-850/70 p-5">
        <p className="font-display text-lg font-semibold">{outcomeHeadline(result.outcome)}</p>
        <p className="mt-1 text-sm text-ice/85">{outcomeDetail(result.outcome)}</p>
      </div>
      {more && <p className="mt-5 text-center text-sm text-muted">Держите страницу открытой — следующий тур появится автоматически.</p>}
    </div>
  );
}

function DecisionView({ state, slug }: { state: PublicState; slug: string }) {
  const d = state.decision!;
  const o = getOption(d.optionId)!;
  const a = accentStyles[o.accent];
  const [formOpen, setFormOpen] = useState(false);
  const [sent, setSent] = useState(() => store.get(`veche:volunteer:${slug}`) === '1');
  return (
    <div>
      <p className="text-center text-sm font-bold uppercase tracking-[0.3em] text-neon">Решение принято</p>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className={`glass relative mt-5 overflow-hidden rounded-3xl border-2 ${a.border} p-6 text-center ${a.glow}`}
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.gradient}`} aria-hidden />
        <OptionArt id={o.id} className="relative mx-auto h-28 w-full max-w-[260px] rounded-xl" />
        <p className={`relative mt-3 font-display text-sm font-semibold ${a.text}`}>{o.number}</p>
        <h1 className="relative text-[30px] leading-tight">
          <ChromeText>{o.title}</ChromeText>
        </h1>
        <p className={`relative mt-4 font-display text-lg font-semibold ${a.text}`}>{o.finalPhrase}</p>
        <p className="relative mt-3 text-sm text-ice/85">
          {d.optionId === 'freedom'
            ? 'Регулярный формат завершается. Контрольный пересмотр — через три месяца'
            : 'Проверим выбранный формат в течение трёх месяцев'}
        </p>
      </motion.div>
      {d.optionId === 'relay' && (
        <div className="mt-6 text-center">
          {sent ? (
            <div className="glass rounded-2xl p-5">
              <Sparkles className="mx-auto h-6 w-6 text-neon" aria-hidden />
              <p className="mt-2 font-semibold">Спасибо! Организатор свяжется с вами.</p>
            </div>
          ) : (
            <>
              <p className="font-display text-xl font-semibold">Кто готов принять цифровую эстафету?</p>
              <Button className="mt-4 w-full text-lg" onClick={() => setFormOpen(true)}>
                У меня есть кейс!
              </Button>
              <p className="mt-2 text-xs text-muted">Форма не связана с вашим анонимным голосом</p>
            </>
          )}
        </div>
      )}
      <VolunteerForm
        open={formOpen}
        slug={slug}
        onClose={() => setFormOpen(false)}
        onSent={() => {
          store.set(`veche:volunteer:${slug}`, '1');
          setSent(true);
          setFormOpen(false);
        }}
      />
      {state.results.length > 0 && (
        <details className="mt-8 rounded-2xl border border-line bg-ink-850/70 p-4">
          <summary className="cursor-pointer font-semibold">Итоги голосования</summary>
          <div className="mt-4 space-y-6">
            {state.results.map((r) => (
              <div key={r.roundId}>
                <p className="mb-3 text-sm text-muted">
                  {roundLabel(r.type, r.number)} · {r.total} {votesWord(r.total)}
                </p>
                <PhoneBars result={r} />
              </div>
            ))}
          </div>
        </details>
      )}
      <PowerBanner className="mt-8" />
      <p className="mt-6 text-center text-xs text-muted">
        {d.method === 'ceo' ? 'Решение генерального директора после равенства голосов' : 'По итогам голосования, подтверждено генеральным директором'}
      </p>
    </div>
  );
}

function VolunteerForm({ open, slug, onClose, onSent }: { open: boolean; slug: string; onClose: () => void; onSent: () => void }) {
  const [idea, setIdea] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Намеренно без ключа устройства: заявка не связывается с голосом.
      await api.post(`/api/sessions/${slug}/volunteer`, { idea, contact });
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Цифровая эстафета" labelledBy="volunteer-title">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="idea" className="mb-1.5 block font-semibold">
            Какой кейс хотите показать?
          </label>
          <textarea
            id="idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            maxLength={2000}
            rows={4}
            required
            className="w-full rounded-2xl border border-line bg-ink-900 px-4 py-3 text-base placeholder:text-muted/50"
            placeholder="Например: как я готовлю протоколы встреч с помощью ИИ"
          />
        </div>
        <div>
          <label htmlFor="contact" className="mb-1.5 block font-semibold">
            Как с вами связаться?
          </label>
          <input
            id="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={300}
            required
            className="w-full rounded-2xl border border-line bg-ink-900 px-4 py-3 text-base placeholder:text-muted/50"
            placeholder="Имя и телефон, почта или мессенджер"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-soft">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={busy} disabled={!idea.trim() || !contact.trim()}>
            Отправить
          </Button>
        </div>
      </form>
    </Modal>
  );
}
