/**
 * Builds the API as a single Vercel Function using the Build Output API
 * (https://vercel.com/docs/build-output-api/v3), written to <repo>/.vercel/output.
 *
 * Why not let Vercel compile src/*.ts itself: NestJS 12 is ESM-only and relies on decorator
 * metadata, and Vercel's file tracing does not follow pnpm's symlinked workspace layout or Nest's
 * dynamic imports. Here the TypeScript build (tsc, with decorator metadata) is bundled by esbuild
 * into one ESM file, so JS dependencies live inside the function. The few packages that cannot be
 * bundled are installed next to it with npm, which picks the binaries for Vercel's Linux runtime.
 *
 * Run after `pnpm --filter @estatery/shared build && pnpm --filter @estatery/api build`.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, '..');
const repoRoot = resolve(apiDir, '../..');
const out = join(repoRoot, '.vercel/output');
const func = join(out, 'functions/index.func');
const region = process.env.API_REGION || 'bom1';

/**
 * Kept out of the bundle and installed next to it with npm:
 *  - sharp, @node-rs/argon2: native binaries, which must match Vercel's Linux runtime;
 *  - mongoose: CommonJS that mutates its own exports (connection ids), which breaks under
 *    esbuild's ESM interop. App code and @nestjs/mongoose both import this single copy.
 */
const INSTALLED = ['sharp', '@node-rs/argon2', 'mongoose'];
/** Optional packages that Nest, mongodb and bullmq load only when present. They are not installed. */
const OPTIONAL = [
  '@nestjs/microservices', '@nestjs/microservices/*', '@nestjs/websockets', '@nestjs/websockets/*',
  'class-validator', 'class-transformer', 'class-transformer/storage', '@fastify/static',
  'kerberos', '@mongodb-js/zstd', 'snappy', 'socks', 'aws4', 'mongodb-client-encryption', 'gcp-metadata',
  '@aws-sdk/credential-providers', 'msgpackr-extract',
];

if (!existsSync(join(apiDir, 'dist/bootstrap.js'))) {
  throw new Error('apps/api/dist is missing: run the shared and api TypeScript builds first.');
}

rmSync(out, { recursive: true, force: true });
mkdirSync(func, { recursive: true });

await build({
  entryPoints: [join(here, 'handler.mjs')],
  outfile: join(func, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Nest uses class names in tokens and logs; bundling must not rename classes.
  keepNames: true,
  sourcemap: 'linked',
  external: [...INSTALLED, ...OPTIONAL],
  // CommonJS dependencies inside an ESM bundle still call require/__dirname.
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      "import { fileURLToPath as __fu } from 'node:url';",
      "import { dirname as __dn } from 'node:path';",
      'const require = __cr(import.meta.url);',
      'const __filename = __fu(import.meta.url);',
      'const __dirname = __dn(__filename);',
    ].join('\n'),
  },
  logLevel: 'warning',
});

// Installed packages, at the exact versions the workspace lockfile resolved.
const req = createRequire(join(apiDir, 'package.json'));
const versionOf = (name) => {
  let dir = dirname(req.resolve(name));
  const nameAt = (d) => existsSync(join(d, 'package.json')) && JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).name;
  while (nameAt(dir) !== name) dir = dirname(dir);
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
};
const deps = Object.fromEntries(INSTALLED.map((n) => [n, versionOf(n)]));
writeFileSync(join(func, 'package.json'), JSON.stringify({ name: 'estatery-api-function', private: true, type: 'module', dependencies: deps }, null, 2));
execFileSync('npm', ['install', '--omit=dev', '--no-package-lock', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: func, stdio: 'inherit' });

writeFileSync(
  join(func, '.vc-config.json'),
  JSON.stringify({
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
    maxDuration: 60,
    regions: [region],
  }, null, 2),
);

writeFileSync(
  join(out, 'config.json'),
  JSON.stringify({
    version: 3,
    // Every path goes to the API function, which keeps the original URL for Nest's router.
    routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }],
    // Periodic jobs that a serverless function cannot run on timers (see CronController).
    // Daily keeps this valid on every Vercel plan; on Pro, tighten it (e.g. "*/10 * * * *").
    crons: [{ path: '/internal/cron', schedule: process.env.API_CRON_SCHEDULE || '0 3 * * *' }],
  }, null, 2),
);

console.log(`Vercel function written to ${func} (installed: ${Object.entries(deps).map(([n, v]) => `${n}@${v}`).join(', ')})`);
