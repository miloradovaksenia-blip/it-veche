import { randomBytes } from 'node:crypto';

export interface Config {
  port: number;
  dbPath: string;
  adminPassword: string;
  secret: string;
  publicBaseUrl: string | null;
  trustProxy: string | number | boolean;
  isProduction: boolean;
  clientDist: string | null;
}

/** Читает конфигурацию из переменных окружения. Секреты есть только на сервере. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';
  let adminPassword = env.ADMIN_PASSWORD ?? '';
  let secret = env.APP_SECRET ?? '';

  if (isProduction) {
    if (adminPassword.length < 10) throw new Error('ADMIN_PASSWORD обязателен в production (не короче 10 символов)');
    if (secret.length < 32) throw new Error('APP_SECRET обязателен в production (не короче 32 символов)');
  } else {
    if (!adminPassword) {
      adminPassword = 'veche-dev-password';
      console.warn('[config] ADMIN_PASSWORD не задан — используется пароль разработки "veche-dev-password"');
    }
    if (!secret) secret = randomBytes(32).toString('hex');
  }

  const tp = env.TRUST_PROXY;
  const trustProxy = tp === undefined ? (isProduction ? 1 : 'loopback') : /^\d+$/.test(tp) ? Number(tp) : tp === 'true' ? true : tp === 'false' ? false : tp;

  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? './data/veche.db',
    adminPassword,
    secret,
    publicBaseUrl: env.PUBLIC_BASE_URL ? env.PUBLIC_BASE_URL.replace(/\/+$/, '') : null,
    trustProxy,
    isProduction,
    clientDist: env.CLIENT_DIST ?? null,
  };
}
