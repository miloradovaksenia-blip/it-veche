import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ArrowRight, EyeOff, Hash, Maximize2, ShieldCheck, Timer, Users, Vote } from 'lucide-react';
import { OPTIONS, getOption } from '../../../shared/options';
import type { PublicRoundResult, PublicState } from '../../../shared/types';
import { useLive, usePublicBaseUrl } from '../lib/live';
import { accentStyles } from '../lib/accent';
import { outcomeDetail, outcomeHeadline, roundLabel } from '../lib/text';
import { HallOptionCard } from '../components/OptionCard';
import { HallBars, LiveBars } from '../components/Results';
import { OptionArt } from '../components/Scene';
import { Backdrop, ConnectionBanner, ChromeText, DemoBadge, HeroPhoto, Logo, MetalTitle, QrCode, Spinner, StatPanel, StatusPill } from '../components/ui';

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
      <div
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
        className="relative shrink-0 overflow-hidden"
      >
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

const STEPS: { label: string; phases: Phase[] }[] = [
  { label: 'Повестка', phases: ['intro'] },
  { label: 'Голосование', phases: ['voting'] },
  { label: 'Итоги', phases: ['closed', 'results'] },
  { label: 'Решение', phases: ['decision'] },
];

export default function Hall() {
  const { slug = '' } = useParams();
  const { data, connection, notFound } = useLive<PublicState>(`/api/sessions/${slug}/stream`, `/api/sessions/${slug}/state`);
  const base = usePublicBaseUrl();
  const voteUrl = `${base}/s/${slug}`;
  const shortUrl = voteUrl.replace(/^https?:\/\//, '');

  useEffect(() => {
    document.title = 'ИТ ВЕЧЕ · экран зала';
  }, []);

  if (notFound) return <Centered>Сессия не найдена. Проверьте ссылку в админ-панели.</Centered>;
  if (!data) return <Spinner />;

  const phase = phaseOf(data);
  const lastResult = data.results[data.results.length - 1];

  return (
    <>
      <Backdrop />
      <ConnectionBanner connection={connection} />
      <FullscreenHint />
      <Stage>
        {/* Фото площадки с неоновой дугой: справа на экране повестки, приглушённо — фоном на остальных. */}
        {phase === 'intro' ? (
          <HeroPhoto className="right-0 top-0 h-[760px] w-[900px]" position="object-[center_12%]" wordsClass="text-[30px] !right-[5%] !top-[40%]" />
        ) : (
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-25">
            <img src="/img/hero.webp" alt="" className="photo-fade-left absolute right-0 top-0 h-full w-[60%] object-cover object-top" />
            <div className="absolute inset-0 bg-gradient-to-r from-ink-900 via-ink-900/40 to-transparent" />
          </div>
        )}

        {/* Навигация */}
        <header className="absolute inset-x-0 top-0 z-10 flex h-[84px] items-center border-b border-line bg-ink-900/80 px-[72px] backdrop-blur-[14px]">
          <div className="flex items-center gap-5">
            <Logo />
            {data.session.isDemo && <DemoBadge />}
          </div>
          <nav aria-label="Этапы" className="absolute left-1/2 flex -translate-x-1/2 gap-12">
            {STEPS.map((s) => {
              const active = s.phases.includes(phase);
              return (
                <span key={s.label} className={`relative text-[17px] font-semibold ${active ? 'text-ice' : 'text-muted/60'}`}>
                  {s.label}
                  {active && <span className="light-line absolute -bottom-[31px] left-0 right-0" />}
                </span>
              );
            })}
          </nav>
          <div className="ml-auto">
            <HallStatus state={data} phase={phase} />
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={phase + (data.round?.id ?? '') + (phase === 'results' ? lastResult?.roundId : '')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-[72px] bottom-[44px] top-[120px]"
          >
            {phase === 'intro' && <Intro state={data} voteUrl={voteUrl} shortUrl={shortUrl} />}
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

/** Повестка: вопрос, вынесенный на вече, и три варианта ответа — до старта голосования. */
function Intro({ state, voteUrl, shortUrl }: { state: PublicState; voteUrl: string; shortUrl: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="relative max-w-[1060px]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <MetalTitle bar className="text-[124px]" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="mt-7 font-display text-[40px] font-black uppercase leading-none text-ice [text-shadow:0_2px_16px_rgb(5_13_29)]"
        >
          Твой голос. Наше будущее.
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }} className="mt-4 text-[22px] text-ice/90">
          <span className="text-neon">Выбирай формат</span>, поддерживай коллег и определяй <span className="text-neon">будущее цифровых 15 минут</span> вместе с нами.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }} className="mt-7">
          <p className="text-[16px] font-bold uppercase tracking-[0.3em] text-neon">Повестка вече</p>
          <h2 className="mt-2 text-[34px] font-extrabold leading-[1.15] text-ice">{state.session.agenda}</h2>
        </motion.div>
      </div>
      <div className="mt-auto grid h-[372px] grid-cols-[1fr_1fr_1fr_300px] gap-6">
        {OPTIONS.map((o, i) => (
          <HallOptionCard key={o.id} option={o} index={i} />
        ))}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="glass flex flex-col items-center justify-center rounded-[16px] p-5 text-center shadow-neon"
        >
          <QrCode value={voteUrl} size={210} className="rounded-xl" label={`QR-код для голосования: ${voteUrl}`} />
          <p className="mt-4 flex items-center gap-2 text-[15px] font-bold uppercase tracking-[0.14em] text-neon">
            Голосовать <ArrowRight className="h-5 w-5" aria-hidden />
          </p>
          <p className="mt-1 text-[17px] font-semibold text-ice">{shortUrl}</p>
        </motion.div>
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
      className="glass relative flex shrink-0 flex-col items-center rounded-[20px] p-6 shadow-neon"
    >
      <QrCode value={voteUrl} size={size} className="rounded-xl" label={`QR-код для голосования: ${voteUrl}`} />
      <p className="mt-5 flex items-center gap-2 text-[16px] font-bold uppercase tracking-[0.14em] text-neon">
        {caption} <ArrowRight className="h-5 w-5" aria-hidden />
      </p>
      <p className="mt-1 text-[22px] font-semibold text-ice">{shortUrl}</p>
    </motion.div>
  );
}

