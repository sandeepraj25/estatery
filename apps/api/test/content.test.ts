import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, signIn } from './helpers.js';

let app: INestApplication;
let conn: Connection;
let password: string;
let close: () => Promise<void>;
const A = 'aurelia.localhost';
const B = 'banyan.localhost';

beforeAll(async () => {
  ({ app, conn, password, close } = await bootTestApp('content'));
});
afterAll(async () => close?.());

const pub = (path: string, host = A) => request(app.getHttpServer()).get(path).set('Host', host);
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('content pages', () => {
  it('serves published pages and reports which are switched on', async () => {
    const about = await pub('/v1/site/pages/about');
    expect(about.status).toBe(200);
    expect(about.body).toMatchObject({ enabled: true, title: 'About Aurelia Estates' });
    expect(about.body.highlights).toHaveLength(4);
    expect((await pub('/v1/site')).body.pages).toEqual({ about: true, contact: true, faq: true, privacy: true, terms: true });
    expect((await pub('/v1/site/pages/nonsense')).status).toBe(400);
  });

  it('edits go to the draft, are previewable, and go live only when published', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const draft = (await editor.c.get('/v1/admin/site/draft')).body;
    expect(draft.revisions.pages).toBe(0);
    const pages = structuredClone(draft.draft.pages);

    // Unsafe links are rejected with a clear message.
    pages.faq.items[0].answer = 'See [here](javascript:alert(1)) for details';
    const bad = await editor.c.put('/v1/admin/site/draft/pages', { value: pages, baseRevision: 0 });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body.error.fields)).toContain('must start with /');

    pages.faq.items[0].answer = 'See [our listings](/properties) for details.';
    pages.faq.enabled = false;
    pages.about.title = 'Our story';
    expect((await editor.c.put('/v1/admin/site/draft/pages', { value: pages, baseRevision: 0 })).body).toEqual({ revision: 1 });
    // A stale revision conflicts.
    expect((await editor.c.put('/v1/admin/site/draft/pages', { value: pages, baseRevision: 0 })).status).toBe(409);

    expect((await pub('/v1/site/pages/faq')).status).toBe(200); // visitors still see the live page
    expect((await editor.c.get('/v1/admin/site/preview/pages/about')).body.title).toBe('Our story');
    expect((await editor.c.get('/v1/admin/site/draft')).body.changed).toEqual(['pages']);

    const published = await editor.c.post('/v1/admin/site/publish', { note: 'New about page' });
    expect(published.status).toBe(200);
    expect(published.body.changed).toEqual(['pages']);
    expect((await pub('/v1/site/pages/faq')).status).toBe(404);
    expect((await pub('/v1/site/pages/about')).body.title).toBe('Our story');
    expect((await pub('/v1/site')).body.pages.faq).toBe(false);

    // Restoring the first version brings the old pages back into the draft.
    const admin = await signIn(app, A, 'admin@aurelia.example', password);
    expect((await admin.c.post('/v1/admin/site/versions/1/restore', {})).status).toBeLessThan(300);
    expect((await admin.c.get('/v1/admin/site/draft')).body.draft.pages.faq.enabled).toBe(true);
    await admin.c.post('/v1/admin/site/publish', { note: 'Back to the original pages' });
    expect((await pub('/v1/site/pages/faq')).status).toBe(200);
  });

  it('only content editors can change pages', async () => {
    const agent = await signIn(app, A, 'kabir@aurelia.example', password);
    const res = await agent.c.put('/v1/admin/site/draft/pages', { value: {}, baseRevision: 0 });
    expect(res.status).toBe(403);
  });

  it('agencies without saved pages get sensible defaults', async () => {
    await conn.collection('pages').deleteOne({ key: 'pages', tenantId: (await conn.collection('tenants').findOne({ slug: 'banyan' }))!._id });
    const privacy = await pub('/v1/site/pages/privacy', B);
    expect(privacy.status).toBe(200);
    expect(privacy.body.body).toContain('Digital Personal Data Protection Act, 2023');
    const owner = await signIn(app, B, 'owner@banyan.example', password);
    expect((await owner.c.get('/v1/admin/site/draft')).body.draft.pages.about.title).toBe('About Banyan & Co. Realty');
  });
});

