import { useCallback, useEffect, useRef, useState } from 'react';

export type Connection = 'connecting' | 'live' | 'polling' | 'offline';

/**
 * Живое состояние с сервера: SSE, при сбое — polling каждые 3 с.
 * Переподключение автоматическое; статус соединения отображается явно.
 */
export function useLive<T>(streamUrl: string | null, stateUrl: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [notFound, setNotFound] = useState(false);
  const pollTimer = useRef<number | null>(null);
  const sseOk = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!stateUrl) return;
    try {
      const res = await fetch(stateUrl, { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as T);
      if (!sseOk.current) setConnection('polling');
    } catch {
      if (!sseOk.current) setConnection('offline');
    }
  }, [stateUrl]);

  useEffect(() => {
    if (!streamUrl || !stateUrl) return;
    let es: EventSource | null = null;
    let closed = false;

    const startPolling = () => {
      if (pollTimer.current !== null) return;
      void fetchOnce();
      pollTimer.current = window.setInterval(() => void fetchOnce(), 3000);
    };
    const stopPolling = () => {
      if (pollTimer.current !== null) window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    };

    const connect = () => {
      if (closed) return;
      if (typeof EventSource === 'undefined') {
        startPolling();
        return;
      }
      es = new EventSource(streamUrl, { withCredentials: true });
      es.addEventListener('state', (ev) => {
        sseOk.current = true;
        setConnection('live');
        stopPolling();
        try {
          setData(JSON.parse((ev as MessageEvent).data) as T);
        } catch {
          // некорректное сообщение пропускаем
        }
      });
      es.onerror = () => {
        sseOk.current = false;
        setConnection((c) => (c === 'live' ? 'polling' : c));
        startPolling();
        // Браузер сам переподключает EventSource; если он сдался — пересоздаём.
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          window.setTimeout(connect, 3000);
        }
      };
    };

    connect();
    void fetchOnce();

    const onOnline = () => {
      void fetchOnce();
      if (!es || es.readyState === EventSource.CLOSED) connect();
    };
    const onOffline = () => {
      sseOk.current = false;
      setConnection('offline');
    };
    const onVisible = () => document.visibilityState === 'visible' && void fetchOnce();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      closed = true;
      es?.close();
      stopPolling();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [streamUrl, stateUrl, fetchOnce]);

  return { data, setData, connection, notFound, refresh: fetchOnce };
}

export function usePublicBaseUrl(): string {
  const [base, setBase] = useState(() => window.location.origin);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c: { publicBaseUrl?: string }) => c.publicBaseUrl && setBase(c.publicBaseUrl))
      .catch(() => undefined);
  }, []);
  return base;
}
