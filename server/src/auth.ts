import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE = 'veche_admin';
const TTL_MS = 12 * 60 * 60 * 1000;

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export class AdminAuth {
  constructor(private password: string, private secret: string, private secureCookies: boolean) {}

  checkPassword(candidate: unknown): boolean {
    return typeof candidate === 'string' && safeEqual(candidate, this.password);
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update('admin:' + payload).digest('base64url');
  }

  issue(req: Request, res: Response) {
    const exp = String(Date.now() + TTL_MS);
    const token = `${exp}.${this.sign(exp)}`;
    // Secure-флаг ставим для HTTPS-запросов (за прокси — по X-Forwarded-Proto при TRUST_PROXY).
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: this.secureCookies && req.secure, maxAge: TTL_MS, path: '/' });
  }

  clear(res: Response) {
    res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', secure: this.secureCookies, path: '/' });
  }

  isAdmin(req: Request): boolean {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return false;
    const [exp, sig] = token.split('.');
    if (!exp || !sig || !safeEqual(sig, this.sign(exp))) return false;
    return Number(exp) > Date.now();
  }

  /** Требует действующую сессию организатора; для изменяющих запросов — ещё и заголовок против CSRF. */
  middleware = (req: Request, res: Response, next: NextFunction) => {
    if (!this.isAdmin(req)) return res.status(401).json({ error: 'unauthorized', message: 'Требуется вход организатора' });
    if (req.method !== 'GET' && req.get('x-veche-admin') !== '1') {
      return res.status(403).json({ error: 'csrf', message: 'Запрос отклонён' });
    }
    next();
  };
}
