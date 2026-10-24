# Estatery — white-label real estate platform

One codebase that serves many real estate agencies, each on its own domain with its own brand,
listings, content, leads and subscription. Two interfaces — the **public website** and one
**Admin Panel** (with platform-operator sections inside it) — backed by a tenant-aware API.

**What an agency gets:** a premium website (3D hero, property search, listing pages, insights blog,
About/Contact/FAQ/legal pages) on its own domain with automatic HTTPS; an Admin Panel to manage
listings, media, website content and theme, articles, redirects, team and roles; a CRM pipeline with
follow-ups and notifications; and a Razorpay subscription with plan limits. **What the platform
operator gets:** every agency in one view, with suspension, trial extensions and free plans.

```
apps/
  web/        Next.js 16 (App Router) public site — React 19, Tailwind 4, Motion, React Three Fiber
  api/        NestJS 12 REST API — MongoDB/Mongoose, tenant resolution, validation, rate limits
packages/
  shared/     Zod schemas + TypeScript types used by both (query params, theme, homepage blocks, leads)
```

## Quick start

Requirements: Node 22+, pnpm 10, Docker (for MongoDB).

```bash
pnpm install
docker compose up -d                       # MongoDB 7 + Redis 7

cp apps/api/.env.example apps/api/.env      # set INTERNAL_API_KEY (openssl rand -hex 32)
cp apps/web/.env.example apps/web/.env.local  # set API_INTERNAL_KEY to the same value

pnpm --filter @estatery/shared build
pnpm seed                                   # two demo agencies with realistic data
pnpm dev                                    # API on :4000, web on :3000
```

Open:
- http://localhost:3000/admin — **Admin Panel** (sign in with a demo account below)
- http://localhost:3000 — **Aurelia Estates** (luxury, forest & champagne theme)
- http://banyan.localhost:3000 — **Banyan & Co.** (NCR, midnight & terracotta theme, fewer sections)

Same code, different tenant, chosen purely by hostname. `*.localhost` resolves to 127.0.0.1 in
modern browsers; otherwise add `127.0.0.1 banyan.localhost` to your hosts file.

### Demo accounts (password `Estatery-demo-2026`, override with `SEED_PASSWORD`)

| Email | Site | Role | What you'll see |
| --- | --- | --- | --- |
| `platform@estatery.example` | Aurelia | Owner + platform operator | Everything, plus **All agencies** |
| `owner@aurelia.example` | Aurelia | Owner | Everything for Aurelia |
| `admin@aurelia.example` | Aurelia | Administrator | Can't assign or change owners |
| `manager@aurelia.example` | Aurelia | Sales manager | All leads, read-only team |
| `editor@aurelia.example` | Aurelia | Content editor | No leads, no team |
| `support@aurelia.example` | Aurelia | Support | Read-only |
| `kabir@aurelia.example` | Aurelia | Agent | Only leads assigned to Kabir |
| `owner@banyan.example` | Banyan (`banyan.localhost:3000/admin`) | Owner | Banyan only |

## Run it in VS Code

1. Install **Node.js 22 LTS**, **pnpm** (`npm i -g pnpm@10`), **Git** and **Docker Desktop**, then
   open the project folder in VS Code and accept the recommended extensions.
2. In a VS Code terminal:
   ```bash
   pnpm install
   docker compose up -d                          # MongoDB + Redis
   cp apps/api/.env.example apps/api/.env          # Windows: copy apps\api\.env.example apps\api\.env
   cp apps/web/.env.example apps/web/.env.local    # Windows: copy apps\web\.env.example apps\web\.env.local
   ```
   In `apps/api/.env` set `INTERNAL_API_KEY` and `JWT_ACCESS_SECRET` to long random values
   (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), set
   `REDIS_URL=redis://127.0.0.1:6379`, and put the same `INTERNAL_API_KEY` value in
   `apps/web/.env.local` as `API_INTERNAL_KEY`.
