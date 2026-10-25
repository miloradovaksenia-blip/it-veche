import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import type { VoteOption } from '../../../shared/options';
import { accentStyles } from '../lib/accent';
import { OptionArt } from './Scene';

/** Карточка-постер для экрана зала. Все три карточки одинакового веса. */
export function HallOptionCard({ option, index, dimmed = false }: { option: VoteOption; index: number; dimmed?: boolean }) {
  const a = accentStyles[option.accent];
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: dimmed ? 0.35 : 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay: 0.15 + index * 0.12,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="poster relative flex h-full flex-col overflow-hidden rounded-[16px] bg-ink-850"
    >
      <div className="relative h-[42%] shrink-0 overflow-hidden">
        <OptionArt id={option.id} className="poster-art h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/10 to-transparent" />
        <span className={`absolute left-6 top-5 font-display text-[40px] font-extrabold leading-none [text-shadow:0_2px_14px_rgb(5_13_29),0_0_4px_rgb(5_13_29)] ${a.text}`}>{option.number}</span>
      </div>
      <div className="relative flex flex-1 flex-col px-7 pb-6 pt-2">
        <h3 className="font-display text-[24px] font-extrabold uppercase leading-tight text-ice">{option.title}</h3>
        <p className="mt-2 text-[16px] leading-snug text-muted">{option.description}</p>
        <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
          <p className={`text-[19px] font-semibold ${a.text}`}>{option.slogan}</p>
          <ArrowRight className="h-6 w-6 text-neon" strokeWidth={1.75} aria-hidden />
        </div>
      </div>
    </motion.article>
  );
}

/** Карточка-выбор на телефоне: большая зона касания, состояние «выбрано». */
export function SelectOptionCard({
  option,
  selected,
  onSelect,
  disabled,
  tabIndex,
  onKeyDown,
  inputRef,
}: {
  option: VoteOption;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  tabIndex: number;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef?: (el: HTMLButtonElement | null) => void;
}) {
  const a = accentStyles[option.accent];
  return (
    <button
      ref={inputRef}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`poster relative w-full overflow-hidden rounded-[16px] bg-ink-850 text-left active:scale-[0.99] ${selected ? 'poster-active' : ''}`}
    >
      <div className="relative h-36 overflow-hidden">
        <OptionArt id={option.id} className="poster-art h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/20 to-transparent" />
        <span className={`absolute left-4 top-3 font-display text-2xl font-extrabold ${a.text}`}>{option.number}</span>
        <span
          aria-hidden
          className={`absolute right-4 top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
            selected ? 'border-transparent bg-neon text-ink-900 shadow-neon' : 'border-steel/50 bg-ink-900/60'
          }`}
        >
          {selected && <Check className="h-4 w-4" strokeWidth={3} />}
        </span>
      </div>
      <div className="relative px-5 pb-5">
        <h3 className="font-display text-[18px] font-extrabold uppercase leading-tight text-ice">{option.title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{option.description}</p>
        <p className={`mt-3 text-sm font-semibold ${a.text}`}>{option.slogan}</p>
      </div>
    </button>
  );
}

/** Карточка варианта в повестке (только для чтения, до старта голосования) — фото-постер как на референсе. */
export function AgendaOptionCard({ option }: { option: VoteOption }) {
  const a = accentStyles[option.accent];
  return (
    <article className="poster relative overflow-hidden rounded-[16px] bg-ink-850">
      <div className="relative h-44 overflow-hidden">
        <OptionArt id={option.id} className="poster-art h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/10 to-transparent" />
        <span className={`absolute left-4 top-3 font-display text-2xl font-extrabold [text-shadow:0_2px_10px_rgb(5_13_29)] ${a.text}`}>{option.number}</span>
      </div>
      <div className="relative -mt-8 px-5 pb-4">
        <h3 className="font-display text-[19px] font-extrabold uppercase leading-tight text-ice">{option.title}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{option.description}</p>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <p className={`text-sm font-semibold ${a.text}`}>«{option.slogan}»</p>
          <ArrowRight className="h-5 w-5 shrink-0 text-neon" strokeWidth={1.75} aria-hidden />
        </div>
      </div>
    </article>
  );
}
