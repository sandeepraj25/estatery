# Deploying on Vercel

Vercel hosts the **website and Admin Panel** (`apps/web`). The **API and background worker**
(`apps/api`) are long-running servers with job queues, so they run on a container host — this
guide uses **Render** (a ready-made `render.yaml` is included; Railway or Fly.io work the same way).

```
visitor ──▶ Vercel (Next.js, HTTPS for every domain) ──HTTPS + internal key──▶ Render: API ──▶ MongoDB Atlas
                                                                           Render: worker ──▶ Redis (Render Key Value)
                                                                                         └──▶ Cloudflare R2 (images)
```

You need accounts on: **Vercel**, **Render**, **MongoDB Atlas**, **Cloudflare** (R2 storage), an
**SMTP provider** (Amazon SES, Postmark, Zoho, Brevo…) and **Razorpay**. Push the project to a
GitHub repository first; both Vercel and Render deploy from it.

## 1. Database: MongoDB Atlas

1. Create a cluster (M10 or larger for production; the free M0 is fine for a trial). Region: Mumbai.
2. *Database Access* → add a user with read/write access.
3. *Network Access* → allow `0.0.0.0/0` (Render's outbound addresses change), or use Render's static
   outbound IPs on paid plans and allow only those.
4. *Connect → Drivers* → copy the connection string and add the database name, e.g.
   `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/estatery?retryWrites=true&w=majority`.

## 2. Images: Cloudflare R2

1. Create a bucket, e.g. `estatery-media`, and turn on its public `r2.dev` URL or connect a domain
   like `media.yourplatform.com`.
2. *Manage R2 API tokens* → create a token with Object Read & Write for that bucket.
3. Note: `S3_BUCKET`, `S3_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`),
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` (the public URL from step 1).

## 3. API and worker: Render

1. Render → **New → Blueprint** → choose the repository. Render reads `render.yaml` and proposes
   `estatery-api` (web service), `estatery-worker` and `estatery-redis`.
2. Fill in the values it asks for: `MONGODB_URI`, `PLATFORM_DOMAIN` (e.g. `yourplatform.com`), the
   R2 values, `SMTP_URL`, `MAIL_FROM`, Razorpay keys, and the Vercel values from step 4 (you can add
   those after creating the Vercel project). `INTERNAL_API_KEY`, `JWT_ACCESS_SECRET` and
   `TLS_ASK_TOKEN` are generated for you.
3. Deploy. When `estatery-api` is live, open `https://estatery-api.onrender.com/health/ready` —
   it should show `"ok":true,"database":true,"jobs":"bullmq"`.
4. Create your platform operator (Render → estatery-api → **Shell**):
   ```bash
   node dist/scripts/create-operator.js --name "Your Company" --slug hq --email you@company.com --owner "Your Name"
   ```
   Keep the printed password; you'll sign in with it at `https://hq.yourplatform.com/admin`.

Use a paid instance (not the free plan) for the API: free instances sleep and the first visitor
would wait about a minute.

## 4. Website and Admin Panel: Vercel

1. Vercel → **Add New → Project** → import the repository.
2. **Root Directory:** `apps/web`. Vercel picks up `apps/web/vercel.json` (pnpm install and build
   commands, Mumbai region). Framework: Next.js.
3. **Environment Variables** (Production and Preview):

   | Name | Value |
   | --- | --- |
   | `API_URL` | `https://estatery-api.onrender.com` (your Render API URL) |
   | `API_INTERNAL_KEY` | the API's `INTERNAL_API_KEY` (copy it from Render → estatery-api → Environment) |
   | `PLATFORM_DOMAIN` | `yourplatform.com` |
   | `SENTRY_DSN` | optional |

4. Deploy. Then **Settings → General** → copy the **Project ID**; **Settings → Tokens** (account
   menu) → create a token. Put them on Render as `VERCEL_PROJECT_ID` and `VERCEL_API_TOKEN` (and
   `VERCEL_TEAM_ID` if the project belongs to a team), on both `estatery-api` and `estatery-worker`.

## 5. Domains

**Platform domain.** In Vercel → Project → **Domains**, add `yourplatform.com` and
`*.yourplatform.com`. Wildcard domains require the domain to use **Vercel's nameservers**
(`ns1.vercel-dns.com`, `ns2.vercel-dns.com`); Vercel shows the steps. Every agency gets
`<name>.yourplatform.com` automatically.

**Agency domains.** Nothing manual: with `TLS_PROVIDER=vercel`, when an agency verifies its domain
in *Admin Panel → Domains*, the API adds it to the Vercel project and Vercel issues the HTTPS
certificate. The Admin Panel tells agencies to add:
- `TXT _estatery-verify.<domain>` (proves ownership to us), and
- `CNAME www → cname.vercel-dns.com`, or for a root domain `A → 76.76.21.21`.

If Vercel needs an extra record (it happens when the domain was used in another Vercel account),
the domain's HTTPS status in the Admin Panel says exactly which TXT record to add.

## 6. Payments: Razorpay webhook

Razorpay Dashboard → **Webhooks → Add**: URL `https://hq.yourplatform.com/api/webhooks/razorpay`,
the same secret as `RAZORPAY_WEBHOOK_SECRET`, and the subscription events listed in
`docs/deployment.md` (section 4). The website forwards each webhook to the API.

## 7. Check it

- `https://hq.yourplatform.com` shows your site; `/admin` signs you in.
- *All agencies → New agency* creates `<name>.yourplatform.com` and emails the owner.
- `https://<agency>.yourplatform.com/sitemap.xml` lists that agency's pages.
- Upload an image in *Media*: its URL should start with your R2 public URL.

**Updating:** push to GitHub. Vercel redeploys the website; Render redeploys the API and worker.

## Notes and limits

- The API is reachable on the internet here (Vercel's servers must call it). It only trusts a
  visitor's hostname when the request carries `API_INTERNAL_KEY`, so keep that key secret and long.
- Uploaded images must go to R2/S3: Render's disk is wiped on every deploy.
- Vercel's Hobby plan is for personal, non-commercial use; a paid platform needs Vercel Pro.
