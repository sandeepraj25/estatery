# Deploying Estatery

> Hosting the website on Vercel instead? See [vercel.md](vercel.md).

```
visitor ──HTTPS──▶ Caddy (TLS) ──▶ Next.js web :3000 ──internal──▶ NestJS API :4000 ──▶ MongoDB
                                                                         └──▶ S3/R2 (media) · SMTP
```

The API is never exposed to the internet. Only the web server talks to it, and it authenticates
with `INTERNAL_API_KEY`. Uploaded media is served from the bucket's CDN.

## 0. Run it with Docker

Everything needed for one server is in this repository:

| File | What it builds |
| --- | --- |
| `apps/api/Dockerfile` | The API, and the background worker (same image, `node dist/worker.js`) |
| `apps/web/Dockerfile` | The public websites and Admin Panel (Next.js standalone server) |
| `deploy/Dockerfile.caddy` | Caddy with the Cloudflare DNS module (wildcard certificate) |
| `deploy/docker-compose.prod.yml` | MongoDB (replica set), Redis, API, worker, web and Caddy |

```bash
cp apps/api/.env.example deploy/api.env     # fill in secrets (section 4)
cp apps/web/.env.example deploy/web.env     # API_INTERNAL_KEY = the API's INTERNAL_API_KEY
export TLS_ASK_TOKEN=... CLOUDFLARE_DNS_API_TOKEN=...
docker compose -f deploy/docker-compose.prod.yml up -d --build
docker compose -f deploy/docker-compose.prod.yml ps        # api and web should become healthy
```

The images run as a non-root user, contain only production dependencies, and have health checks
(`/health/ready` on the API). In this Compose file the API runs with `RUN_WORKERS=false` and the
`worker` service processes emails, lead notifications, reminders, billing notices and domain
re-checks. Scale `api` and `web` freely; keep one `worker` (or more: jobs are leased, never doubled).

**Creating agencies.** Agencies are created by a platform operator in *Admin Panel → All agencies →
New agency* (site on `<name>.<PLATFORM_DOMAIN>`, starter content, 14-day trial, owner invitation).
On a fresh database, create the first operator once:

```bash
docker compose -f deploy/docker-compose.prod.yml run --rm api \
  node dist/scripts/create-operator.js --name "Your Company" --slug hq --email you@company.com --owner "Your Name"
```

It creates your own agency on `hq.<PLATFORM_DOMAIN>` and an operator account, and prints a one-time
password (change it under *Your account*). It refuses to run once an operator exists. To explore
with demo data instead, run `node dist/scripts/seed.js` on a **staging** database (it erases it).

## 1. Platform DNS (once)

For a platform domain such as `estatery.app`:

| Record | Name | Value | Why |
| --- | --- | --- | --- |
| A / AAAA | `estatery.app`, `*.estatery.app` | your server / load balancer | platform subdomains like `aurelia.estatery.app` |
| A / AAAA | `sites.estatery.app` | same | the CNAME target agencies point their domains at |

Set `PLATFORM_DOMAIN=estatery.app`, `DOMAIN_CNAME_TARGET=sites.estatery.app`, and
`DOMAIN_A_RECORDS=<server IPv4s>` so root domains (no CNAME allowed) can use A records.

## 2. Certificates: pick one

**Caddy on-demand TLS (default, `TLS_PROVIDER=caddy`).** Use `deploy/Caddyfile` and set
`TLS_ASK_TOKEN` to the same random value in the API and in Caddy's environment. Caddy only
requests a certificate after `GET /internal/tls/ask` returns 200, which happens only for verified
domains of active agencies. Certificates renew automatically. Keep `/internal/*` unreachable from
the internet: the Caddyfile only proxies to the web server, and the API isn't published.

**Cloudflare for SaaS (`TLS_PROVIDER=cloudflare`).** Set `CLOUDFLARE_API_TOKEN` (Custom Hostnames:
Edit) and `CLOUDFLARE_ZONE_ID` for the platform zone, and configure `sites.estatery.app` as the
zone's fallback origin. When an agency's domain is verified, the API registers it as a custom
hostname; when the domain is removed, the API deletes it again. Cloudflare issues and renews the
certificates. This integration follows Cloudflare's documented API but hasn't been exercised
against a live account in this build. Test it on a staging zone first.