function Voting({ state, voteUrl, shortUrl }: { state: PublicState; voteUrl: string; shortUrl: string }) {
  const round = state.round!;
  const expected = state.session.expectedParticipants;
  const progress = expected ? Math.min(1, state.voteCount / expected) : null;
  const live = state.live && state.live.roundId === round.id ? state.live : null;
  const icon = 'h-7 w-7';
  return (
    <div className="flex h-full gap-14">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[20px] font-bold uppercase tracking-[0.3em] text-neon">{roundLabel(round.type, round.number)}</p>
        <h1 className="mt-3 font-display text-[84px] font-black uppercase leading-[0.95] text-ice [text-shadow:0_0_30px_rgb(23_107_255_/_0.45)]">Голосование идёт</h1>
        <div className="mt-8 flex items-end gap-6">
          <span className="pb-3 text-[28px] text-muted">Голосов принято:</span>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={state.voteCount}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-[150px] leading-[0.8] tabular-nums"
              aria-live="polite"
            >
              <ChromeText>{state.voteCount}</ChromeText>
            </motion.span>
          </AnimatePresence>
          {expected && <span className="pb-2 font-display text-[52px] font-semibold leading-none text-muted">из {expected}</span>}
        </div>
        {progress !== null && (
          <div className="mt-8 h-2 w-full overflow-hidden rounded-full bg-ink-800">
            <motion.div
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full rounded-full shadow-neon"
              style={{
                background: 'linear-gradient(100deg, #176BFF 0%, #168CFF 55%, #00DFFF 100%)',
              }}
            />
          </div>
        )}
        <div className="mt-auto space-y-5">
          {live ? (
            <div className="glass rounded-[18px] px-8 py-6">
              <p className="mb-4 flex items-center gap-3 text-[15px] font-bold uppercase tracking-[0.2em] text-neon">
                <span className="pulse-dot relative inline-block h-2.5 w-2.5 rounded-full text-neon">
                  <span className="absolute inset-0 rounded-full bg-current" />
                </span>
                Голоса в реальном времени
              </p>
              <LiveBars eligible={round.eligible} counts={live.counts} percents={live.percents} size="hall" />
            </div>
          ) : (
            <div className="flex gap-4">
              {round.eligible.map((id) => {
                const o = getOption(id)!;
                const a = accentStyles[o.accent];
                return (
                  <div key={id} className="poster flex flex-1 items-center gap-4 overflow-hidden rounded-[14px] bg-ink-850 pr-5">
                    <OptionArt id={id} className="h-[72px] w-[110px] shrink-0" />
                    <span className={`font-display text-[20px] font-extrabold ${a.text}`}>{o.number}</span>
                    <span className="text-[19px] font-extrabold uppercase tracking-wide text-ice">{o.title}</span>
                  </div>
                );
              })}
            </div>
          )}
          <StatPanel
            size="hall"
            cells={[
              {
                icon: <Vote className={icon} strokeWidth={1.6} />,
                value: state.voteCount,
                label: 'Голосов принято',
              },
              {
                icon: <Users className={icon} strokeWidth={1.6} />,
                value: expected ?? '—',
                label: 'Ожидаем участников',
              },
              {
                icon: <Hash className={icon} strokeWidth={1.6} />,
                value: round.eligible.length,
                label: 'Вариантов в туре',
              },
              live
                ? {
                    icon: <Activity className={icon} strokeWidth={1.6} />,
                    value: 'Live',
                    label: 'Распределение открыто',
                  }
                : {
                    icon: <EyeOff className={icon} strokeWidth={1.6} />,
                    value: 'Скрыто',
                    label: 'Распределение до конца тура',
                  },
            ]}
          />
        </div>
      </div>
      <div className="flex items-center">
        <QrPanel voteUrl={voteUrl} shortUrl={shortUrl} size={360} caption="Ещё не проголосовали?" />
      </div>
    </div>
  );
}

