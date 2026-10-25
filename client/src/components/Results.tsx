import { motion } from 'framer-motion';
import { getOption } from '../../../shared/options';
import type { PublicRoundResult } from '../../../shared/types';
import { accentStyles } from '../lib/accent';
import { votesWord } from '../lib/text';
import { OptionIcon } from './ui';

/** Столбчатые диаграммы для зала (16:9). Раскрываются с театральной паузой. */
export function HallBars({ result, delay = 1.2 }: { result: PublicRoundResult; delay?: number }) {
  const max = Math.max(1, ...result.eligible.map((id) => result.counts[id] ?? 0));
  const winner = result.outcome.kind === 'winner' ? result.outcome.optionId : null;
  const advancing =
    result.outcome.kind === 'runoff' ? result.outcome.finalists : result.outcome.kind === 'tiebreak' ? [...result.outcome.carried, ...result.outcome.contenders] : [];
  return (
    <div className="flex h-full items-end justify-center gap-14">
      {result.eligible.map((id, i) => {
        const o = getOption(id)!;
        const a = accentStyles[o.accent];
        const n = result.counts[id] ?? 0;
        const highlight = winner === id || advancing.includes(id);
        return (
          <div key={id} className="flex h-full w-[360px] flex-col items-center justify-end">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.9 + i * 0.15, duration: 0.5 }}
              className="mb-4 text-center"
            >
              <div className={`font-display text-[88px] font-extrabold leading-none ${a.text}`}>{result.percents[id]}%</div>
              <div className="mt-2 text-[22px] text-white/70">
                {n} {votesWord(n)}
              </div>
            </motion.div>
            <div className="relative w-full flex-1">
              <motion.div
                initial={{ height: '2%' }}
                animate={{ height: `${Math.max(2, (n / max) * 100)}%` }}
                transition={{ delay: delay + i * 0.15, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                className={`absolute inset-x-0 bottom-0 rounded-t-[28px] ${a.bg} ${highlight ? a.glow : ''}`}
                style={{ background: `linear-gradient(180deg, ${a.hex}, ${a.hex}55)` }}
              />
            </div>
            <div className="mt-5 flex items-center gap-3">
              <OptionIcon id={id} className={`h-8 w-8 ${a.text}`} />
              <span className="font-display text-[26px] font-semibold">{o.title}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Горизонтальные полосы для телефона. */
export function PhoneBars({ result }: { result: PublicRoundResult }) {
  return (
    <ul className="space-y-4">
      {result.eligible.map((id, i) => {
        const o = getOption(id)!;
        const a = accentStyles[o.accent];
        const n = result.counts[id] ?? 0;
        return (
          <li key={id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 font-semibold">
                <OptionIcon id={id} className={`h-4 w-4 ${a.text}`} />
                {o.title}
              </span>
              <span className="whitespace-nowrap text-sm text-white/70">
                <span className={`font-display text-base font-semibold ${a.text}`}>{result.percents[id]}%</span> · {n}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${o.title}: ${result.percents[id]}%, ${n} ${votesWord(n)}`}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${result.percents[id]}%` }}
                transition={{ delay: 0.4 + i * 0.12, duration: 0.6, ease: 'easeOut' }}
                className={`h-full rounded-full ${a.bg}`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
