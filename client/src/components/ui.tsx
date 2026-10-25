import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Compass, Feather, Users, WifiOff, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import type { OptionId } from '../../../shared/options';
import type { Connection } from '../lib/live';
import { IndustrialScene } from './Scene';

/**
 * Фон STEEL NEON: navy-градиент, мягкое синее свечение, тонкие световые линии.
 * scene=true добавляет ночную индустриальную сцену (кадрируется под экран).
 */
export function Backdrop({ intensity = 1, scene = false }: { intensity?: number; scene?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-900">
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #050D1D 0%, #071B36 100%)',
        }}
      />
      {scene && (
        <div className="absolute inset-x-0 bottom-0 h-[70vh] opacity-60">
          <IndustrialScene className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-ink-900" />
        </div>
      )}
      <div
        className="absolute -right-[20%] -top-[25%] h-[80vmax] w-[80vmax] rounded-full"
        style={{
          background: `radial-gradient(circle, rgb(23 107 255 / ${0.16 * intensity}), transparent 60%)`,
        }}
      />
      <div
        className="absolute -left-[30%] bottom-[-40%] h-[70vmax] w-[70vmax] rounded-full"
        style={{
          background: `radial-gradient(circle, rgb(0 223 255 / ${0.06 * intensity}), transparent 60%)`,
        }}
      />
      <div className="light-line absolute left-[8%] right-[40%] top-[18%] opacity-20" />
      <div className="light-line absolute left-[45%] right-[5%] top-[62%] opacity-10" />
    </div>
  );
}

/**
 * Знак события «ИТ ВЕЧЕ». Если в client/public/brand/logo.svg положить официальный
 * логотип компании, он появится слева (файл в проект не входит).
 */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const [brand, setBrand] = useState(true);
  return (
    <div className="flex items-center gap-3">
      {brand && (
        <>
          <img src="/brand/logo.svg" alt="" className={size === 'sm' ? 'h-5' : 'h-7'} onError={() => setBrand(false)} />
          <span className="h-5 w-px bg-line" aria-hidden />
        </>
      )}
      <span className="relative flex items-center gap-2">
        <span aria-hidden className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
          <span className="absolute h-2.5 w-2.5 rounded-full bg-neon shadow-neon" />
        </span>
        <span className={`font-display font-extrabold tracking-[0.14em] ${size === 'sm' ? 'text-sm' : 'text-base'}`}>
          <span className="metal-text">ИТ ВЕЧЕ</span>
        </span>
      </span>
    </div>
  );
}

/** Объёмный хромовый заголовок «ИТ ВЕЧЕ» (как на дизайн-референсе). */
export function MetalTitle({ className = '', lite = false, inline = false, bar = false }: { className?: string; lite?: boolean; inline?: boolean; bar?: boolean }) {
  const lines = inline ? ['ИТ ВЕЧЕ'] : ['ИТ', 'ВЕЧЕ'];
  if (lite)
    return (
      <h1 className={`metal-title-lite uppercase ${className}`}>
        {lines.map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
      </h1>
    );
  const text = lines.map((l) => (
    <span key={l} className="block">
      {l}
    </span>
  ));
  return (
    <h1 aria-label="ИТ ВЕЧЕ" className={`flex items-stretch gap-[0.1em] ${className}`}>
      {bar && <span aria-hidden className="chrome-bar my-[0.04em]" />}
      <span aria-hidden className="chrome3d">
        <span className="chrome3d__back">{text}</span>
        <span className="chrome3d__front">{text}</span>
      </span>
    </h1>
  );
}

/** Произвольный текст в объёмном хроме (крупные цифры, название решения). */
export function ChromeText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`chrome3d ${className}`}>
      <span aria-hidden className="chrome3d__back">
        <span>{children}</span>
      </span>
      <span className="chrome3d__front">
        <span>{children}</span>
      </span>
    </span>
  );
}

