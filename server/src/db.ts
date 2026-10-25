import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPTIONS } from '../../shared/options';

export type DB = Database.Database;

function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'migrations'), join(here, '..', 'src', 'migrations')];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Не найдена папка migrations');
  return found;
}

/** Открывает БД и применяет SQL-миграции по порядку (каждая — один раз). */
export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  seedOptions(db);
  return db;
}

function migrate(db: DB) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name));
  const dir = migrationsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    })();
  }
}

function seedOptions(db: DB) {
  const upsert = db.prepare(
    `INSERT INTO options (id, position, title, description, accent) VALUES (@id, @position, @title, @description, @accent)
     ON CONFLICT (id) DO UPDATE SET position = excluded.position, title = excluded.title, description = excluded.description, accent = excluded.accent`,
  );
  db.transaction(() => {
    OPTIONS.forEach((o, i) => upsert.run({ id: o.id, position: i + 1, title: o.title, description: o.description, accent: o.accent }));
  })();
}
