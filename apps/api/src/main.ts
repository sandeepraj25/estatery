import 'reflect-metadata';
import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

const app = await createApp();
await app.listen(loadEnv().PORT);
console.log(`API listening on http://localhost:${loadEnv().PORT}`);
