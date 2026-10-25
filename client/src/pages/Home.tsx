import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Backdrop, HeroPhoto, MetalTitle, Spinner } from '../components/ui';

/** Корневая ссылка ведёт на текущую реальную сессию. */
export default function Home() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    fetch('/api/current')
      .then((r) => r.json())
      .then((d: { slug: string | null }) => setSlug(d.slug))
      .catch(() => setSlug(null));
  }, []);
  if (slug === undefined) return <Spinner />;
  if (slug) return <Navigate to={`/s/${slug}`} replace />;
  return (
    <div className="relative flex min-h-[100dvh] flex-col justify-center overflow-hidden p-6">
      <Backdrop />
      <HeroPhoto className="right-0 top-0 h-[75vh] w-[min(900px,85vw)]" words={false} />
      <div className="relative mx-auto w-full max-w-xl">
        <MetalTitle bar className="text-[clamp(64px,16vw,120px)]" />
        <p className="mt-6 font-display text-[22px] font-black uppercase leading-tight">Твой голос. Наше будущее.</p>
        <h2 className="mt-6 text-xl font-bold text-ice">ИТ-вече ещё не открыто</h2>
        <p className="mt-2 text-muted">Отсканируйте QR-код на экране зала, когда организатор начнёт сессию.</p>
      </div>
    </div>
  );
}
