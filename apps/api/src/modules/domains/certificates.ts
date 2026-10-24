import { Logger } from '@nestjs/common';
import { loadEnv } from '../../config/env.js';

/**
 * How HTTPS certificates are obtained for custom domains.
 *
 *  - caddy (default): a Caddy reverse proxy in front of the platform uses on-demand TLS. Before
 *    issuing a certificate for a new hostname, Caddy calls our "ask" endpoint, which only says yes
 *    for verified domains of active tenants. Nothing to call here.
 *  - cloudflare: Cloudflare for SaaS. Verified hostnames are registered as custom hostnames on the
 *    platform zone; Cloudflare issues and renews the certificates.
 *  - vercel: the web app is hosted on Vercel. Verified hostnames are added to the Vercel project
 *    (Domains API); Vercel issues and renews the certificates.
 */
export interface CertificateProvider {
  readonly name: string;
  onVerified(hostname: string): Promise<{ providerRef: string | null }>;
  onRemoved(hostname: string, providerRef: string | null): Promise<void>;
}

class CaddyOnDemand implements CertificateProvider {
  readonly name = 'caddy';
  async onVerified() {
    return { providerRef: null };
  }
  async onRemoved() {}
}

class CloudflareForSaas implements CertificateProvider {
  readonly name = 'cloudflare';
  private readonly logger = new Logger('CloudflareForSaas');
  private readonly env = loadEnv();
  private readonly base = `https://api.cloudflare.com/client/v4/zones/${this.env.CLOUDFLARE_ZONE_ID}/custom_hostnames`;
  private headers() {
    return { authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
  }

  async onVerified(hostname: string) {
    const res = await fetch(this.base, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } }),
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; result?: { id: string }; errors?: Array<{ message: string }> } | null;
    if (!res.ok || !body?.success) {
      const msg = body?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
      // Already registered is fine (e.g. re-verification).
      if (/already exists/i.test(msg)) return { providerRef: null };
      throw new Error(`Cloudflare rejected ${hostname}: ${msg}`);
    }
    return { providerRef: body.result?.id ?? null };
  }

  async onRemoved(hostname: string, providerRef: string | null) {
    if (!providerRef) return;
    const res = await fetch(`${this.base}/${providerRef}`, { method: 'DELETE', headers: this.headers() });
    if (!res.ok && res.status !== 404) this.logger.error(`Couldn't remove ${hostname} from Cloudflare (HTTP ${res.status})`);
  }
}

interface VercelDomain {
  name: string;
  verified: boolean;
  verification?: Array<{ type: string; domain: string; value: string; reason: string }>;
}

class VercelDomains implements CertificateProvider {
  readonly name = 'vercel';
  private readonly logger = new Logger('VercelDomains');
  private readonly env = loadEnv();
  private url(path: string) {
    const team = this.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(this.env.VERCEL_TEAM_ID)}` : '';
    return `https://api.vercel.com${path}${team}`;
  }
  private headers() {
    return { authorization: `Bearer ${this.env.VERCEL_API_TOKEN}`, 'content-type': 'application/json' };
  }
  private project() {
    return encodeURIComponent(this.env.VERCEL_PROJECT_ID!);
  }

  /** Vercel sometimes asks for its own TXT record (e.g. the domain was used in another Vercel account). */
  private explain(d: VercelDomain) {
    const v = d.verification?.[0];
    return v
      ? `Vercel needs one more DNS record before it can serve ${d.name}: add a ${v.type} record for ${v.domain} with the value ${v.value}, then check again.`
      : `Vercel hasn’t confirmed ${d.name} yet. Check again in a few minutes.`;
  }

  async onVerified(hostname: string) {
    const res = await fetch(this.url(`/v10/projects/${this.project()}/domains`), {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ name: hostname }),
    });
    let domain = (await res.json().catch(() => null)) as (VercelDomain & { error?: { code?: string; message?: string } }) | null;
    if (!res.ok) {
      const code = domain?.error?.code ?? '';
      // Already on this project (e.g. re-verification): read its current state instead.
      if (res.status === 409 && /already/.test(code + (domain?.error?.message ?? ''))) {
        const got = await fetch(this.url(`/v9/projects/${this.project()}/domains/${encodeURIComponent(hostname)}`), { headers: this.headers() });
        if (!got.ok) throw new Error(`Vercel: ${domain?.error?.message ?? `HTTP ${res.status}`}`);
        domain = (await got.json()) as VercelDomain;
      } else {
        throw new Error(`Vercel rejected ${hostname}: ${domain?.error?.message ?? `HTTP ${res.status}`}`);
      }
    }
    if (domain && !domain.verified) {
      // Ask Vercel to re-check now; if it still isn't verified, tell the agency exactly what to add.
      const again = await fetch(this.url(`/v9/projects/${this.project()}/domains/${encodeURIComponent(hostname)}/verify`), { method: 'POST', headers: this.headers() });
      const after = (await again.json().catch(() => null)) as VercelDomain | null;
      if (!after?.verified) throw new Error(this.explain(after ?? domain));
    }
    return { providerRef: hostname };
  }

  async onRemoved(hostname: string) {
    const res = await fetch(this.url(`/v9/projects/${this.project()}/domains/${encodeURIComponent(hostname)}`), { method: 'DELETE', headers: this.headers() });
    if (!res.ok && res.status !== 404) this.logger.error(`Couldn't remove ${hostname} from Vercel (HTTP ${res.status})`);
  }
}

export function createCertificateProvider(): CertificateProvider {
  const p = loadEnv().TLS_PROVIDER;
  return p === 'cloudflare' ? new CloudflareForSaas() : p === 'vercel' ? new VercelDomains() : new CaddyOnDemand();
}
