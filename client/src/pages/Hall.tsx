import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2 } from 'lucide-react';
import { OPTIONS, getOption } from '../../../shared/options';
import type { PublicRoundResult, PublicState } from '../../../shared/types';
import { useLive, usePublicBaseUrl } from '../lib/live';
import { accentStyles } from '../lib/accent';
import { outcomeDetail, outcomeHeadline, roundLabel } from '../lib/text';
import { HallOptionCard } from '../components/OptionCard';
import { HallBars } from '../components/Results';
import { Backdrop, ConnectionBanner, DemoBadge, Logo, OptionIcon, QrCode, Spinner, StatusPill } from '../components/ui';

const W = 1920;
const H = 1080;

/** Сцена 16:9, масштабируется под любой экран/проектор без искажений. */
function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden">
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'center' }} className="relative shrink-0">
        {children}
      </div>
    </div>
  );
}

type Phase = 'intro' | 'voting' | 'closed' | 'results' | 'decision';

function phaseOf(s: PublicState): Phase {
  if (s.decision) return 'decision';
  if (!s.round) return 'intro';
  if (s.round.status === 'open') return 'voting';
  if (s.round.status === 'closed') return 'closed';
  return 'results';
}

export default function Hall() {
  const { slug = '' } = useParams();
  const { data, connection, notFound } = useLive<PublicState>(`/api/sessions/${slug}/stream`, `/api/sessions/${slug}/state`);
  const base = usePublicBaseUrl();
  const voteUrl = `${base}/s/${slug}`;
  const shortUrl = voteUrl.replace(/^https?:\/\//, '');

  useEffect(() => {
    document.title = 'IT-ВЕЧЕ · экран зала';
  }, []);

  if (notFound) return <Centered>Сессия не найдена. Проверьте ссылку в админ-панели.</Centered>;
  if (!data) return <Spinner />;

  const phase = phaseOf(data);
  const lastResult = data.results[data.results.length - 1];

  return (
    <>
      <Backdrop intensity={phase === 'decision' ? 1.3 : 1} />
      <ConnectionBanner connection={connection} />
      <FullscreenHint />
      <Stage>
        <header className="absolute inset-x-[72px] top-[56px] flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Logo />
            {data.session.isDemo && <DemoBadge />}
          </div>
          <HallStatus state={data} phase={phase} />
        </header>
        <AnimatePresence mode="wait">
          <motion.main
            key={phase + (data.round?.id ?? '') + (phase === 'results' ? lastResult?.roundId : '')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="absolute inset-x-[72px] bottom-[64px] top-[140px]"
          >
            {phase === 'intro' && <Intro voteUrl={voteUrl} shortUrl={shortUrl} />}
            {phase === 'voting' && <Voting state={data} voteUrl={voteUrl} shortUrl={shortUrl} />}
            {phase === 'closed' && <Closed state={data} />}
            {phase === 'results' && lastResult && <Results result={lastResult} />}
            {phase === 'decision' && <Decision state={data} voteUrl={voteUrl} shortUrl={shortUrl} />}
          </motion.main>
        </AnimatePresence>
      </Stage>
    </>
  );
}

function HallStatus({ state, phase }: { state: PublicState; phase: Phase }) {
  if (phase === 'voting') return <StatusPill tone="live">Вече открыто · {roundLabel(state.round!.type, state.round!.number)}</StatusPill>;
  if (phase === 'intro') return <StatusPill tone="idle">Скоро начнём</StatusPill>;
  if (phase === 'decision') return <StatusPill tone="done">Решение принято</StatusPill>;
  return <StatusPill tone="done">{roundLabel(state.round!.type, state.round!.number)} завершён</StatusPill>;
}

function Intro({ voteUrl, shortUrl }: { voteUrl: string; shortUrl: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-16">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-gradient font-display text-[148px] font-extrabold leading-[0.95] tracking-tight"
          >
            IT-ВЕЧЕ
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.5 }} className="mt-6 font-display text-[40px] font-semibold">
            Будущее цифровых 15 минут
          </motion.p>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }} className="mt-3 text-[28px] text-white/65">
            Три сценария. Один выбор. Решение за вами.
          </motion.p>
        </div>
        <QrPanel voteUrl={voteUrl} shortUrl={shortUrl} size={250} caption="Наведите камеру телефона" />
      </div>
      <div className="mt-auto grid grid-cols-3 gap-8">
        {OPTIONS.map((o, i) => (
          <HallOptionCard key={o.id} option={o} index={i} />
        ))}
      </div>
    </div>
  );
}

