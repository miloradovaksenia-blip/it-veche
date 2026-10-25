import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Backdrop, Logo, Spinner } from '../components/ui';

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
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6 text-center">
      <Backdrop />
      <Logo />
      <h1 className="mt-8 font-display text-3xl font-semibold">IT-вече ещё не открыто</h1>
      <p className="mt-3 text-white/65">Отсканируйте QR-код на экране зала, когда организатор начнёт сессию.</p>
    </div>
  );
}
