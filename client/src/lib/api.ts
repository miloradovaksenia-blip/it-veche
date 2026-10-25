import type { AdminState, PublicState, VoteErrorCode } from '../../../shared/types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown, admin = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(admin ? { 'X-Veche-Admin': '1' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Нет связи с сервером');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // ответ без JSON
  }
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; error?: string; message?: string };
    throw new ApiError(res.status, d.code ?? d.error ?? 'http_' + res.status, d.message ?? 'Ошибка сервера');
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => call<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => call<T>('POST', url, body),
  admin: {
    get: <T>(url: string) => call<T>('GET', url, undefined, true),
    post: <T>(url: string, body: unknown = {}) => call<T>('POST', url, body, true),
    patch: <T>(url: string, body: unknown = {}) => call<T>('PATCH', url, body, true),
    del: <T>(url: string) => call<T>('DELETE', url, undefined, true),
  },
};

export type { AdminState, PublicState, VoteErrorCode };

// ---------- ключ устройства ----------

const KEY = 'veche:voter-key';
let memoryKey: string | null = null;

function newKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Криптографически стойкий случайный ключ устройства. Сервер хранит только его HMAC. */
export function voterKey(): string {
  try {
    let k = localStorage.getItem(KEY);
    if (!k || !/^[A-Za-z0-9_-]{32,128}$/.test(k)) {
      k = newKey();
      localStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    return (memoryKey ??= newKey());
  }
}

export const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // приватный режим — работаем без запоминания
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};
