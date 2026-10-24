import { Injectable } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';
import { connect } from 'node:tls';
import { loadEnv } from '../../config/env.js';

/** Minimal DNS surface the domain checks need. Swappable in tests. */
export interface DnsLookup {
  txt(name: string): Promise<string[]>;
  cname(name: string): Promise<string[]>;
  a(name: string): Promise<string[]>;
}

export interface TlsResult {
  ok: boolean;
  expiresAt: Date | null;
  error: string | null;
}
export type TlsProbe = (host: string) => Promise<TlsResult>;

const quiet = async (p: Promise<string[]>) => {
  try {
    return await p;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ENODATA' || code === 'ENOTFOUND' || code === 'ENOTIMP' || code === 'NXDOMAIN') return [];
    throw e;
  }
};

/** Queries public resolvers directly so a fresh DNS change isn't hidden by a stale local cache. */
class PublicDns implements DnsLookup {
  private readonly r = new Resolver({ timeout: 4000, tries: 2 });
  constructor(servers: string[]) {
    if (servers.length) this.r.setServers(servers);
  }
  async txt(name: string) {
    return (await quiet(this.r.resolveTxt(name).then((rows) => rows.map((chunks) => chunks.join(''))))) as string[];
  }
  cname(name: string) {
    return quiet(this.r.resolveCname(name));
  }
  a(name: string) {
    return quiet(this.r.resolve4(name));
  }
}

/** Opens a TLS connection with SNI and validates the certificate chain and hostname. */
const realTlsProbe: TlsProbe = (host) =>
  new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: 6000, rejectUnauthorized: true }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve({ ok: socket.authorized, expiresAt: cert?.valid_to ? new Date(cert.valid_to) : null, error: socket.authorized ? null : String(socket.authorizationError) });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, expiresAt: null, error: 'Timed out connecting on port 443' });
    });
    socket.on('error', (e) => resolve({ ok: false, expiresAt: null, error: e.message }));
  });

@Injectable()
export class DnsService {
  private lookup: DnsLookup = new PublicDns(loadEnv().DNS_RESOLVERS.split(',').map((s) => s.trim()).filter(Boolean));
  private probe: TlsProbe = realTlsProbe;

  get dns() {
    return this.lookup;
  }
  get tls() {
    return this.probe;
  }

  /** Test seam: replace network lookups with deterministic fakes. */
  useFakes(dns: DnsLookup, tls: TlsProbe) {
    this.lookup = dns;
    this.probe = tls;
  }
}
