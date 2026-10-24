import { z } from 'zod';

/**
 * Environment is parsed once at boot. A missing or malformed variable fails fast with a clear
 * message instead of surfacing later as a confusing runtime error.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/estatery'),
  /**
   * Shared secret between the Next.js server and this API. When present on a request, the API
   * trusts the forwarded X-Tenant-Host header (the visitor's hostname). Browsers never see it.
   */
  INTERNAL_API_KEY: z.string().min(24, 'INTERNAL_API_KEY must be at least 24 characters'),
  /** Comma-separated origins allowed to call the API directly from a browser (admin, dev). */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /** Platform root domain; tenants get <slug>.<PLATFORM_DOMAIN> automatically. */
  PLATFORM_DOMAIN: z.string().default('localhost'),
  TENANT_CACHE_TTL_MS: z.coerce.number().int().min(0).default(60_000),

  /** HMAC secret for access tokens. Generate with: openssl rand -hex 32 */
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Secure cookies (HTTPS only). Defaults to true in production. */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  /** Sign-in/reset attempts per visitor per site per minute (on top of per-account lockout). */
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(10_000).default(10),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(240).default(15),

  /** SMTP connection string, e.g. smtps://user:pass@smtp.example.com:465. Unset = emails are logged (dev only). */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Estatery <no-reply@estatery.local>'),

  /** Where uploaded images are stored: "local" (disk, served by this API) or "s3" (any S3-compatible bucket). */
  MEDIA_DRIVER: z.enum(['local', 's3']).default('local'),
  MEDIA_LOCAL_DIR: z.string().default('./.uploads'),
  MEDIA_MAX_UPLOAD_MB: z.coerce.number().min(1).max(50).default(12),
  /** Redis for background jobs and shared rate limits. Unset = jobs run in-process (dev / single instance). */
  REDIS_URL: z.string().url().optional(),
  /** Port of the web app for links in emails when the site runs on a local host (development only). */
  DEV_WEB_PORT: z.coerce.number().int().default(3000),
  /** Run queue workers in this process. Set false on web-facing API nodes if you run `node dist/worker.js` separately. */
  RUN_WORKERS: z.enum(['true', 'false']).default('true'),
  /** Hostname agencies point a CNAME at (e.g. sites.estatery.app). Required for custom domains in production. */
  DOMAIN_CNAME_TARGET: z.string().default('sites.estatery.local'),
  /** IPv4 addresses for apex domains that can't use a CNAME (comma-separated). */
  DOMAIN_A_RECORDS: z.string().default(''),
  /** Public DNS resolvers used for verification (bypasses stale local caches). */
  DNS_RESOLVERS: z.string().default('1.1.1.1,8.8.8.8'),
  /** Domain add/verify calls per visitor per site per minute (verification runs live DNS lookups). */
  DOMAIN_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(10_000).default(10),
  DOMAIN_MAX_PER_TENANT: z.coerce.number().int().min(1).max(50).default(5),
  /** An unverified claim is released after this many hours, so nobody can squat on a domain. */
  DOMAIN_CLAIM_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  /** Re-check verified custom domains every N minutes (0 disables; run one API instance with it on). */
  DOMAIN_RECHECK_MINUTES: z.coerce.number().int().min(0).max(10_080).default(360),
  /** Consecutive failed re-checks before a domain stops routing. */
  DOMAIN_LOST_AFTER_FAILURES: z.coerce.number().int().min(1).max(30).default(3),
  /** Secret in the Caddy on-demand TLS "ask" URL. */
  TLS_ASK_TOKEN: z.string().min(24).optional(),
  /** Certificates: "caddy" (on-demand TLS via the ask endpoint) or "cloudflare" (Cloudflare for SaaS). */
  TLS_PROVIDER: z.enum(['caddy', 'cloudflare', 'vercel']).default('caddy'),
  /** TLS_PROVIDER=vercel: a token with access to the web app's Vercel project, its id, and the team id (if any). */
  VERCEL_API_TOKEN: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  /** Razorpay API keys (Dashboard → Account & Settings → API keys). rzp_test_… keys use Razorpay's test mode. */
  RAZORPAY_KEY_ID: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, 'RAZORPAY_KEY_ID looks like rzp_live_… or rzp_test_…').optional(),
  RAZORPAY_KEY_SECRET: z.string().min(8).optional(),
  /** Secret you set on the webhook in the Razorpay Dashboard; every webhook is signed with it. */
  RAZORPAY_WEBHOOK_SECRET: z.string().min(8).optional(),
  /**
   * Without Razorpay keys, outside production, billing runs a built-in payment simulator so the
   * whole flow (checkout, webhooks, failures) can be tried locally. Set false to turn billing off.
   */
  BILLING_SIMULATOR: z.enum(['true', 'false']).default('true'),
  /** Re-sync subscriptions from Razorpay every N minutes, in case a webhook was missed (0 disables). */
  BILLING_RECONCILE_MINUTES: z.coerce.number().int().min(0).max(10_080).default(360),
  /** Error reporting (optional). Without it, unexpected errors are written as JSON lines to stderr. */
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  /** Release identifier shown in error reports and /health (e.g. the git commit). */
  APP_VERSION: z.string().default('dev'),
  /** Where billing receipts say they come from. */
  PLATFORM_NAME: z.string().default('Estatery'),
  /** S3 / Cloudflare R2 / DigitalOcean Spaces / MinIO. Endpoint is only needed for non-AWS providers. */
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public base URL for stored files, usually a CDN in front of the bucket (https://media.example.com). */
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function checkTls(env: Env) {
  if (env.TLS_PROVIDER === 'vercel' && (!env.VERCEL_API_TOKEN || !env.VERCEL_PROJECT_ID)) {
    throw new Error('TLS_PROVIDER=vercel requires VERCEL_API_TOKEN and VERCEL_PROJECT_ID');
  }
  if (env.TLS_PROVIDER === 'cloudflare' && (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID)) {
    throw new Error('TLS_PROVIDER=cloudflare requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID');
  }
}

function checkS3(env: Env) {
  if (env.MEDIA_DRIVER !== 's3') return;
  const missing = (['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'] as const).filter((k) => !env[k]);
  if (missing.length) throw new Error(`MEDIA_DRIVER=s3 requires: ${missing.join(', ')}`);
}

function checkBilling(env: Env) {
  const set = [env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET].filter(Boolean).length;
  if (set > 0 && set < 3) throw new Error('Razorpay needs all three of RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET');
}

/** "live" = real Razorpay API (with test or live keys), "test" = local simulator, "off" = no payments. */
export function billingMode(env: Env = loadEnv()): 'live' | 'test' | 'off' {
  if (env.RAZORPAY_KEY_ID) return 'live';
  if (env.NODE_ENV !== 'production' && env.BILLING_SIMULATOR === 'true') return 'test';
  return 'off';
}

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  checkS3(parsed.data);
  checkTls(parsed.data);
  checkBilling(parsed.data);
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = undefined;
}
