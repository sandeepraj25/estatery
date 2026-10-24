import { z } from 'zod';

/**
 * Custom domain contracts. A hostname is accepted only if it is a syntactically valid public
 * domain: no IPs, no localhost, no single-label names, no wildcard, lowercase ASCII (IDN
 * domains must be entered in punycode, e.g. xn--...).
 */
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function normaliseDomainInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '') // pasted URL
    .replace(/\/.*$/, '') // path
    .replace(/:\d+$/, '') // port
    .replace(/\.$/, ''); // trailing dot
}

export function domainProblem(host: string): string | null {
  if (!host) return 'Enter a domain, e.g. www.youragency.com';
  if (host.length > 253) return 'That domain is too long';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return 'Enter a domain name, not an IP address';
  if (host.includes('*')) return 'Wildcard domains aren’t supported. Add each address separately';
  const labels = host.split('.');
  if (labels.length < 2) return 'Include the full domain, e.g. youragency.com';
  if (!labels.every((l) => LABEL.test(l))) return 'Use only letters, numbers, hyphens and dots';
  if (/^\d+$/.test(labels[labels.length - 1]!)) return 'That isn’t a valid domain ending';
  if (['localhost', 'local', 'internal', 'test', 'example', 'invalid'].includes(labels[labels.length - 1]!)) return 'Use a public domain you own';
  return null;
}

export const addDomainSchema = z.object({
  hostname: z
    .string()
    .max(300)
    .transform(normaliseDomainInput)
    .superRefine((v, ctx) => {
      const p = domainProblem(v);
      if (p) ctx.addIssue({ code: 'custom', message: p });
    }),
});

export type DomainStatus = 'pending' | 'verified' | 'failed' | 'lost';
export type TlsStatus = 'unknown' | 'pending' | 'active' | 'error';

export interface DomainDto {
  id: string;
  hostname: string;
  kind: 'platform' | 'custom';
  isPrimary: boolean;
  status: DomainStatus;
  verified: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  claimExpiresAt: string | null;
  routing: { ok: boolean; detail: string } | null;
  tls: { status: TlsStatus; checkedAt: string | null; expiresAt: string | null; error: string | null };
  /** DNS records the agency must create (custom domains only). */
  records: Array<{ type: 'TXT' | 'CNAME' | 'A'; name: string; value: string; purpose: string }>;
}
