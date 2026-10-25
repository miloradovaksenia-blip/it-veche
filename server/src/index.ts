import { loadConfig } from './config';
import { openDb } from './db';
import { createApp } from './app';

const config = loadConfig();
const db = await openDb({ databaseUrl: config.databaseUrl, dbPath: config.dbPath });
const { app, close } = createApp(db, config);

const server = app.listen(config.port, () => {
  console.log(`IT-ВЕЧЕ запущено: http://localhost:${config.port}`);
  console.log(`  База данных: ${db.dialect === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'SQLite ' + config.dbPath}`);
  console.log(`  Админ-панель: http://localhost:${config.port}/admin`);
  if (config.publicBaseUrl) console.log(`  Публичный адрес для QR: ${config.publicBaseUrl}`);
});

function shutdown() {
  close();
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
