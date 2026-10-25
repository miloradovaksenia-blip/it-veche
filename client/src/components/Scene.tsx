import { useId, useMemo } from 'react';

/** Детерминированный генератор, чтобы сцена не «прыгала» между рендерами. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
  o: number;
  c: string;
}

/**
 * Ночной металлургический комплекс: стальные конструкции, трубы, галерея
 * конвейера, освещённые окна, мокрый асфальт с отражениями и большая световая
 * дуга. Рисуется векторно — без внешних фотографий.
 */
export function IndustrialScene({ className = '', arc = true, seed = 7 }: { className?: string; arc?: boolean; seed?: number }) {
  const id = useId().replace(/:/g, '');
  const data = useMemo(() => {
    const r = rng(seed);
    // Дальний план: силуэты цехов.
    const far: { x: number; w: number; h: number }[] = [];
    for (let x = 0; x < 1000; ) {
      const w = 30 + r() * 70;
      far.push({ x, w, h: 90 + r() * 140 });
      x += w + r() * 8;
    }
    // Освещённые окна главного корпуса.
    const windows: Win[] = [];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 14; col++) {
        if (r() < 0.42) continue;
        windows.push({
          x: 520 + col * 24,
          y: 300 + row * 22,
          w: 14,
          h: 8,
          o: 0.25 + r() * 0.75,
          c: r() < 0.25 ? '#7AEFFF' : r() < 0.6 ? '#5C9BFF' : '#C6D7EB',
        });
      }
    }
    const particles = Array.from({ length: 36 }, () => ({
      x: r() * 1000,
      y: 80 + r() * 420,
      s: 0.6 + r() * 1.6,
      o: 0.2 + r() * 0.6,
    }));
    const lamps = Array.from({ length: 10 }, (_, i) => ({
      x: 40 + i * 98 + r() * 20,
      h: 40 + r() * 30,
    }));
    return { far, windows, particles, lamps };
  }, [seed]);

  return (
    <svg className={className} viewBox="0 0 1000 700" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#050D1D" />
          <stop offset="0.6" stopColor="#071B36" />
          <stop offset="1" stopColor="#0B2547" />
        </linearGradient>
        <radialGradient id={`halo${id}`} cx="0.64" cy="0.6" r="0.5">
          <stop offset="0" stopColor="#176BFF" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#176BFF" stopOpacity="0.14" />
          <stop offset="1" stopColor="#050D1D" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`steel${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#123563" />
          <stop offset="1" stopColor="#081833" />
        </linearGradient>
        <linearGradient id={`ground${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0A1F3D" />
          <stop offset="1" stopColor="#030812" />
        </linearGradient>
        <linearGradient id={`fog${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5C9BFF" stopOpacity="0" />
          <stop offset="1" stopColor="#5C9BFF" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id={`beam${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7AEFFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7AEFFF" stopOpacity="0" />
        </linearGradient>
        <filter id={`blur${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={`soft${id}`}>
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      <rect width="1000" height="700" fill={`url(#sky${id})`} />
      <rect width="1000" height="700" fill={`url(#halo${id})`} />

      {/* Световая дуга */}
      {arc && (
        <g className="arc-glow">
          <circle cx="640" cy="560" r="330" fill="none" stroke="#176BFF" strokeWidth="22" opacity="0.35" filter={`url(#blur${id})`} />
          <circle cx="640" cy="560" r="330" fill="none" stroke="#00DFFF" strokeWidth="4" opacity="0.95" />
          <circle cx="640" cy="560" r="330" fill="none" stroke="#E7F4FF" strokeWidth="1.2" opacity="0.9" />
          <circle cx="640" cy="560" r="372" fill="none" stroke="#176BFF" strokeWidth="1" opacity="0.35" />
        </g>
      )}

      {/* Частицы */}
      {data.particles.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.s} fill="#7AEFFF" opacity={p.o * 0.6} />
      ))}

      {/* Дальний план */}
      <g fill="#081A33" opacity="0.95">
        {data.far.map((b, i) => (
          <rect key={i} x={b.x} y={520 - b.h} width={b.w} height={b.h} />
        ))}
      </g>

      {/* Трубы и градирня */}
      <g fill={`url(#steel${id})`}>
        <rect x="430" y="110" width="22" height="420" />
        <rect x="468" y="160" width="18" height="370" />
        <rect x="880" y="140" width="24" height="390" />
        <path d="M150 520 C 170 400, 160 330, 140 280 L 260 280 C 240 330, 230 400, 250 520 Z" />
      </g>
      <g fill="#00DFFF">
        <circle cx="441" cy="118" r="2.4" />
        <circle cx="477" cy="168" r="2.2" />
        <circle cx="892" cy="148" r="2.4" />
      </g>
      <rect x="430" y="180" width="22" height="2" fill="#5C9BFF" opacity="0.7" />
      <rect x="880" y="220" width="24" height="2" fill="#5C9BFF" opacity="0.7" />

      {/* Главный корпус */}
      <rect x="505" y="280" width="360" height="250" fill={`url(#steel${id})`} stroke="#244D78" strokeWidth="1" />
      <rect x="505" y="276" width="360" height="4" fill="#00DFFF" opacity="0.65" />
      {data.windows.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} fill={w.c} opacity={w.o} />
      ))}
      {/* Вертикальные ригели — сильные вертикали */}
      <g stroke="#1B4272" strokeWidth="3">
        {[560, 640, 720, 800].map((x) => (
          <line key={x} x1={x} y1="280" x2={x} y2="530" />
        ))}
      </g>

      {/* Галерея конвейера */}
      <path d="M 120 470 L 505 330 L 505 350 L 120 492 Z" fill="#0C2649" stroke="#244D78" />
      <path d="M 120 470 L 505 330" stroke="#00DFFF" strokeWidth="2" opacity="0.85" />
      <path d="M 120 470 L 505 330" stroke="#00DFFF" strokeWidth="8" opacity="0.25" filter={`url(#soft${id})`} />
      <g stroke="#123563" strokeWidth="5">
        {[180, 260, 340, 420].map((x) => (
          <line key={x} x1={x} y1={470 - ((x - 120) * 140) / 385 + 12} x2={x} y2="530" />
        ))}
      </g>

      {/* Ближний цех слева */}
      <path d="M 0 530 L 0 400 L 60 380 L 120 400 L 120 530 Z" fill="#0A1F3D" />
      <rect x="10" y="430" width="100" height="3" fill="#176BFF" opacity="0.6" />

      {/* Фонари и прожекторные лучи */}
      {data.lamps.map((l, i) => (
        <g key={i}>
          <rect x={l.x} y={530 - l.h} width="2" height={l.h} fill="#1B4272" />
          <circle cx={l.x + 1} cy={530 - l.h} r="2.5" fill="#E7F4FF" />
          <path d={`M ${l.x + 1} ${530 - l.h} L ${l.x - 14} 530 L ${l.x + 16} 530 Z`} fill={`url(#beam${id})`} opacity="0.35" />
        </g>
      ))}

      {/* Мокрый асфальт и отражения */}
      <rect y="530" width="1000" height="170" fill={`url(#ground${id})`} />
      <g opacity="0.35" filter={`url(#soft${id})`}>
        <rect x="505" y="534" width="360" height="40" fill="#176BFF" opacity="0.35" />
        {data.windows
          .filter((_, i) => i % 3 === 0)
          .map((w, i) => (
            <rect key={i} x={w.x} y={534 + (530 - w.y) * 0.35} width={w.w} height="3" fill={w.c} opacity={w.o * 0.6} />
          ))}
        <path d="M 120 590 L 505 720" stroke="#00DFFF" strokeWidth="2" opacity="0.5" />
      </g>
      {arc && <ellipse cx="640" cy="560" rx="300" ry="26" fill="#00DFFF" opacity="0.1" filter={`url(#blur${id})`} />}
      <line x1="0" y1="530" x2="1000" y2="530" stroke="#244D78" strokeWidth="1" />
      <rect y="420" width="1000" height="280" fill={`url(#fog${id})`} />
    </svg>
  );
}

