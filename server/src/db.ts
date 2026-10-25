import Database from 'better-sqlite3';
import pg from 'pg';
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPTIONS } from '../../shared/options';

/**
 * Единый асинхронный интерфейс к БД: SQLite (локально, один файл) или
 * PostgreSQL (DATABASE_URL, например бесплатная база Neon).
 * Запросы пишутся с плейсхолдерами `?`; `{{FOR_SHARE}}` — блокировка строки в Postgres.
 */
export interface Db {
  dialect: 'sqlite' | 'postgres';
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  /** Транзакция. Внутри используйте только переданный `tx`. */
  tx<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type DB = Db;

function migrationsDir(dialect: 'sqlite' | 'postgres'): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'migrations', dialect), join(here, '..', 'src', 'migrations', dialect)];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Не найдена папка migrations/' + dialect);
  return found;
}

// ---------- SQLite ----------

/** Простая очередь: операции SQLite выполняются строго по одной (и транзакции не перемешиваются). */
class Mutex {
  private last: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.last.then(fn, fn);
    this.last = next.catch(() => undefined);
    return next;
  }
}

function sqliteSql(sql: string) {
  return sql.replace(/\{\{FOR_SHARE\}\}/g, '');
}

function sqliteHandle(raw: Database.Database, lock: Mutex | null): Db {
  const guard = <T>(fn: () => T): Promise<T> => (lock ? lock.run(async () => fn()) : Promise.resolve().then(fn));
  const handle: Db = {
    dialect: 'sqlite',
    all: (sql, params = []) => guard(() => raw.prepare(sqliteSql(sql)).all(...params) as never),
    get: (sql, params = []) => guard(() => raw.prepare(sqliteSql(sql)).get(...params) as never),
    run: (sql, params = []) => guard(() => ({ changes: raw.prepare(sqliteSql(sql)).run(...params).changes })),
    exec: (sql) => guard(() => void raw.exec(sql)),
    tx: (fn) => {
      const body = async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(sqliteHandle(raw, null));
          raw.exec('COMMIT');
          return result;
        } catch (e) {
          raw.exec('ROLLBACK');
          throw e;
        }
      };
      return lock ? lock.run(body) : body();
    },
    close: async () => void raw.close(),
  };
  return handle;
}

function openSqlite(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  return sqliteHandle(raw, new Mutex());
}

// ---------- PostgreSQL ----------

function pgSql(sql: string) {
  let i = 0;
  return sql.replace(/\{\{FOR_SHARE\}\}/g, ' FOR SHARE').replace(/\?/g, () => `$${++i}`);
}

type Queryable = pg.Pool | pg.PoolClient;

function pgHandle(q: Queryable, pool: pg.Pool): Db {
  const query = (sql: string, params: unknown[] = []) => q.query(pgSql(sql), params);
  return {
    dialect: 'postgres',
    all: async (sql, params) => (await query(sql, params)).rows,
    get: async (sql, params) => (await query(sql, params)).rows[0],
    run: async (sql, params) => ({ changes: (await query(sql, params)).rowCount ?? 0 }),
    exec: async (sql) => void (await q.query(sql)),
    tx: async (fn) => {
      if (q !== pool) return fn(pgHandle(q, pool)); // уже внутри транзакции
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(pgHandle(client, pool));
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    close: async () => pool.end(),
  };
}

function openPostgres(url: string): Db {
  // TLS задаётся в строке подключения: у Neon она уже содержит sslmode=require.
  const pool = new pg.Pool({ connectionString: url, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  pool.on('error', (e) => console.error('[db] ошибка соединения с Postgres:', e.message));
  return pgHandle(pool, pool);
}

// ---------- общее ----------

/** Соединение без миграций (служебные задачи и тесты). */
export async function openDbRaw(databaseUrl: string | null, dbPath = ':memory:'): Promise<Db> {
  return databaseUrl ? openPostgres(databaseUrl) : openSqlite(dbPath);
}

/** Открывает БД (Postgres, если задан DATABASE_URL, иначе SQLite) и применяет миграции. */
export async function openDb(opts: { databaseUrl?: string | null; dbPath?: string }): Promise<Db> {
  const db = opts.databaseUrl ? openPostgres(opts.databaseUrl) : openSqlite(opts.dbPath ?? ':memory:');
  await migrate(db);
  await seedOptions(db);
  return db;
}

async function migrate(db: Db) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set((await db.all<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const dir = migrationsDir(db.dialect);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    await db.tx(async (tx) => {
      await tx.exec(sql);
      await tx.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?) ON CONFLICT (name) DO NOTHING', [file, new Date().toISOString()]);
    });
  }
}

async function seedOptions(db: Db) {
  await db.tx(async (tx) => {
    for (const [i, o] of OPTIONS.entries()) {
      await tx.run(
        `INSERT INTO options (id, position, title, description, accent) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET position = excluded.position, title = excluded.title, description = excluded.description, accent = excluded.accent`,
        [o.id, i + 1, o.title, o.description, o.accent],
      );
    }
  });
}
