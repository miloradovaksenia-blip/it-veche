import type { Response } from 'express';

/**
 * Рассылка изменений через Server-Sent Events. Клиенты переподключаются
 * автоматически; при недоступности SSE клиент переходит на polling.
 */
export class RealtimeHub {
  private publicClients = new Map<string, Set<Response>>();
  private adminClients = new Map<string, Set<Response>>();
  private pending = new Map<string, NodeJS.Timeout>();
  private heartbeat: NodeJS.Timeout;

  constructor(
    private getPublic: (sessionId: string) => Promise<unknown>,
    private getAdmin: (sessionId: string) => Promise<unknown>,
    private debounceMs = 120,
  ) {
    this.heartbeat = setInterval(() => this.ping(), 20_000);
    this.heartbeat.unref();
  }

  async subscribe(kind: 'public' | 'admin', sessionId: string, res: Response) {
    const initial = await (kind === 'public' ? this.getPublic(sessionId) : this.getAdmin(sessionId));
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 2000\n\n');
    const map = kind === 'public' ? this.publicClients : this.adminClients;
    let set = map.get(sessionId);
    if (!set) map.set(sessionId, (set = new Set()));
    set.add(res);
    this.send(res, initial);
    res.on('close', () => {
      set!.delete(res);
      if (set!.size === 0) map.delete(sessionId);
    });
  }

  /** Сообщить всем подписчикам сессии о новом состоянии (с небольшим объединением событий). */
  notify(sessionId: string) {
    if (this.pending.has(sessionId)) return;
    this.pending.set(
      sessionId,
      setTimeout(() => {
        this.pending.delete(sessionId);
        void this.flush(sessionId);
      }, this.debounceMs),
    );
  }

  private async flush(sessionId: string) {
    const pub = this.publicClients.get(sessionId);
    const adm = this.adminClients.get(sessionId);
    try {
      if (pub?.size) {
        const state = await this.getPublic(sessionId);
        for (const res of pub) this.send(res, state);
      }
      if (adm?.size) {
        const state = await this.getAdmin(sessionId);
        for (const res of adm) this.send(res, state);
      }
    } catch {
      // Сессия удалена (например, сброс демо) — закрываем потоки.
      for (const res of [...(pub ?? []), ...(adm ?? [])]) res.end();
    }
  }

  private send(res: Response, data: unknown) {
    res.write(`event: state\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private ping() {
    for (const map of [this.publicClients, this.adminClients]) for (const set of map.values()) for (const res of set) res.write(': ping\n\n');
  }

  clientCount(): number {
    let n = 0;
    for (const map of [this.publicClients, this.adminClients]) for (const set of map.values()) n += set.size;
    return n;
  }

  close() {
    clearInterval(this.heartbeat);
    for (const t of this.pending.values()) clearTimeout(t);
    for (const map of [this.publicClients, this.adminClients]) for (const set of map.values()) for (const res of set) res.end();
  }
}