## 3. How an agency connects a domain

1. **Admin Panel → Domains → Add domain.** The domain must be unique on the platform.
   Platform hostnames are refused. An unverified claim lapses after `DOMAIN_CLAIM_HOURS` (72), so
   nobody can hold a domain they don't control.
2. **They add two DNS records:**
   - `TXT _estatery-verify.<domain>` with a random per-domain token, which proves ownership;
   - a `CNAME` to `DOMAIN_CNAME_TARGET`, or `A` records for a root domain, which route traffic.
3. **"Check now"** queries public resolvers (`DNS_RESOLVERS`). The domain serves the site only
   when **both** records are correct. After that, the certificate is issued (step 2) and the
   HTTPS status turns active.
4. **"Make main address"** (needs active HTTPS): every other address of that agency
   permanently redirects (308) there, and canonical/Open Graph URLs use it.

**Re-checks.** Every `DOMAIN_RECHECK_MINUTES` (default 6 hours), verified domains are re-checked.
After `DOMAIN_LOST_AFTER_FAILURES` (3) consecutive failures:
- the domain stops routing;
- the platform address becomes the main address again;
- owners and admins get an email, and the event appears in the activity log.

Run the re-check job on one API instance. A per-domain database lease prevents duplicate work if
several instances run it anyway.

## 4. Production checklist

- MongoDB 7 as a replica set (Atlas or self-hosted), with daily backups and point-in-time recovery.
- Secrets: `INTERNAL_API_KEY`, `JWT_ACCESS_SECRET`, `TLS_ASK_TOKEN`, each from
  `openssl rand -hex 32`, kept in a secrets manager.
- `NODE_ENV=production` (secure `__Host-` cookies), `MEDIA_DRIVER=s3` with a CDN in front,
  `SMTP_URL` set.
- `AUTH_RATE_LIMIT_PER_MIN`, `DOMAIN_RATE_LIMIT_PER_MIN` at their defaults. Set `REDIS_URL` so rate
  limits and background jobs are shared across API instances.
- Razorpay: set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` (live keys).
  In the Razorpay Dashboard → Webhooks, add `https://<platform domain>/api/webhooks/razorpay` with the
  same secret and the events `subscription.authenticated`, `.activated`, `.charged`, `.pending`,
  `.halted`, `.cancelled`, `.completed`, `.updated`, `.paused`, `.resumed` and `payment.failed`.
  The simulator can never run in production (the API refuses to start it).
- Keep `/internal/*` on the API private: webhooks reach it only through the web server.

## 5. Backups and recovery

- **MongoDB** holds all agency data. Use Atlas continuous backups, or `mongodump --gzip` nightly
  to off-site storage with at least 30 days' retention. Test a restore every quarter.
- **Media**: with `MEDIA_DRIVER=s3`, turn on bucket versioning. With local storage, back up the
  `uploads` volume with the database.
- **Redis** holds only queued jobs and rate-limit counters. Losing it delays some emails; it never loses data.
- **Caddy's** `caddy-data` volume holds certificates. If lost, they are re-issued automatically
  (mind Let's Encrypt rate limits for many domains at once).

## 6. Monitoring

- Point an uptime monitor at `https://<platform domain>/robots.txt` (web) and alert on non-200.
- Set `SENTRY_DSN` (and `APP_VERSION` per release) on the API, worker and web app. Without Sentry,
  ship container logs to your log tool and alert on lines with `"level":"error"`.
- Watch the BullMQ queue length (`redis-cli llen bull:estatery:wait`): a growing queue means the worker is down.

## 7. Go-live checklist

- [ ] Secrets generated and stored; `NODE_ENV=production`
- [ ] MongoDB replica set with backups; Redis with persistence
- [ ] `SMTP_URL` and `MAIL_FROM` (with SPF/DKIM for the sending domain); send a password reset to test
- [ ] Platform DNS (section 1) and certificates (section 2) working for the platform domain
- [ ] Razorpay live keys and webhook; one real low-value subscription created and cancelled
- [ ] `SENTRY_DSN` set and a test error visible
- [ ] Each agency: business details, logo, theme, pages reviewed (legal pages by their adviser),
      listings published, team invited, domain connected and set as main address
- [ ] Submit each agency's `/sitemap.xml` in Google Search Console
