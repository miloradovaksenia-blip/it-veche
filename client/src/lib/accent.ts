import type { Accent } from '../../../shared/options';

export const accentStyles: Record<Accent, { text: string; bg: string; border: string; ring: string; glow: string; hex: string; gradient: string }> = {
  coral: {
    text: 'text-coral',
    bg: 'bg-coral',
    border: 'border-coral/60',
    ring: 'ring-coral',
    glow: 'shadow-[0_0_60px_-12px_rgb(var(--coral)/0.65)]',
    hex: '#FF6F5E',
    gradient: 'from-coral/25 via-coral/5 to-transparent',
  },
  blue: {
    text: 'text-electric',
    bg: 'bg-electric',
    border: 'border-electric/60',
    ring: 'ring-electric',
    glow: 'shadow-[0_0_60px_-12px_rgb(var(--blue)/0.65)]',
    hex: '#3D8BFF',
    gradient: 'from-electric/25 via-electric/5 to-transparent',
  },
  emerald: {
    text: 'text-emerald',
    bg: 'bg-emerald',
    border: 'border-emerald/60',
    ring: 'ring-emerald',
    glow: 'shadow-[0_0_60px_-12px_rgb(var(--emerald)/0.65)]',
    hex: '#2ED8A3',
    gradient: 'from-emerald/25 via-emerald/5 to-transparent',
  },
};
