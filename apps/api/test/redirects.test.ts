import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, KEY, signIn } from './helpers.js';

let app: INestApplication;
let password: string;
let close: () => Promise<void>;
const A = 'aurelia.localhost';
const B = 'banyan.localhost';

beforeAll(async () => {
  ({ app, password, close } = await bootTestApp('redirects'));
});
afterAll(async () => close?.());

const routing = (host: string) => request(app.getHttpServer()).get('/v1/site/routing').set('x-internal-key', KEY).set('x-tenant-host', host);

describe('redirects', () => {
  it('adds a redirect, normalising the old address', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const r = await editor.c.post('/v1/admin/redirects', { from: '/Listings/Villa-12.HTML/?ref=old', to: '/properties/the-glasshouse-alibaug' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ from: '/listings/villa-12.html', permanent: true });
    expect((await routing(A)).body.redirects).toEqual([{ from: '/listings/villa-12.html', to: '/properties/the-glasshouse-alibaug', permanent: true }]);
    expect((await routing(B)).body.redirects).toEqual([]);
    expect((await editor.c.post('/v1/admin/redirects', { from: '/listings/villa-12.html', to: '/' })).status).toBe(409);
  });

  it('refuses unsafe or confusing rules', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const expectRefused = async (body: object, text: string) => {
      const r = await editor.c.post('/v1/admin/redirects', body);
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body), JSON.stringify(r.body)).toContain(text);
    };
    await expectRefused({ from: '/admin/login', to: '/' }, 'can’t be redirected');
    await expectRefused({ from: '/properties', to: '/' }, 'can’t be redirected');
    await expectRefused({ from: 'old-page', to: '/' }, 'Start the old address with /');
    await expectRefused({ from: '/old', to: 'javascript:alert(1)' }, 'Links must be');
    await expectRefused({ from: '/same', to: '/same' }, 'points to itself');
    await expectRefused({ from: '/properties/whitefield-family-villa', to: '/' }, 'live page');
    await expectRefused({ from: '/older', to: '/listings/villa-12.html' }, 'itself redirected');
  });

  it('imports a pasted list and reports lines that need fixing', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const r = await editor.c.post('/v1/admin/redirects/bulk', { text: '# from the old site\n/about-us.php /about\n/team.html, /about#advisors\n/contact.html\n/admin /\n/news/2024 https://example.com/news' });
    expect(r.status).toBe(200);
    expect(r.body.added).toBe(3);
    expect(r.body.errors.map((e: { line: number }) => e.line)).toEqual([3, 4]);
    expect((await editor.c.get('/v1/admin/redirects')).body.items).toHaveLength(4);
  });

  it('is isolated per agency and needs content access', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const id = (await editor.c.get('/v1/admin/redirects')).body.items[0].id;
    const banyan = await signIn(app, B, 'owner@banyan.example', password);
    expect((await banyan.c.del(`/v1/admin/redirects/${id}`)).status).toBe(404);
    const agent = await signIn(app, A, 'kabir@aurelia.example', password);
    expect((await agent.c.get('/v1/admin/redirects')).status).toBe(403);
    expect((await editor.c.del(`/v1/admin/redirects/${id}`)).status).toBe(204);
  });
});
