import { cpSync } from 'node:fs';
cpSync('server/src/migrations', 'dist/server/migrations', { recursive: true });
console.log('migrations copied to dist/server/migrations');