/** Сюжетные иллюстрации для трёх вариантов: различаются сюжетом, не палитрой. */
export function OptionArt({ id, className = '' }: { id: 'freedom' | 'navigator' | 'relay'; className?: string }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B2547" />
          <stop offset="1" stopColor="#050D1D" />
        </linearGradient>
        <radialGradient id={`glow${uid}`} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0" stopColor="#176BFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#176BFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`fig${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#153B6B" />
          <stop offset="1" stopColor="#06132A" />
        </linearGradient>
        <filter id={`b${uid}`}>
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <rect width="400" height="240" fill={`url(#bg${uid})`} />
      <rect width="400" height="240" fill={`url(#glow${uid})`} />
      {/* Каркас цеха на фоне */}
      <g stroke="#1B4272" strokeWidth="2" opacity="0.8">
        {[30, 90, 150, 250, 310, 370].map((x) => (
          <line key={x} x1={x} y1="20" x2={x} y2="240" />
        ))}
        <line x1="0" y1="44" x2="400" y2="44" />
        <path d="M 0 44 L 60 14 L 120 44 L 180 14 L 240 44 L 300 14 L 360 44 L 400 24" fill="none" />
      </g>
      <g fill="#5C9BFF" opacity="0.6">
        {[45, 105, 165, 265, 325].map((x) => (
          <rect key={x} x={x} y="60" width="30" height="3" />
        ))}
      </g>

      {id === 'freedom' && <Engineer uid={uid} />}
      {id === 'navigator' && <RobotArm uid={uid} />}
      {id === 'relay' && <Team uid={uid} />}
    </svg>
  );
}