describe('articles', () => {
  let id: string;
  const base = {
    title: 'Renting in Bandra: what a fair deposit looks like', slug: '', excerpt: 'Short.', category: 'Renter’s Guide',
    image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85', imageAlt: '', body: 'Too short for now.', authorId: null, seoTitle: '', seoDescription: '',
  };

  it('editors write drafts that visitors can’t see', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const res = await editor.c.post('/v1/admin/articles', base);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'draft', slug: 'renting-in-bandra-what-a-fair-deposit-looks-like', publishedAt: null });
    id = res.body.id;
    expect((await pub(`/v1/site/articles/${res.body.slug}`)).status).toBe(404);
    const list = (await editor.c.get('/v1/admin/articles?status=draft')).body;
    expect(list.counts).toEqual({ draft: 1, published: 3 });
    // Same title again gets a unique address.
    const again = await editor.c.post('/v1/admin/articles', base);
    expect(again.body.slug).toBe('renting-in-bandra-what-a-fair-deposit-looks-like-2');
    expect((await editor.c.del(`/v1/admin/articles/${again.body.id}`)).status).toBe(204);
    // A draft can be saved before a cover image is chosen; publishing still requires one.
    const noImage = await editor.c.post('/v1/admin/articles', { ...base, title: 'Notes for later', image: '' });
    expect(noImage.status).toBe(201);
    expect((await editor.c.post(`/v1/admin/articles/${noImage.body.id}/status`, { status: 'published' })).body.error.problems).toContain('Choose a cover image');
    expect((await editor.c.del(`/v1/admin/articles/${noImage.body.id}`)).status).toBe(204);
  });

  it('publishing needs a complete article', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const r = await editor.c.post(`/v1/admin/articles/${id}/status`, { status: 'published' });
    expect(r.status).toBe(400);
    expect(r.body.error.problems).toEqual(expect.arrayContaining(['Write a summary of at least 40 characters', 'Write at least 80 words']));

    const kabir = await conn.collection('agents').findOne({ name: 'Kabir Malhotra' });
    const full = {
      ...base, excerpt: 'Deposits in Bandra range widely. Here is what is normal, what is negotiable and what to put in writing.',
      body: `## Typical deposits\n\n${words(90)}\n\n- Ten months is common\n- Six is negotiable`, authorId: kabir!._id.toString(), seoTitle: 'Bandra rental deposits explained',
    };
    expect((await editor.c.put(`/v1/admin/articles/${id}`, full)).status).toBe(200);
    const ok = await editor.c.post(`/v1/admin/articles/${id}/status`, { status: 'published' });
    expect(ok.status).toBe(200);
    expect(ok.body.publishedAt).toBeTruthy();
    expect(ok.body.readMinutes).toBe(1);

    const live = await pub('/v1/site/articles/renting-in-bandra-what-a-fair-deposit-looks-like');
    expect(live.status).toBe(200);
    expect(live.body).toMatchObject({ author: { name: 'Kabir Malhotra' }, seoTitle: 'Bandra rental deposits explained' });
    expect(live.body.related).toHaveLength(3);
    expect(live.body.related.map((r: { slug: string }) => r.slug)).not.toContain(live.body.slug);
  });

  it('a live article keeps its address and must be unpublished before deleting', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const current = (await editor.c.get(`/v1/admin/articles/${id}`)).body;
    const move = await editor.c.put(`/v1/admin/articles/${id}`, { ...current, slug: 'new-address' });
    expect(move.status).toBe(400);
    expect(move.body.error.fields[0].path).toBe('slug');
    expect((await editor.c.del(`/v1/admin/articles/${id}`)).status).toBe(409);
  });

  it('is isolated per agency and closed to roles without content access', async () => {
    const banyan = await signIn(app, B, 'owner@banyan.example', password);
    expect((await banyan.c.get(`/v1/admin/articles/${id}`)).status).toBe(404);
    const foreign = await banyan.c.post('/v1/admin/articles', { ...base, image: `/media/${(await conn.collection('tenants').findOne({ slug: 'aurelia' }))!._id}/aaaaaaaaaaaaaaaaaaaaaaaa-12345678.webp` });
    expect(foreign.status).toBe(400);
    const agent = await signIn(app, A, 'kabir@aurelia.example', password);
    expect((await agent.c.get('/v1/admin/articles')).status).toBe(403);
  });

  it('the public index paginates and filters by category', async () => {
    const all = (await pub('/v1/site/articles?limit=2')).body;
    expect(all).toMatchObject({ total: 4, totalPages: 2, page: 1 });
    expect(all.items).toHaveLength(2);
    expect(all.categories).toEqual(expect.arrayContaining(['Guide', 'Market Report', 'Renter’s Guide']));
    const guides = (await pub(`/v1/site/articles?category=${encodeURIComponent('Market Report')}`)).body;
    expect(guides.items.map((a: { category: string }) => a.category)).toEqual(['Market Report']);
    expect((await pub('/v1/site/articles', B)).body.total).toBe(0);
  });
});

describe('sitemap data', () => {
  it('lists only live pages for the agency that owns the host', async () => {
    const items: Array<{ path: string; priority: number }> = (await pub('/v1/site/sitemap')).body.items;
    const paths = items.map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['/', '/properties', '/insights', '/about', '/contact', '/faq', '/privacy', '/terms']));
    const live = await conn.collection('properties').countDocuments({ tenantId: (await conn.collection('tenants').findOne({ slug: 'aurelia' }))!._id, status: 'published' });
    expect(paths.filter((p) => p.startsWith('/properties/'))).toHaveLength(live);
    const draft = await conn.collection('properties').findOne({ status: 'draft' });
    if (draft) expect(paths).not.toContain(`/properties/${draft.slug}`);
    expect(paths).toContain('/insights/renting-in-bandra-what-a-fair-deposit-looks-like');

    const banyan: string[] = (await pub('/v1/site/sitemap', B)).body.items.map((i: { path: string }) => i.path);
    expect(banyan).not.toContain('/insights');
    expect(banyan.some((p) => paths.includes(p) && p.startsWith('/properties/'))).toBe(false);
  });
});