3. **Terminal → Run Task… → Seed demo data**, then **Terminal → Run Build Task** (Ctrl/Cmd+Shift+B)
   starts the API (:4000) and website (:3000) with live reload.
4. Open http://localhost:3000 and http://localhost:3000/admin (demo accounts above).

**Debugging:** the Run and Debug panel has *Debug API*, *Debug website (Next.js server)*, the
compound *Debug API + website*, and *Debug website (browser)*. Breakpoints work in the TypeScript
source. **Tests:** the Testing panel (Vitest extension) or `pnpm test`.

**No Docker?** Use a free MongoDB Atlas cluster: put its connection string in `MONGODB_URI` and
leave `REDIS_URL` out (jobs then run inside the API). Don't run `pnpm seed` against a database you
care about — it erases it.

**Deploying:** [Vercel + Render + MongoDB Atlas](docs/vercel.md) (step by step), or your own server
with Docker ([docs/deployment.md](docs/deployment.md)).

## Public website

- Homepage with 13 sections, driven by each agency's published content and theme
- Property search with URL-based filters (buy/rent, city, type, budget, BHK, keyword, sort,
  pagination), validated by the shared schema and filtered server-side
- Listing pages: gallery with full-screen keyboard viewer, specs, amenities, map, advisor card,
  call/WhatsApp, enquiry and site-visit booking, similar homes, recently viewed, share, structured data
- About, Contact, FAQ, Privacy and Terms pages; Insights index and article pages
- Enquiries everywhere feed the CRM: validated on client and server, honeypot, consent,
  same-origin check, per-visitor rate limit, listing ownership check, automatic assignment
- Saved homes (in the browser), loading skeletons, empty states, error and 404 pages,
  keyboard and screen-reader support, reduced-motion support

## Admin Panel

| Section | Who | What |
| --- | --- | --- |
| Dashboard | everyone | Inventory, enquiries, win rate, site visits, your follow-ups, recent activity |
| Properties | editors, managers, owners | Listings with drafts, publishing checks, CSV import/export, preview |
| Leads | sales roles | Pipeline board, list, lead detail, follow-ups, notifications, export |
| Website | editors (content), owners/admins (theme, business details) | Homepage, Pages, Theme, Business details, Version history, live preview |
| Articles | editors and up | The Insights blog |
| Content library, Media | editors and up | Advisors, testimonials, destinations, projects; image library |
| Redirects | editors and up | Old addresses → new pages |
| Domains | owners, admins | Custom domains with DNS checks and HTTPS status |
| Team & roles | owners, admins | Invitations, roles, advisor links, access |
| Plan & billing | owners | Plan, usage, Razorpay checkout, invoices |
| All agencies | platform operator | Create agencies (site, starter content, owner invitation, trial), plan status, trials, free plans, suspension |

## How multi-tenancy works

1. A visitor opens `client-a.com`. The Next.js server calls the API with
   `X-Tenant-Host: client-a.com` plus `X-Internal-Key` (a server-only shared secret).
2. `TenantResolverMiddleware` looks the hostname up in `domains` (verified domains only), loads the
   tenant, rejects unknown or suspended tenants, and attaches it to the request. Requests without a
   valid key are resolved from their own `Host` header, so a browser can't spoof another tenant.
3. Controllers receive the tenant via `@CurrentTenant()`; nothing reads a tenant id from the body.
4. **Database guard:** every tenant-owned schema uses `tenantScopePlugin`, which throws on any
   find/update/delete/aggregate/save that isn't filtered by `tenantId`. Deliberate cross-tenant
   platform queries must opt in with `.setOptions({ crossTenant: true })`.
5. `apps/api/test/tenant-isolation.test.ts` proves tenants can't list, open, attach leads to, or
   receive each other's data, that spoofed headers are ignored, and that unscoped queries throw.

