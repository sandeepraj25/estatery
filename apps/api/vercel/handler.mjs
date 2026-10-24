/**
 * Vercel Function entrypoint. Bundled by build.mjs together with the compiled API (../dist).
 *
 * The Nest app is created once per function instance and reused by every request it serves.
 * It never calls app.listen(): Vercel owns the HTTP server and hands each request to Express.
 */
import 'reflect-metadata';
import { createApp } from '../dist/bootstrap.js';

let ready;

async function init() {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function handler(req, res) {
  // A failed start (bad env, database unreachable) is not cached: the next request tries again.
  ready ??= init().catch((err) => {
    ready = undefined;
    throw err;
  });
  let express;
  try {
    express = await ready;
  } catch (err) {
    // Logged in full (Vercel runtime logs); the client only gets a generic 503.
    console.error('API failed to start:', err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ ok: false, code: 'NOT_READY', message: 'API is starting or misconfigured' }));
    return;
  }
  await new Promise((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    express(req, res);
  });
}
