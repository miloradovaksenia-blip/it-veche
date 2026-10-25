import type { Accent } from '../../../shared/options';

/**
 * STEEL NEON: три варианта различаются сюжетом иллюстрации и номером,
 * а цветом — лишь оттенком внутри одной холодной палитры (сталь, синий, cyan).
 * Визуальный вес карточек одинаковый.
 */
export const accentStyles: Record<
  Accent,
  {
    text: string;
    bg: string;
    border: string;
    ring: string;
    glow: string;
    hex: string;
    gradient: string;
  }
> = {
  coral: {
    text: 'text-steel',
    bg: 'bg-steel',
    border: 'border-steel/50',
    ring: 'ring-steel',
    glow: 'shadow-neon',
    hex: '#C6D7EB',
    gradient: 'from-steel/15 via-transparent to-transparent',
  },
  blue: {
    text: 'text-electric-soft',
    bg: 'bg-electric',
    border: 'border-electric/60',
    ring: 'ring-electric',
    glow: 'shadow-neon',
    hex: '#176BFF',
    gradient: 'from-electric/20 via-transparent to-transparent',
  },
  emerald: {
    text: 'text-neon',
    bg: 'bg-neon',
    border: 'border-neon/50',
    ring: 'ring-neon',
    glow: 'shadow-neon',
    hex: '#00DFFF',
    gradient: 'from-neon/15 via-transparent to-transparent',
  },
};
