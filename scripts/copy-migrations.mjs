import { cpSync, rmSync } from 'node:fs';
rmSync('dist/server/migrations', { recursive: true, force: true });
cpSync('server/src/migrations', 'dist/server/migrations', { recursive: true });
console.log('migrations copied to dist/server/migrations');