Tenant responses are rendered dynamically and never stored in Next's shared fetch cache (a URL-keyed
cache could serve one agency's page on another's domain). Per-tenant tagged caching arrives with
the Admin Panel's publish flow.

## Authentication & roles

**Sessions.** Signing in sets three cookies on the agency's own domain (via the same-origin
`/api/admin/*` proxy in Next.js, so the API never takes cross-origin browser traffic):

| Cookie | Flags | Purpose |
| --- | --- | --- |
| `es_at` | HttpOnly, SameSite=Lax | 15-minute JWT (HS256) |
| `es_rt` | HttpOnly, SameSite=Strict | 30-day opaque refresh token, stored hashed |
| `es_csrf` | readable, SameSite=Strict | double-submit CSRF token sent back as `X-CSRF-Token` |

With HTTPS (production) the names get the `__Host-` prefix and the `Secure` flag.

- **Refresh rotation with reuse detection:** every refresh issues a new token and revokes the
  old one. Replaying an already-used token revokes the whole session family and is written to
  the activity log. A 30-second grace window avoids false alarms from parallel tabs.
- **Silent refresh:** `apps/web/src/proxy.ts` refreshes an expiring access token before admin
  pages render; the browser client retries once on 401.
- **Tokens are bound to the agency:** a token issued on `agency-a.com` is rejected on
  `agency-b.com`.
- **Live checks:** each admin request re-reads the session and membership, so sign-out,
  deactivation and role changes take effect immediately, not when the token expires.
- **Passwords:** argon2id (OWASP parameters), at least 10 characters with a letter and a
  number. Unknown emails take the same time and get the same error as wrong passwords.
- **Brute force:** per-account lockout (5 failures → 15 minutes) plus per-visitor, per-site rate
  limits on sign-in, reset and invite endpoints.
- **Password reset:** single-use 30-minute links, the same response whether or not the email
  exists, and every session for that person is revoked.
- **Invitations:** single-use 7-day links. The inviter also gets the link to share directly when
  email isn't configured. Someone who already has an account on another agency confirms with
  their existing password.

**Roles** (`packages/shared/src/auth.ts`): owner, administrator, sales manager, agent, content
editor and support, each with a fixed permission set. The API enforces them on every endpoint
(`@RequirePermission`); the UI uses the same map only to decide what to show. Other rules:
- Only owners can assign or change owners.
- Nobody can change their own role.
- Every site keeps at least one active owner.
- Agents see only leads linked to their advisor profile.

**Platform operator** is a separate flag on the identity, never grantable through tenant
endpoints. It unlocks the **All agencies** section (cross-agency stats and suspend/re-activate)
inside the same Admin Panel.

**Activity log:** sign-ins, failures, lockouts, token reuse, password changes, invitations, role
and access changes, and platform actions, each with the actor and IP address. It is append-only:
there are no endpoints to edit or delete entries.

**Email:** set `SMTP_URL` (any SMTP provider) to send invitations and reset links. Without it,
development prints the messages in the API log and production logs a warning.

## Content management

**Listings.** Create, edit, preview, publish, unpublish, mark sold/rented, feature, archive, and
delete never-published drafts.
- **Draft vs live:** drafts can be incomplete, but publishing requires a photo, a summary, a
  description, a price and a location. The editor shows this as a checklist, and the API enforces
  the same rules (`publishProblems` in `packages/shared`).
- **Status changes:** each move between statuses is checked against an explicit transition map.
- **Web addresses:** changing a URL keeps the old one working as a permanent redirect. URLs are
  unique per agency, including against old URLs.
- **References:** advisors, projects and images must belong to the same agency.

**CSV.**
- Export protects against spreadsheet formula injection.
- Import has two steps: check the file (nothing is saved), then import. It is all-or-nothing: one
  invalid row and nothing is written.
- Matching slugs update the existing listing; new rows arrive as drafts.