function Closed({ state }: { state: PublicState }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="text-[20px] font-bold uppercase tracking-[0.3em] text-neon">{roundLabel(state.round!.type, state.round!.number)}</p>
      <h1 className="mt-6 font-display text-[100px] font-extrabold uppercase leading-none text-ice">Голосование завершено</h1>
      <div className="light-line mx-auto mt-10 w-[640px]" />
      <p className="mt-10 text-[34px] text-muted">
        Принято голосов: <span className="font-display font-extrabold text-ice">{state.voteCount}</span>
      </p>
      <motion.p
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        className="mt-12 text-[28px] font-semibold uppercase tracking-[0.2em] text-neon"
      >
        Подводим итоги…
      </motion.p>
    </div>
  );
}

function Results({ result }: { result: PublicRoundResult }) {
  const heading = result.type === 'main' ? 'ИТ-вече завершено' : `${roundLabel(result.type, result.number)} завершён`;
  return (
    <div className="flex h-full flex-col">
      <div className="text-center">
        <motion.h1
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="font-display text-[72px] font-extrabold uppercase leading-none text-ice"
        >
          {heading}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-4 text-[22px] font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Действительных голосов: <span className="text-ice">{result.total}</span>
        </motion.p>
      </div>
      <div className="min-h-0 flex-1 py-8">
        <HallBars result={result} />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 3.1, duration: 0.5 }}
        className="glass mx-auto rounded-[18px] px-12 py-6 text-center shadow-neon"
      >
        <p className="font-display text-[36px] font-extrabold text-ice">{outcomeHeadline(result.outcome)}</p>
        <p className="mt-2 text-[24px] text-muted">{outcomeDetail(result.outcome)}</p>
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
  const confirmation =
    d.method === 'ceo' ? 'Решение генерального директора после равенства голосов' : 'По итогам голосования, подтверждено генеральным директором';
  const sparks = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: (i * 137) % 100,
        d: (i % 5) * 0.4,
        s: 2 + (i % 3) * 2,
      })),
    [],
  );

  return (
    <div className="relative flex h-full items-center gap-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {sparks.map((p, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-neon"
            style={{
              left: `${p.x}%`,
              bottom: 0,
              width: p.s,
              height: p.s,
              boxShadow: '0 0 8px rgba(0,223,255,.7)',
            }}
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: -700, opacity: [0, 0.8, 0] }}
            transition={{
              delay: 1 + p.d,
              duration: 4,
              repeat: Infinity,
              repeatDelay: 2,
            }}
          />
        ))}
      </div>
      <div className="relative flex-1">
        <motion.p
          initial={{ opacity: 0, letterSpacing: '0.6em' }}
          animate={{ opacity: 1, letterSpacing: '0.32em' }}
          transition={{ duration: 0.6 }}
          className="text-[30px] font-extrabold uppercase text-neon"
        >
          Решение принято
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex items-center gap-8"
        >
          <div className="poster-active h-[150px] w-[230px] shrink-0 overflow-hidden rounded-[16px] border">
            <OptionArt id={o.id} className="h-full w-full" />
          </div>
          <div>
            <span className={`font-display text-[34px] font-extrabold ${a.text}`}>{o.number}</span>
            <h1 className="text-[84px] leading-[0.95]">
              <ChromeText>{o.title}</ChromeText>
            </h1>
          </div>
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.9, duration: 0.5 }}
          className="mt-12 max-w-[1150px] text-[42px] font-extrabold uppercase leading-tight text-ice"
        >
          {o.finalPhrase}
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.3, duration: 0.5 }} className="mt-6 text-[28px] text-steel">
          {subtitle}
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6, duration: 0.5 }} className="mt-3 text-[20px] text-muted">
          {confirmation}
        </motion.p>
      </div>
      {isRelay && (
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 3, duration: 0.6 }}
          className="relative w-[500px] shrink-0"
        >
          <div className="glass rounded-[20px] p-8 text-center shadow-neon">
            <p className="text-[32px] font-extrabold uppercase leading-tight text-ice">Кто готов принять цифровую эстафету?</p>
            <div className="mt-6 flex justify-center">
              <QrCode value={voteUrl} size={250} className="rounded-xl" label={`QR-код: ${voteUrl}`} />
            </div>
            <p className="mt-5 text-[20px] text-muted">
              Нажмите <span className="font-bold text-neon">«У меня есть кейс!»</span> на телефоне
            </p>
            <p className="mt-1 text-[20px] font-semibold text-ice">{shortUrl}</p>
          </div>
        </motion.div>
      )}
      <p className="absolute bottom-0 left-0 flex items-center gap-3 text-[16px] font-bold uppercase tracking-[0.24em] text-muted">
        <ShieldCheck className="h-5 w-5 text-neon" aria-hidden /> Сила в людях, технологиях и твоём голосе
        <Timer className="ml-4 h-5 w-5 text-neon" aria-hidden /> {isFreedom ? 'Пересмотр — через 3 месяца' : 'Пилот — 3 месяца'}
      </p>
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
      className="btn-secondary fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full px-4 py-2 text-sm"
    >
      <Maximize2 className="h-4 w-4" aria-hidden /> Во весь экран
    </button>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <>
      <Backdrop />
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-xl text-muted">{children}</div>
    </>
  );
}
