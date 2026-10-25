import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Hourglass, KeyRound, Send, Sparkles } from 'lucide-react';
import { OPTIONS, getOption, type OptionId } from '../../../shared/options';
import type { PublicRoundResult, PublicState } from '../../../shared/types';
import { ApiError, api, store, voterKey } from '../lib/api';
import { useLive } from '../lib/live';
import { accentStyles } from '../lib/accent';
import { outcomeDetail, outcomeHeadline, roundLabel, votesWord } from '../lib/text';
import { SelectOptionCard } from '../components/OptionCard';
import { PhoneBars } from '../components/Results';
import { Backdrop, Button, ConnectionBanner, DemoBadge, Logo, Modal, OptionIcon, Spinner } from '../components/ui';

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
    document.title = 'IT-ВЕЧЕ · голосование';
  }, []);

  if (notFound)
    return (
      <Shell>
        <Message icon={<AlertTriangle className="h-10 w-10 text-coral" />} title="Сессия не найдена">
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
      <Message icon={<Hourglass className="h-10 w-10 text-white/60" />} title="Эта сессия завершена">
        Отсканируйте актуальный QR-код на экране зала.
      </Message>
    );
  } else if (s.decision) {
    content = <DecisionView state={s} slug={slug} />;
  } else if (!round) {
    content = <BeforeStart />;
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
    <div className="min-h-[100dvh]">
      <Backdrop intensity={0.8} />
      {connection && <ConnectionBanner connection={connection} />}
      <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between py-2">
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
      <p className="mt-3 max-w-sm text-base leading-relaxed text-white/70">{children}</p>
    </div>
  );
}