/** Панель цифр: равные ячейки, тонкие разделители, cyan-иконки в контурных квадратах. */
export function StatPanel({ cells, size = 'phone' }: { cells: { icon: ReactNode; value: ReactNode; label: string }[]; size?: 'phone' | 'hall' }) {
  const hall = size === 'hall';
  return (
    <div className={`glass grid rounded-[18px] shadow-[0_0_30px_-12px_rgba(23,107,255,0.6)] ${hall ? '' : 'grid-cols-2'}`} style={hall ? { gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` } : undefined}>
      {cells.map((c, i) => (
        <div
          key={i}
          className={`flex items-center ${hall ? 'gap-5 px-7 py-5' : 'gap-3 px-3.5 py-3.5'} ${
            hall ? (i ? 'border-l border-line' : '') : `${i % 2 ? 'border-l border-line' : ''} ${i > 1 ? 'border-t border-line' : ''}`
          }`}
        >
          <span className={`flex shrink-0 items-center justify-center rounded-xl border border-neon/50 text-neon ${hall ? 'h-14 w-14 [&_svg]:h-7 [&_svg]:w-7' : 'h-10 w-10 [&_svg]:h-5 [&_svg]:w-5'}`}>{c.icon}</span>
          <div className="min-w-0">
            <div className={`font-display font-extrabold leading-none text-ice tabular-nums ${hall ? 'text-[34px]' : 'text-[22px]'}`}>{c.value}</div>
            <div className={`mt-1.5 font-semibold uppercase tracking-[0.12em] text-muted ${hall ? 'text-[13px]' : 'text-[10px] leading-tight'}`}>{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Баннер «Сила в людях, технологиях и твоём голосе» с фото инженера. */
export function PowerBanner({ size = 'phone', className = '' }: { size?: 'phone' | 'hall'; className?: string }) {
  const hall = size === 'hall';
  return (
    <section className={`glass relative overflow-hidden rounded-[18px] ${className}`}>
      <img src="/img/banner.webp" alt="" aria-hidden className="photo-fade-left absolute inset-y-0 right-0 h-full w-[62%] object-cover object-top" />
      <div className={`relative ${hall ? 'max-w-[62%] px-10 py-9' : 'max-w-[68%] px-5 py-6'}`}>
        <p className={`font-display font-extrabold uppercase leading-[1.08] text-ice ${hall ? 'text-[38px]' : 'text-[19px]'}`}>Сила в людях, технологиях и твоём голосе</p>
        <p className={`mt-3 text-muted ${hall ? 'text-[20px]' : 'text-[13px]'}`}>Каждый голос приближает нас к новым возможностям.</p>
      </div>
    </section>
  );
}

/** Фото индустриальной площадки с неоновой дугой для героя страницы. */
export function HeroPhoto({
  className = '',
  words = true,
  wordsClass = '',
  position = 'object-top',
}: {
  className?: string;
  words?: boolean;
  wordsClass?: string;
  position?: string;
}) {
  return (
    <div aria-hidden className={`photo-fade-bottom pointer-events-none absolute ${className}`}>
      <img src="/img/hero.webp" alt="" className={`photo-fade-left h-full w-full object-cover ${position}`} />
      {words && (
        <ul className={`absolute right-[6%] top-[46%] space-y-[0.55em] font-display font-bold uppercase tracking-[0.06em] text-ice [text-shadow:0_0_14px_rgb(5_13_29)] ${wordsClass}`}>
          <li>Люди</li>
          <li>Технологии</li>
          <li>Развитие</li>
          <li>Результат</li>
        </ul>
      )}
    </div>
  );
}

export function OptionIcon({ id, className }: { id: OptionId; className?: string }) {
  const Icon = id === 'freedom' ? Feather : id === 'navigator' ? Compass : Users;
  return <Icon className={className} strokeWidth={1.6} aria-hidden />;
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-200">
      DEMO
    </span>
  );
}

export function StatusPill({ tone, children }: { tone: 'live' | 'idle' | 'done'; children: ReactNode }) {
  const color = tone === 'live' ? 'text-neon' : tone === 'done' ? 'text-electric-soft' : 'text-muted';
  return (
    <span className="glass inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.14em]">
      <span className={`pulse-dot relative inline-block h-2.5 w-2.5 rounded-full ${color} ${tone === 'live' ? '' : '[&::after]:hidden'}`}>
        <span className="absolute inset-0 rounded-full bg-current" />
      </span>
      <span className="text-ice">{children}</span>
    </span>
  );
}

export function QrCode({ value, className, label, size }: { value: string; className?: string; label?: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B0D12', light: '#FFFFFF' },
    })
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
            connection === 'offline' ? 'bg-danger-deep text-white' : 'bg-amber-300 text-ink-900'
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'btn-primary rounded-full',
    secondary: 'btn-secondary rounded-full disabled:opacity-40',
    danger: 'rounded-full border border-danger/60 bg-danger/15 text-danger-soft hover:bg-danger/25 disabled:opacity-40',
    ghost: 'rounded-full text-muted hover:text-ice hover:bg-ink-800 disabled:opacity-40',
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 px-6 py-3 font-bold tracking-wide transition-[background,transform,opacity,box-shadow,border-color] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Модальное окно подтверждения: Esc закрывает, фокус остаётся внутри. */
export function Modal({
  open,
  onClose,
  title,
  children,
  labelledBy = 'modal-title',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  labelledBy?: string;
}) {
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
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative m-0 w-full max-w-lg rounded-t-3xl border border-line bg-ink-850 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:m-4 sm:rounded-3xl"
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted" role="status">
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
