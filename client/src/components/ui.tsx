import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Compass, Feather, Users, WifiOff, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import type { OptionId } from '../../../shared/options';
import type { Connection } from '../lib/live';

export function Backdrop({ intensity = 1 }: { intensity?: number }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-900">
      <div className="grid-bg absolute inset-0" />
      <div
        className="orb absolute -left-[15%] -top-[20%] h-[65vmax] w-[65vmax] rounded-full blur-[120px]"
        style={{ background: `radial-gradient(circle, rgb(255 111 94 / ${0.16 * intensity}), transparent 65%)` }}
      />
      <div
        className="orb orb-2 absolute -right-[20%] top-[5%] h-[70vmax] w-[70vmax] rounded-full blur-[120px]"
        style={{ background: `radial-gradient(circle, rgb(61 139 255 / ${0.18 * intensity}), transparent 65%)` }}
      />
      <div
        className="orb orb-3 absolute -bottom-[35%] left-[20%] h-[65vmax] w-[65vmax] rounded-full blur-[120px]"
        style={{ background: `radial-gradient(circle, rgb(46 216 163 / ${0.14 * intensity}), transparent 65%)` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(7_8_12/0.7)_100%)]" />
    </div>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dot = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-end gap-1" aria-hidden>
        <span className={`${dot} rounded-full bg-coral`} />
        <span className={`${dot} mb-1.5 rounded-full bg-electric`} />
        <span className={`${dot} rounded-full bg-emerald`} />
      </div>
      <span className={`font-display font-semibold tracking-[0.12em] ${size === 'sm' ? 'text-sm' : 'text-base'}`}>IT-ВЕЧЕ</span>
    </div>
  );
}

export function OptionIcon({ id, className }: { id: OptionId; className?: string }) {
  const Icon = id === 'freedom' ? Feather : id === 'navigator' ? Compass : Users;
  return <Icon className={className} strokeWidth={1.6} aria-hidden />;
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-300/15 px-3 py-1 font-display text-xs font-semibold tracking-[0.2em] text-amber-200">
      DEMO
    </span>
  );
}

export function StatusPill({ tone, children }: { tone: 'live' | 'idle' | 'done'; children: ReactNode }) {
  const color = tone === 'live' ? 'text-emerald' : tone === 'done' ? 'text-electric-soft' : 'text-white/60';
  return (
    <span className="glass inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold">
      <span className={`pulse-dot relative inline-block h-2.5 w-2.5 rounded-full ${color} ${tone === 'live' ? '' : '[&::after]:hidden'}`}>
        <span className="absolute inset-0 rounded-full bg-current" />
      </span>
      <span className="text-white/90">{children}</span>
    </span>
  );
}

export function QrCode({ value, className, label, size }: { value: string; className?: string; label?: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B0D12', light: '#FFFFFF' } })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label ?? `QR-код: ${value}`}
      style={size ? { width: size, height: size } : undefined}
      className={`overflow-hidden rounded-2xl bg-white p-2 [&_svg]:h-full [&_svg]:w-full ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function ConnectionBanner({ connection }: { connection: Connection }) {
  const show = connection === 'offline' || connection === 'polling';
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={`fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold ${
            connection === 'offline' ? 'bg-coral-deep text-white' : 'bg-amber-400 text-ink-900'
          }`}
        >
          {connection === 'offline' ? <WifiOff className="h-4 w-4" aria-hidden /> : <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {connection === 'offline' ? 'Нет связи с сервером. Переподключаемся…' : 'Соединение нестабильно — обновляем данные каждые 3 секунды'}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({
  variant = 'primary',
  className = '',
  children,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-white text-ink-900 hover:bg-white/90 disabled:bg-white/25 disabled:text-white/50',
    secondary: 'glass text-white hover:bg-white/10 disabled:opacity-40',
    danger: 'bg-coral-deep text-white hover:bg-coral disabled:opacity-40',
    ghost: 'text-white/70 hover:text-white hover:bg-white/5 disabled:opacity-40',
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 py-3 font-semibold transition-[background,transform,opacity] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Модальное окно подтверждения: Esc закрывает, фокус остаётся внутри. */
export function Modal({ open, onClose, title, children, labelledBy = 'modal-title' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus], button, input, textarea')?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]')].filter((el) => !el.hasAttribute('disabled'));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative m-0 w-full max-w-lg rounded-t-3xl border border-white/10 bg-ink-850 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:m-4 sm:rounded-3xl"
          >
            <h2 id={labelledBy} className="font-display text-xl font-semibold leading-snug">
              {title}
            </h2>
            <div className="mt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Spinner({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-white/60" role="status">
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