function BeforeStart() {
  return (
    <div>
      <h1 className="text-gradient font-display text-4xl font-extrabold leading-tight">IT-ВЕЧЕ</h1>
      <p className="mt-2 font-display text-lg font-semibold">Будущее цифровых 15 минут</p>
      <p className="mt-1 text-white/65">Три сценария. Один выбор. Решение за вами.</p>
      <div className="glass mt-6 flex items-center gap-3 rounded-2xl p-4">
        <Hourglass className="h-5 w-5 shrink-0 text-electric-soft" aria-hidden />
        <p className="text-sm text-white/80">Голосование скоро начнётся. Страница обновится сама — держите её открытой.</p>
      </div>
      <ul className="mt-6 space-y-3">
        {OPTIONS.map((o) => {
          const a = accentStyles[o.accent];
          return (
            <li key={o.id} className="glass flex items-center gap-3 rounded-2xl p-4">
              <OptionIcon id={o.id} className={`h-6 w-6 shrink-0 ${a.text}`} />
              <div>
                <p className="font-semibold">
                  <span className={`font-display text-sm ${a.text}`}>{o.number}</span> {o.title}
                </p>
                <p className="text-sm text-white/60">«{o.slogan}»</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
      <p className="mt-2 text-white/70">Код напечатан на карточке. Он анонимный и не связан с вашим именем.</p>
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
        className="mt-6 w-full rounded-2xl border border-white/15 bg-ink-850 px-5 py-4 text-center font-display text-2xl tracking-[0.2em] placeholder:text-white/25"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-coral-soft">
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
      else setError({ text: 'Сервер не подтвердил голос. Попробуйте ещё раз.', retry: true });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'network', '');
      if (err.code === 'already_voted') onAlreadyVoted(round.id);
      else if (err.code === 'invalid_code') onInvalidCode();
      else if (err.code === 'round_closed') setError({ text: 'Тур уже закрыт — голос не учтён.', retry: false });
      else if (err.code === 'network' || err.status >= 500)
        setError({ text: 'Нет связи с сервером. Голос НЕ отправлен. Проверьте интернет и повторите.', retry: true });
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
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">{roundLabel(round.type, round.number)}</p>
      <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight">Ваш голос имеет значение</h1>
      <p className="mt-2 text-white/65">{round.type === 'main' ? 'Выберите один из трёх сценариев.' : 'Выберите один из вариантов этого тура.'} Голосование анонимное.</p>

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
            <motion.div role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3 flex items-start gap-3 rounded-2xl border border-coral/50 bg-ink-850 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-coral" aria-hidden />
              <p className="text-sm text-white/90">{error.text}</p>
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
            <p className="text-white/70">«{sel.slogan}». После подтверждения изменить выбор в этом туре нельзя.</p>
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
  return (
    <div className="flex min-h-[65dvh] flex-col items-center justify-center text-center">
      <motion.div
        initial={fresh ? { scale: 0.6, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald/15 ring-2 ring-emerald/50"
      >
        <CheckCircle2 className="h-12 w-12 text-emerald" aria-hidden />
      </motion.div>
      <h1 className="font-display text-[26px] font-semibold leading-tight" role="status">
        {fresh ? 'Ваш голос принят!' : 'Вы уже проголосовали'}
      </h1>
      <p className="mt-2 text-white/70">{fresh ? 'Спасибо за участие в IT-вече' : 'В этом туре ваш голос уже учтён сервером'}</p>
      {opt && (
        <p className="mt-4 text-sm text-white/55">
          Ваш выбор: <span className={`font-semibold ${accentStyles[opt.accent].text}`}>{opt.title}</span>
        </p>
      )}
      <div className="glass mt-8 w-full rounded-2xl p-5">
        <p className="text-sm uppercase tracking-[0.2em] text-white/50">Голосование идёт</p>
        <p className="mt-2 text-sm text-white/55">Голосов принято</p>
        <p className="font-display text-3xl font-semibold tabular-nums" aria-live="polite">
          {state.voteCount}
          {state.session.expectedParticipants ? <span className="text-white/45"> из {state.session.expectedParticipants}</span> : null}
        </p>
        <p className="mt-1 text-sm text-white/55">Результаты скрыты до завершения тура</p>
      </div>
    </div>
  );
}

function ResultsView({ result }: { result: PublicRoundResult }) {
  const more = result.outcome.kind === 'runoff' || result.outcome.kind === 'tiebreak' || result.outcome.kind === 'tie' || result.outcome.kind === 'no_votes';
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">{roundLabel(result.type, result.number)} · итоги</p>
      <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight">{result.type === 'main' ? 'IT-вече завершено' : 'Тур завершён'}</h1>
      <p className="mt-1 text-white/60">
        Действительных голосов: {result.total}
      </p>
      <div className="glass mt-6 rounded-3xl p-5">
        <PhoneBars result={result} />
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="font-display text-lg font-semibold">{outcomeHeadline(result.outcome)}</p>
        <p className="mt-1 text-sm text-white/70">{outcomeDetail(result.outcome)}</p>
      </div>
      {more && <p className="mt-5 text-center text-sm text-white/55">Держите страницу открытой — следующий тур появится автоматически.</p>}
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
      <p className="text-center text-sm font-semibold uppercase tracking-[0.3em] text-white/55">Решение принято</p>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className={`glass relative mt-5 overflow-hidden rounded-3xl border-2 ${a.border} p-6 text-center ${a.glow}`}
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.gradient}`} aria-hidden />
        <OptionIcon id={o.id} className={`relative mx-auto h-12 w-12 ${a.text}`} />
        <p className={`relative mt-3 font-display text-sm font-semibold ${a.text}`}>{o.number}</p>
        <h1 className="relative font-display text-3xl font-extrabold leading-tight">{o.title}</h1>
        <p className={`relative mt-4 font-display text-lg font-semibold ${a.text}`}>{o.finalPhrase}</p>
        <p className="relative mt-3 text-sm text-white/70">
          {d.optionId === 'freedom' ? 'Регулярный формат завершается. Контрольный пересмотр — через три месяца' : 'Проверим выбранный формат в течение трёх месяцев'}
        </p>
      </motion.div>
      {d.optionId === 'relay' && (
        <div className="mt-6 text-center">
          {sent ? (
            <div className="glass rounded-2xl p-5">
              <Sparkles className="mx-auto h-6 w-6 text-emerald" aria-hidden />
              <p className="mt-2 font-semibold">Спасибо! Организатор свяжется с вами.</p>
            </div>
          ) : (
            <>
              <p className="font-display text-xl font-semibold">Кто готов принять цифровую эстафету?</p>
              <Button className="mt-4 w-full !bg-emerald text-lg !text-ink-900 hover:!bg-emerald-soft" onClick={() => setFormOpen(true)}>
                У меня есть кейс!
              </Button>
              <p className="mt-2 text-xs text-white/50">Форма не связана с вашим анонимным голосом</p>
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
        <details className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <summary className="cursor-pointer font-semibold">Итоги голосования</summary>
          <div className="mt-4 space-y-6">
            {state.results.map((r) => (
              <div key={r.roundId}>
                <p className="mb-3 text-sm text-white/60">
                  {roundLabel(r.type, r.number)} · {r.total} {votesWord(r.total)}
                </p>
                <PhoneBars result={r} />
              </div>
            ))}
          </div>
        </details>
      )}
      <p className="mt-6 text-center text-xs text-white/45">
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
            className="w-full rounded-2xl border border-white/15 bg-ink-900 px-4 py-3 text-base placeholder:text-white/30"
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
            className="w-full rounded-2xl border border-white/15 bg-ink-900 px-4 py-3 text-base placeholder:text-white/30"
            placeholder="Имя и телефон, почта или мессенджер"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-coral-soft">
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