function QrPanel({ voteUrl, shortUrl, size, caption }: { voteUrl: string; shortUrl: string; size: number; caption: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="glass flex shrink-0 flex-col items-center rounded-[32px] p-6"
    >
      <QrCode value={voteUrl} size={size} className="shadow-[0_0_80px_-20px_rgba(255,255,255,0.45)]" label={`QR-код для голосования: ${voteUrl}`} />
      <p className="mt-4 text-[20px] text-white/60">{caption}</p>
      <p className="mt-1 font-display text-[24px] font-semibold tracking-wide">{shortUrl}</p>
    </motion.div>
  );
}

function Voting({ state, voteUrl, shortUrl }: { state: PublicState; voteUrl: string; shortUrl: string }) {
  const round = state.round!;
  const expected = state.session.expectedParticipants;
  const progress = expected ? Math.min(1, state.voteCount / expected) : null;
  return (
    <div className="flex h-full gap-16">
      <div className="flex flex-1 flex-col">
        <p className="font-display text-[28px] font-semibold uppercase tracking-[0.25em] text-white/50">{roundLabel(round.type, round.number)}</p>
        <h1 className="mt-4 font-display text-[110px] font-extrabold leading-none">Голосование идёт</h1>
        <div className="mt-14 flex items-end gap-6">
          <span className="text-[32px] text-white/65">Голосов принято:</span>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={state.voteCount}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="font-display text-[160px] font-extrabold leading-[0.8] tabular-nums"
              aria-live="polite"
            >
              {state.voteCount}
            </motion.span>
          </AnimatePresence>
          {expected && <span className="font-display text-[56px] font-semibold leading-none text-white/45">из {expected}</span>}
        </div>
        {progress !== null && (
          <div className="mt-10 h-4 w-[900px] overflow-hidden rounded-full bg-white/10">
            <motion.div
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-coral via-electric to-emerald"
            />
          </div>
        )}
        <div className="mt-auto">
          <p className="mb-5 text-[24px] text-white/55">{round.type === 'main' ? 'Варианты' : 'В этом туре'}</p>
          <div className="flex gap-6">
            {round.eligible.map((id) => {
              const o = getOption(id)!;
              const a = accentStyles[o.accent];
              return (
                <div key={id} className="glass flex items-center gap-4 rounded-2xl px-7 py-5">
                  <OptionIcon id={id} className={`h-8 w-8 ${a.text}`} />
                  <span className="font-display text-[28px] font-semibold">{o.title}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-[22px] text-white/45">Распределение голосов скрыто до завершения тура</p>
        </div>
      </div>
      <div className="flex items-center">
        <QrPanel voteUrl={voteUrl} shortUrl={shortUrl} size={360} caption="Ещё не проголосовали? Сканируйте" />
      </div>
    </div>
  );
}

function Closed({ state }: { state: PublicState }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="font-display text-[28px] font-semibold uppercase tracking-[0.25em] text-white/50">{roundLabel(state.round!.type, state.round!.number)}</p>
      <h1 className="mt-6 font-display text-[120px] font-extrabold leading-none">Голосование завершено</h1>
      <p className="mt-8 text-[36px] text-white/65">
        Принято голосов: <span className="font-display font-semibold text-white">{state.voteCount}</span>
      </p>
      <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.4, repeat: Infinity }} className="mt-14 text-[30px] text-white/55">
        Подводим итоги…
      </motion.p>
    </div>
  );
}

function Results({ result }: { result: PublicRoundResult }) {
  const heading = result.type === 'main' ? 'IT-вече завершено' : `${roundLabel(result.type, result.number)} завершён`;
  return (
    <div className="flex h-full flex-col">
      <div className="text-center">
        <motion.h1 initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} className="font-display text-[84px] font-extrabold leading-none">
          {heading}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.4 }} className="mt-4 text-[28px] text-white/60">
          Действительных голосов: {result.total}
        </motion.p>
      </div>
      <div className="min-h-0 flex-1 py-8">
        <HallBars result={result} />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 3.1, duration: 0.5 }}
        className="glass mx-auto rounded-3xl px-12 py-6 text-center"
      >
        <p className="font-display text-[40px] font-semibold">{outcomeHeadline(result.outcome)}</p>
        <p className="mt-2 text-[26px] text-white/70">{outcomeDetail(result.outcome)}</p>
      </motion.div>
    </div>
  );
}

