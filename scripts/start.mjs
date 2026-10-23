import { existsSync } from 'node:fs';
// Production never imports .env development/test settings.
if(existsSync('.env.production'))process.loadEnvFile('.env.production');
process.env.NODE_ENV='production';
await import('../server/index.js');