**Media.** Every upload is decoded and re-encoded by `sharp`:
- The file's real format is checked; its name and MIME type are ignored.
- EXIF and GPS metadata is stripped.
- Anything appended to the file is discarded.
- The image is auto-rotated, resized to at most 2560px and stored as WebP.

Storage drivers live in `apps/api/src/modules/media/storage.ts`:
- `local` (disk, served at `/media/*`, for development or a single server);
- `s3` (AWS S3, Cloudflare R2, Spaces or MinIO, behind a CDN). Uploads pass through the API for
  re-encoding and are written to the bucket with server-side credentials.

An agency can never attach another agency's uploaded file, and images still used by a listing
can't be deleted.

**Website editor (draft → preview → publish).**
- **What's editable:** the homepage (section order, visibility and content for all 12 section
  types, including the 3D hero options), the theme (presets, colours with live WCAG contrast
  checks, fonts, corner radius, motion level) and business details (logo, contact, menus, footer,
  social links, SEO, region).
- **Drafts are private:** visitors only ever see the published copy. The preview
  (`/?preview=draft`, also shown beside the editor at desktop, tablet and phone widths) loads the
  draft only for a signed-in editor's session.
- **Concurrent edits:** every save carries the draft revision it started from, so two people
  editing at once get a conflict message instead of silently overwriting each other.
- **Editing aids:** undo/redo (⌘Z / ⇧⌘Z), ⌘S to save, reset to the default layout, and a warning
  before leaving with unsaved changes.
- **Publishing:** each publish stores a full snapshot. Version history can load any earlier
  version back into the draft for review before republishing.
- **Permissions:** content editors can change the homepage but not the theme or business
  details. If the draft includes theme changes, they can't publish it.
- **Safety:** content is structured data validated by Zod. Links accept only site paths,
  `https:`, `tel:` and `mailto:`, so `javascript:` URLs are rejected.

**Content library.** Advisors, testimonials, destinations and projects, with drag-to-reorder.
Advisors and projects still used by listings or logins can't be deleted. These changes go live
immediately and don't go through publishing.

## Custom domains

Admin Panel → **Domains** connects an agency's own address (owners and administrators only).

**Verification**
- **Proof of ownership:** a TXT record with a random token; copying another agency's record
  doesn't work.
- **Routing:** a CNAME (or A records for root domains) pointing at the platform. Traffic only
  routes when both are correct, checked against public DNS resolvers.
- **Claims:** domains are unique across the platform, platform hostnames can't be claimed, and
  unverified claims lapse after 72 hours so nobody can squat on a domain. Another agency's
  existing claim is never revealed.

**HTTPS**
- Certificates come from Caddy on-demand TLS. Caddy asks `/internal/tls/ask` first, which approves
  only verified domains of active agencies.
- Cloudflare for SaaS is available as an alternative provider.