function Decision({ state, voteUrl, shortUrl }: { state: PublicState; voteUrl: string; shortUrl: string }) {
  const d = state.decision!;
  const o = getOption(d.optionId)!;
  const a = accentStyles[o.accent];
  const isRelay = d.optionId === 'relay';
  const isFreedom = d.optionId === 'freedom';
  const subtitle = isFreedom ? 'Регулярный формат завершается. Контрольный пересмотр — через три месяца' : 'Проверим выбранный формат в течение трёх месяцев';
  const confirmation = d.method === 'ceo' ? 'Решение генерального директора после равенства голосов' : 'По итогам голосования, подтверждено генеральным директором';
  const sparks = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: (i * 137) % 100, d: (i % 5) * 0.4, s: 4 + (i % 3) * 3 })), []);

  return (
    <div className="relative flex h-full items-center gap-16">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {sparks.map((p, i) => (
          <motion.span
            key={i}
            className={`absolute rounded-full ${a.bg}`}
            style={{ left: `${p.x}%`, bottom: 0, width: p.s, height: p.s, filter: 'blur(1px)' }}
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: -700, opacity: [0, 0.8, 0] }}
            transition={{ delay: 1 + p.d, duration: 4, repeat: Infinity, repeatDelay: 2 }}
          />
        ))}
      </div>
      <div className="relative flex-1">
        <motion.p
          initial={{ opacity: 0, letterSpacing: '0.6em' }}
          animate={{ opacity: 1, letterSpacing: '0.3em' }}
          transition={{ duration: 0.6 }}
          className="font-display text-[34px] font-semibold uppercase text-white/60"
        >
          Решение принято
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex items-center gap-8"
        >
          <span className={`flex h-[130px] w-[130px] items-center justify-center rounded-[36px] border-2 ${a.border} bg-ink-900/50 ${a.glow}`}>
            <OptionIcon id={o.id} className={`h-16 w-16 ${a.text}`} />
          </span>
          <div>
            <span className={`font-display text-[36px] font-semibold ${a.text}`}>{o.number}</span>
            <h1 className="font-display text-[104px] font-extrabold leading-none">{o.title}</h1>
          </div>
        </motion.div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.9, duration: 0.5 }} className={`mt-12 max-w-[1150px] font-display text-[42px] font-semibold leading-tight ${a.text}`}>
          {o.finalPhrase}
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.3, duration: 0.5 }} className="mt-6 text-[30px] text-white/75">
          {subtitle}
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6, duration: 0.5 }} className="mt-3 text-[22px] text-white/45">
          {confirmation}
        </motion.p>
      </div>
      {isRelay && (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 3, duration: 0.6 }} className="relative w-[520px] shrink-0">
          <div className="glass rounded-[32px] p-8 text-center">
            <p className="font-display text-[34px] font-semibold leading-tight">Кто готов принять цифровую эстафету?</p>
            <div className="mt-6 flex justify-center">
              <QrCode value={voteUrl} size={260} label={`QR-код: ${voteUrl}`} />
            </div>
            <p className="mt-5 text-[22px] text-white/65">
              Нажмите <span className="font-semibold text-emerald">«У меня есть кейс!»</span> на телефоне
            </p>
            <p className="mt-1 font-display text-[22px] font-semibold">{shortUrl}</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function FullscreenHint() {
  const [visible, setVisible] = useState(true);
  const timer = useRef<number>();
  useEffect(() => {
    timer.current = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer.current);
  }, []);
  if (!visible || !document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void document.documentElement.requestFullscreen?.();
        setVisible(false);
      }}
      className="glass fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white/80"
    >
      <Maximize2 className="h-4 w-4" aria-hidden /> Во весь экран
    </button>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <>
      <Backdrop />
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-xl text-white/70">{children}</div>
    </>
  );
}

