import { loadConfig } from './config';
import { openDb } from './db';
import { createApp } from './app';

const config = loadConfig();
const db = openDb(config.dbPath);
const { app, close } = createApp(db, config);

const server = app.listen(config.port, () => {
  console.log(`IT-ВЕЧЕ запущено: http://localhost:${config.port}`);
  console.log(`  Админ-панель: http://localhost:${config.port}/admin`);
  if (config.publicBaseUrl) console.log(`  Публичный адрес для QR: ${config.publicBaseUrl}`);
});

function shutdown() {
  close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