**Main address**
- Once a custom domain is verified and HTTPS is active, it can become the main address.
- Other addresses then 308-redirect to it (the Admin Panel itself isn't redirected), and canonical
  and Open Graph URLs switch to it.

**Re-checks:** verified domains are re-checked every 6 hours. After 3 failures in a row, a domain
stops routing, the platform address takes over, and the owners get an email.

See **docs/deployment.md** for platform DNS, certificates and the production checklist, and
**deploy/Caddyfile** for a ready configuration.

## CRM

Every website enquiry becomes a lead that moves through a pipeline:
**New → Contacted → Qualified → Site visit → Negotiation → Won / Lost**.

| Where | What you can do |
| --- | --- |
| `/admin/leads` | Pipeline board (drag cards between stages, or use each card's stage menu with the keyboard) and a filterable list (search, stage, request type, date range, advisor). Export the current filter to CSV. |
| `/admin/leads/<id>` | Call, WhatsApp (pre-filled message) or email the lead; change stage (a reason is required for *Lost*); reassign; log notes, calls, WhatsApp chats, emails and meetings; schedule follow-ups; permanently delete on request. |
| `/admin/leads/settings` | Who is emailed about new enquiries (assigned advisor, extra addresses) and round-robin assignment. |
| Dashboard | *Your follow-ups* — your open reminders, overdue ones highlighted. |

What happens automatically:
1. **New enquiry** → assigned to the listing's advisor, or the next active advisor when round-robin is on → a `lead.notify` job emails the advisor and the extra addresses.
2. **Reassignment** → the new advisor is emailed.
3. **Follow-ups** → a `reminders.scan` job runs every minute and emails each reminder once when it falls due (an atomic `notifiedAt` lease prevents double sends across workers).
4. **First contact** time is recorded the first time a lead leaves *New*, so you can see response times.

Permissions: owners/admins have everything; managers see all leads, assign and export; agents see and work only
their own leads; editors and support have no lead access. Erasure (`leads:delete`) is owner/admin only and its
audit entry keeps initials only. CSV cells are escaped against spreadsheet formula injection.

### Background jobs

With `REDIS_URL` set, jobs run on a BullMQ queue (`estatery`) with 6 attempts and exponential backoff;
email sending throws on failure so it is retried. Rate limits move to Redis so they hold across instances.
Without Redis, the same jobs run inline (3 quick retries) — fine for development and single-server installs.

```bash
# Production: API instances with RUN_WORKERS=false, plus one or more workers
node apps/api/dist/worker.js        # requires REDIS_URL
```

## Plans & billing

Agencies pay the platform a subscription through **Razorpay**. Prices include 18% GST.

| Plan | Monthly | Yearly | Live listings | Team | Custom domains | Lead export | Round-robin | Hide “Powered by” |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Essential | ₹2,499 | ₹24,990 | 25 | 3 | 1 | – | – | – |
| Professional | ₹5,999 | ₹59,990 | 150 | 10 | 3 | ✓ | ✓ | ✓ |
| Signature | ₹12,999 | ₹1,29,990 | Unlimited | 30 | 5 | ✓ | ✓ | ✓ |

Plans, prices and limits live in `packages/shared/src/billing.ts`. Change them there; new Razorpay plans
are created automatically for new prices (existing subscribers keep theirs).

**Lifecycle** (`computeAccess`, shared by API and UI, unit-tested):

1. New agencies get a **14-day Professional trial**. Subscribing during the trial sets up the card/UPI
   mandate now; the first charge and the chosen plan start when the trial ends.
2. **Active**: the plan's limits apply. Upgrades apply immediately; downgrades at the next billing date.
3. **Payment failed** (`pending`): full access while Razorpay retries; owners are emailed.
4. **On hold** (`halted`): 7 more days of full access, with warnings in the Admin Panel and by email.
5. **Cancelled**: access until the end of the paid period.
6. **No plan**: the website stays online and nothing is deleted, but publishing listings, inviting people,
   connecting domains, exporting leads and round-robin are paused until a plan is active again.

The platform operator can extend trials or give a plan for free (*All agencies → Plan*).

**Where limits are enforced (server-side)**: publishing a listing, inviting or restoring a team member,
adding a custom domain, CSV export, turning on round-robin (which also pauses itself when not included),
and the public site always shows “Powered by Estatery” unless the plan allows hiding it.

**Payments and webhooks**
- Checkout uses Razorpay's hosted Checkout (card and UPI details never reach our servers). The success
  handler's HMAC signature is verified, then the subscription is fetched from Razorpay.
- Webhooks arrive at `https://<platform>/api/webhooks/razorpay` (Next.js forwards the raw bytes to the
  private API). Each one must carry a valid `X-Razorpay-Signature` over the exact body; each
  `X-Razorpay-Event-Id` is processed once (unique index); events older than the last applied one never
  roll state back; a failed event returns 500 so Razorpay retries it.
- A reconcile job re-reads live subscriptions from Razorpay every 6 hours in case a webhook was missed.
- Owners get receipts, failed-payment, on-hold, cancellation and trial-ending emails.

**Test mode**: with no Razorpay keys (outside production) a built-in simulator stands in for Razorpay.
The billing page says *Test mode*; checkout opens a test payment dialog (approve or decline), and
*Try what happens at renewal* plays renewals and failed payments. Every simulated payment travels as a
signed webhook through the same handler as real ones. The demo data has Aurelia on Signature (monthly,
three receipts) and Banyan on a trial that ends in three days.

## Pages, articles & SEO

**Pages** (*Website → Pages*): About, Contact, FAQ, Privacy policy and Terms of use, each switchable
on/off. They are part of the website draft, so they preview, publish and restore with the rest of
the site. Privacy and Terms start from a general template for Indian agencies (DPDP Act 2023, RERA)
that agencies should have reviewed. The Contact page's enquiry form feeds the CRM like every other form.

**Articles** (*Articles*): headline, summary, topic, byline from an advisor profile, cover image,
body, and search-engine fields. Drafts can be incomplete; publishing checks for a summary, at least
80 words and a cover image. A live article keeps its address (unpublish to change it). The public
`/insights` index has topics and pagination; article pages show the byline, reading time and related articles.

**Simple formatting.** Long text is plain text with a few conventions (`## Heading`, `- list`,
`1. list`, `**bold**`, `[text](/path)`), rendered as React elements — never HTML — so agency
content can't inject markup. Links only allow site paths, `https://`, `mailto:` and `tel:`. Editors
get a Write/Preview toggle and a formatting guide.

**SEO, per agency:** `/sitemap.xml` (live listings, articles and enabled pages only) and `/robots.txt`
(the sitemap; blocks everything on non-primary addresses and on unknown or suspended sites);
canonical URLs on every page using the main custom domain; JSON-LD for the agency
(`RealEstateAgent`), listings, articles (`Article`), FAQ (`FAQPage`) and breadcrumbs; Open Graph
images; filtered and paged index views marked `noindex, follow`; a favicon drawn from each agency's
initial and colours; real 404 status codes for missing listings, articles and pages.

## Redirects

*Redirects* lets an agency moving from an old website send old addresses (including `.html` and
`.php` paths) to pages on the new site, one at a time or by pasting a list. Rules are checked:
no platform paths (`/admin`, `/properties`…), no loops or chains, no hiding a live listing or
article, safe targets only. The Next.js proxy applies them (301 or 302) from the same per-host
routing lookup it already caches for 60 seconds, so there is no extra request per page view.

## Security

- Tenant isolation enforced in the data layer (unscoped queries on tenant collections throw).
- Sessions: HttpOnly cookies (`__Host-` in production), rotating refresh tokens with reuse
  detection, double-submit CSRF, argon2id, account lockout and rate limits.
- Roles checked on every API call; the UI only hides what the API already refuses.
- No HTML from agencies anywhere: structured blocks and simple formatting only; links and images restricted.
- Uploads re-encoded to WebP with metadata stripped; another agency's media can't be referenced.
- Payments: Razorpay Checkout (card/UPI data never touches our servers), HMAC-verified checkout
  and webhooks, idempotent event handling.
- Headers on every page: Content Security Policy (scripts only from this site and Razorpay
  Checkout; frames only self, Razorpay and the OpenStreetMap embed; `frame-ancestors 'self'`),
  HSTS, `nosniff`, Referrer-Policy, Permissions-Policy and COOP.
- The API and `/internal/*` are never public; only the web server reaches them, with a shared key.

## Operations

- **Health:** `GET /health` (liveness, version) and `GET /health/ready` (database ping, job mode;
  503 when not ready) on the API. Docker health checks use them.
- **Errors:** set `SENTRY_DSN` on the API, worker and web app to send unexpected errors to Sentry
  (no request bodies, cookies or personal data). Without it, errors are written as one JSON line
  each to stderr. Covered: API 5xx errors, background jobs that fail all retries, server rendering
  errors (Next.js `onRequestError`), and browser-side error screens (`/api/client-errors`).
- **Request ids:** every API response has `X-Request-Id`; 500 responses include a short
  reference customers can quote.
- **Audit log:** every change in the Admin Panel is recorded with who, what and when (*Activity log*).

## Quality checks

Measured on the production build of this repository (Lighthouse 12, mobile, simulated throttling;
the demo images are external, so absolute timings depend on their CDN):

| Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| Home | 83 | 100 | 93* | 100 |
| Properties | 81 | 100 | 93* | 100 |
| Listing | 94 | 100 | 93* | 100 |
| Insights | 97 | 100 | 96 | 100 |
| About | 89 | 100 | 96 | 100 |

\* Console errors from demo images that the test environment couldn't download.
axe-core (WCAG 2.1 AA) reports **no violations** on 17 public and Admin Panel pages, and there are
no Content Security Policy violations. Theme colours are adjusted at render time so text always
meets WCAG contrast, whatever colours an agency picks.

```bash
pnpm test        # 133 API end-to-end tests (MongoDB required; Redis tests skip without Redis)
pnpm build       # production build of all packages
```

## Deployment

Two ways, both documented step by step:
- **[docs/vercel.md](docs/vercel.md)** — website on Vercel, API and worker on Render (`render.yaml`), MongoDB Atlas, Cloudflare R2.
- **[docs/deployment.md](docs/deployment.md)**: Docker images for the API/worker and the web app,
a production Compose file with MongoDB, Redis, Caddy (automatic HTTPS for agency domains), DNS
setup, Razorpay webhooks, backups and the go-live checklist.

## Design system

Tokens live in `apps/web/src/app/globals.css` (documented inline). Brand tokens — colours, heading
and body fonts, editorial display serif on/off, radii, motion level — come from the tenant's
**published theme** (`themes` collection, validated by `themeTokensSchema`) and are injected as CSS
variables by the root layout. Presets are in `packages/shared/src/presets.ts`.

Homepage content is a list of schema-validated blocks (`homepageSchema`): hero, search, featured,
locations, projects, categories, about, collections, agents, testimonials, insights, lead. The
published page decides which appear and in what order; each type maps to one React component in
`apps/web/src/components/sections/`. Blocks hold structured data only — no HTML or scripts — and
links are restricted to site paths, `https:`, `tel:` and `mailto:`.

### 3D hero
`components/three/hero-scene.tsx` is a procedural dusk residence (no model downloads). It is
only loaded (dynamic import, ~600 KB) when the device can afford it: not on phones, not with
`prefers-reduced-motion`, not with Data Saver, and not without WebGL. Weaker GPUs get a low-power
mode (no reflections or shadows, DPR 1). The static photo renders first (it is the LCP image) and
cross-fades to the scene once the first frame is drawn. Admins choose scene on/off, variant
(`pavilion` / `cantilever`) and the fallback image.

## Environment variables

| App | Variable | Purpose |
| --- | --- | --- |
| api | `MONGODB_URI` | MongoDB connection string |
| api | `INTERNAL_API_KEY` | Shared secret with the web server (≥ 24 chars) |
| api | `CORS_ORIGINS` | Browser origins allowed to call the API directly (admin, dev) |
| api | `PLATFORM_DOMAIN` | Root domain for tenant subdomains |
| api | `TENANT_CACHE_TTL_MS` | Hostname → tenant cache TTL |
| api | `JWT_ACCESS_SECRET` | Access-token signing secret (≥ 32 chars) |
| api | `ACCESS_TOKEN_TTL_SECONDS` / `REFRESH_TOKEN_TTL_DAYS` | Session lifetimes (900 s / 30 days) |
| api | `COOKIE_SECURE` | Force secure cookies on/off (defaults to on in production) |
| api | `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` | Account lockout policy (5 / 15) |
| api | `AUTH_RATE_LIMIT_PER_MIN` | Sign-in attempts per visitor per site per minute (10) |
| api | `SMTP_URL` / `MAIL_FROM` | Outgoing email (unset in development: emails are printed to the API log) |
| api | `REDIS_URL` | Enables the BullMQ job queue and shared rate limits. Unset: jobs run inline in the API process |
| api | `RUN_WORKERS` | `true` (default) runs job workers inside the API; set `false` when running `dist/worker.js` separately |
| api | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay subscriptions (all three, or none) |
| api | `BILLING_SIMULATOR` | Payment simulator when no keys are set, outside production (`true`) |
| api | `BILLING_RECONCILE_MINUTES` | Re-sync subscriptions from Razorpay (360; 0 = off) |
| api | `PLATFORM_NAME` | Name on Razorpay plans and receipts (Estatery) |
| api | `DEV_WEB_PORT` | Web port used to build links in development emails (3000) |
| api | `DOMAIN_CNAME_TARGET` / `DOMAIN_A_RECORDS` | Where agencies point their domains |
| api | `DNS_RESOLVERS` | Public resolvers used for verification (`1.1.1.1,8.8.8.8`) |
| api | `DOMAIN_MAX_PER_TENANT` / `DOMAIN_CLAIM_HOURS` | Limits (5 domains, 72 h claims) |
| api | `DOMAIN_RECHECK_MINUTES` / `DOMAIN_LOST_AFTER_FAILURES` | Re-check cadence (360) and tolerance (3) |
| api | `DOMAIN_RATE_LIMIT_PER_MIN` | Add/verify calls per visitor per minute (10) |
| api | `TLS_PROVIDER`, `TLS_ASK_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | Certificates (`caddy`, `cloudflare` or `vercel`) |
| api | `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | `TLS_PROVIDER=vercel`: agency domains are added to the Vercel project automatically |
| api | `MEDIA_DRIVER` | `local` (default) or `s3` |
| api | `MEDIA_LOCAL_DIR` / `MEDIA_MAX_UPLOAD_MB` | Local upload folder (`./.uploads`) / size limit (12) |
| api | `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` | Required when `MEDIA_DRIVER=s3`; `S3_ENDPOINT` only for non-AWS providers |
| web | `API_URL` | Where the Next.js server reaches the API |
| api | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Error reporting (optional; JSON logs otherwise) |
| api | `APP_VERSION` | Release shown in `/health` and error reports |
| web | `API_INTERNAL_KEY` | Same value as `INTERNAL_API_KEY` |
| web | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `APP_VERSION` | Error reporting for the web server and browser error screens |
| web | `PLATFORM_DOMAIN` | Same as the API's; shown when the platform operator creates agencies |
| web | `NEXT_DIST_DIR` | Build folder (default `.next`; lets a production build run beside `next dev`) |

## Known limitations

- Razorpay is integrated against its documented REST API and tested end to end with the built-in
  simulator. This build environment can't reach Razorpay, so do one run with `rzp_test_` keys
  before going live. Some payment methods (e.g. UPI AutoPay) don't allow plan changes on an
  existing subscription; the Admin Panel then asks the owner to cancel at period end and subscribe again.
- GST invoices come from Razorpay (linked in payment history when Razorpay issues one).
- The S3 media driver and Cloudflare for SaaS follow the providers' documented APIs but haven't
  been exercised against live accounts here; test them on staging.
- Lead emails are plain text; WhatsApp is a click-to-chat link, not the WhatsApp Business API.
- The Docker images and Compose file couldn't be built in this environment (no Docker daemon).
  Their runtime was verified directly: the API's production bundle (`pnpm deploy`) and the web
  app's standalone server both start and serve correctly.