/** 01 — инженер в каске с планшетом: самостоятельная работа с цифровыми инструментами. */
function Engineer({ uid }: { uid: string }) {
  return (
    <g>
      <rect x="230" y="120" width="60" height="40" rx="4" fill="#00DFFF" opacity="0.18" filter={`url(#b${uid})`} />
      {/* Тело */}
      <path d="M 120 240 C 122 190, 140 168, 176 160 L 226 160 C 262 168, 280 190, 284 240 Z" fill={`url(#fig${uid})`} />
      <path d="M 120 240 C 122 190, 140 168, 176 160" fill="none" stroke="#00DFFF" strokeWidth="2" opacity="0.9" />
      {/* Голова и каска */}
      <ellipse cx="200" cy="128" rx="24" ry="28" fill="#0E2A4F" />
      <path d="M 170 120 C 170 90, 230 90, 230 120 L 236 124 L 164 124 Z" fill="#C6D7EB" />
      <path d="M 170 120 C 170 90, 230 90, 230 120" fill="none" stroke="#F5FAFF" strokeWidth="1.5" />
      <rect x="196" y="98" width="8" height="20" rx="3" fill="#91B7D9" />
      {/* Планшет */}
      <g transform="rotate(-12 262 176)">
        <rect x="236" y="160" width="54" height="36" rx="4" fill="#071B36" stroke="#00DFFF" strokeWidth="2" />
        <rect x="242" y="166" width="20" height="3" fill="#7AEFFF" />
        <rect x="242" y="173" width="36" height="3" fill="#5C9BFF" />
        <rect x="242" y="180" width="28" height="3" fill="#5C9BFF" />
      </g>
      <path d="M 226 180 C 240 186, 248 186, 256 182" stroke="#153B6B" strokeWidth="12" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** 02 — роботизированная рука и световое кольцо: эксперт показывает новые инструменты. */
function RobotArm({ uid }: { uid: string }) {
  return (
    <g>
      <circle cx="270" cy="92" r="34" fill="none" stroke="#00DFFF" strokeWidth="2" opacity="0.9" />
      <circle cx="270" cy="92" r="34" fill="none" stroke="#00DFFF" strokeWidth="8" opacity="0.25" filter={`url(#b${uid})`} />
      <circle cx="270" cy="92" r="46" fill="none" stroke="#5C9BFF" strokeWidth="1" strokeDasharray="4 6" opacity="0.7" />
      {/* Основание */}
      <rect x="70" y="200" width="90" height="40" rx="6" fill={`url(#fig${uid})`} stroke="#244D78" />
      <rect x="92" y="186" width="46" height="18" rx="4" fill="#153B6B" />
      {/* Сегменты */}
      <g strokeLinecap="round">
        <line x1="115" y1="190" x2="160" y2="110" stroke="#C6D7EB" strokeWidth="22" />
        <line x1="115" y1="190" x2="160" y2="110" stroke="#54789E" strokeWidth="8" />
        <line x1="160" y1="110" x2="236" y2="96" stroke="#C6D7EB" strokeWidth="16" />
        <line x1="160" y1="110" x2="236" y2="96" stroke="#54789E" strokeWidth="5" />
      </g>
      <circle cx="115" cy="190" r="14" fill="#0B2547" stroke="#00DFFF" strokeWidth="2" />
      <circle cx="160" cy="110" r="12" fill="#0B2547" stroke="#00DFFF" strokeWidth="2" />
      <circle cx="236" cy="96" r="8" fill="#0B2547" stroke="#00DFFF" strokeWidth="2" />
      {/* Захват */}
      <path d="M 242 88 L 256 80 M 242 104 L 256 112" stroke="#E7F4FF" strokeWidth="4" strokeLinecap="round" />
      <circle cx="270" cy="92" r="6" fill="#7AEFFF" />
    </g>
  );
}

/** 03 — команда специалистов передаёт светящуюся эстафету. */
function Team({ uid }: { uid: string }) {
  const people = [
    { x: 80, s: 0.86 },
    { x: 150, s: 1 },
    { x: 250, s: 0.95 },
    { x: 320, s: 0.84 },
  ];
  return (
    <g>
      <ellipse cx="200" cy="168" rx="30" ry="10" fill="#00DFFF" opacity="0.35" filter={`url(#b${uid})`} />
      {people.map((p, i) => (
        <g key={i} transform={`translate(${p.x} 240) scale(${p.s}) translate(0 -240)`}>
          <path d="M -46 240 C -44 196, -30 178, 0 172 C 30 178, 44 196, 46 240 Z" fill={`url(#fig${uid})`} />
          <path
            d={i < 2 ? 'M -46 240 C -44 196, -30 178, 0 172' : 'M 0 172 C 30 178, 44 196, 46 240'}
            fill="none"
            stroke="#00DFFF"
            strokeWidth="1.6"
            opacity="0.8"
          />
          <ellipse cx="0" cy="146" rx="17" ry="20" fill="#0E2A4F" />
          <path d="M -22 142 C -22 116, 22 116, 22 142 L 26 145 L -26 145 Z" fill={i === 1 || i === 2 ? '#C6D7EB' : '#54789E'} />
        </g>
      ))}
      {/* Эстафета */}
      <line x1="180" y1="170" x2="222" y2="166" stroke="#7AEFFF" strokeWidth="5" strokeLinecap="round" />
      <line x1="180" y1="170" x2="222" y2="166" stroke="#00DFFF" strokeWidth="12" strokeLinecap="round" opacity="0.35" filter={`url(#b${uid})`} />
    </g>
  );
}
