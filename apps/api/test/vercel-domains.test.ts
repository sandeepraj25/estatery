import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.INTERNAL_API_KEY = 'test-internal-key-0123456789abcdef';
  process.env.JWT_ACCESS_SECRET = 'test-jwt-secret-0123456789abcdef0123456789';
  process.env.TLS_PROVIDER = 'vercel';
  process.env.VERCEL_API_TOKEN = 'tok_test';
  process.env.VERCEL_PROJECT_ID = 'prj_web';
  process.env.VERCEL_TEAM_ID = 'team_1';
  const { resetEnvCache } = await import('../src/config/env.js');
  resetEnvCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  calls = [];
  delete process.env.TLS_PROVIDER;
});

function stub(responses: Array<(c: Call) => Response>) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? 'GET', body: init.body as string | undefined };
    calls.push(c);
    return responses.shift()!(c);
  });
}

describe('Vercel domains (TLS_PROVIDER=vercel)', () => {
  it('adds a verified agency domain to the Vercel project', async () => {
    const { createCertificateProvider } = await import('../src/modules/domains/certificates.js');
    stub([() => reply(200, { name: 'www.agency.in', verified: true })]);
    const r = await createCertificateProvider().onVerified('www.agency.in');
    expect(r.providerRef).toBe('www.agency.in');
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://api.vercel.com/v10/projects/prj_web/domains?teamId=team_1' });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ name: 'www.agency.in' });
  });

  it('explains the extra TXT record Vercel asks for', async () => {
    const { createCertificateProvider } = await import('../src/modules/domains/certificates.js');
    const pending = { name: 'agency.in', verified: false, verification: [{ type: 'TXT', domain: '_vercel.agency.in', value: 'vc-domain-verify=agency.in,abc', reason: 'pending_domain_verification' }] };
    stub([() => reply(200, pending), () => reply(400, pending)]);
    await expect(createCertificateProvider().onVerified('agency.in')).rejects.toThrow('add a TXT record for _vercel.agency.in with the value vc-domain-verify=agency.in,abc');
    expect(calls[1]).toMatchObject({ method: 'POST', url: 'https://api.vercel.com/v9/projects/prj_web/domains/agency.in/verify?teamId=team_1' });
  });

  it('treats an already-added domain as fine, and removes domains on delete', async () => {
    const { createCertificateProvider } = await import('../src/modules/domains/certificates.js');
    stub([
      () => reply(409, { error: { code: 'domain_already_exists', message: 'The domain is already assigned to this project.' } }),
      () => reply(200, { name: 'www.agency.in', verified: true }),
      () => reply(200, {}),
    ]);
    const p = createCertificateProvider();
    expect((await p.onVerified('www.agency.in')).providerRef).toBe('www.agency.in');
    await p.onRemoved('www.agency.in', 'www.agency.in');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://api.vercel.com/v10/projects/prj_web/domains?teamId=team_1',
      'GET https://api.vercel.com/v9/projects/prj_web/domains/www.agency.in?teamId=team_1',
      'DELETE https://api.vercel.com/v9/projects/prj_web/domains/www.agency.in?teamId=team_1',
    ]);
  });
});
