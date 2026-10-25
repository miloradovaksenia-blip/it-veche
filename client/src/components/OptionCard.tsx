import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { VoteOption } from '../../../shared/options';
import { accentStyles } from '../lib/accent';
import { OptionIcon } from './ui';

/** Карточка варианта для экрана зала. Все три карточки одинакового веса. */
export function HallOptionCard({ option, index, dimmed = false }: { option: VoteOption; index: number; dimmed?: boolean }) {
  const a = accentStyles[option.accent];
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: dimmed ? 0.35 : 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="glass relative flex h-full flex-col overflow-hidden rounded-[28px] p-8"
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.gradient}`} aria-hidden />
      <div className="relative flex items-start justify-between">
        <span className={`font-display text-[56px] font-semibold leading-none ${a.text}`}>{option.number}</span>
        <span className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${a.border} bg-ink-900/40`}>
          <OptionIcon id={option.id} className={`h-8 w-8 ${a.text}`} />
        </span>
      </div>
      <h3 className="relative mt-6 font-display text-[34px] font-semibold leading-tight">{option.title}</h3>
      <p className="relative mt-4 text-[20px] leading-relaxed text-white/75">{option.description}</p>
      <p className={`relative mt-auto pt-6 text-[20px] font-semibold ${a.text}`}>«{option.slogan}»</p>
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
      className={`glass relative w-full overflow-hidden rounded-3xl p-5 text-left transition-[transform,box-shadow,border-color] duration-300 active:scale-[0.99] ${
        selected ? `border-2 ${a.border} ${a.glow}` : 'border-2 border-white/10'
      }`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.gradient} transition-opacity duration-300 ${selected ? 'opacity-100' : 'opacity-40'}`} aria-hidden />
      <div className="relative flex items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${a.border} bg-ink-900/50`}>
          <OptionIcon id={option.id} className={`h-6 w-6 ${a.text}`} />
        </span>
        <div className="min-w-0 flex-1">
          <span className={`font-display text-sm font-semibold ${a.text}`}>{option.number}</span>
          <h3 className="font-display text-lg font-semibold leading-tight">{option.title}</h3>
        </div>
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
            selected ? `${a.bg} border-transparent text-ink-900` : 'border-white/30'
          }`}
        >
          {selected && <Check className="h-4 w-4" strokeWidth={3} />}
        </span>
      </div>
      <p className="relative mt-3 text-[15px] leading-relaxed text-white/75">{option.description}</p>
      <p className={`relative mt-2 text-sm font-semibold ${a.text}`}>«{option.slogan}»</p>
    </button>
  );
}
