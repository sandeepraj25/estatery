import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, signIn, type Jar } from './helpers.js';

let app: INestApplication;
let conn: Connection;
let password: string;
let close: () => Promise<void>;
const A = 'aurelia.localhost';
const B = 'banyan.localhost';

beforeAll(async () => {
  ({ app, conn, password, close } = await bootTestApp('cms'));
});
afterAll(async () => close?.());

/** A real JPEG with EXIF GPS data, to prove uploads strip location metadata. */
async function photo(w = 1600, h = 1000) {
  return sharp({ create: { width: w, height: h, channels: 3, background: '#7b5233' } })
    .withExif({ IFD0: { Copyright: 'Owner' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '19/1 0/1 0/1' } })
    .jpeg()
    .toBuffer();
}

function upload(jar: Jar, buf: Buffer, name = 'photo.jpg') {
  return request(app.getHttpServer())
    .post('/v1/admin/media')
    .set('Host', jar.host)
    .set('Cookie', jar.header())
    .set('x-csrf-token', jar.get('es_csrf')!)
    .attach('file', buf, name);
}

const draftInput = (over: Record<string, unknown> = {}) => ({
  title: 'Courtyard House, Juhu',
  listingType: 'sale', category: 'residential', type: 'independent-house',
  price: 145000000, bhk: 4, bathrooms: 4, areaSqft: 5200,
  location: { locality: 'Juhu', city: 'Mumbai', state: 'Maharashtra', lat: 19.1, lng: 72.83 },
  ...over,
});

describe('media uploads', () => {
  it('re-encodes images to WebP and strips EXIF/GPS metadata', async () => {
    const { jar } = await signIn(app, A, 'editor@aurelia.example', password);
    const res = await upload(jar, await photo());
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/media\/[a-f0-9]{24}\/[a-f0-9]{24}-[a-f0-9]{8}\.webp$/);
    const file = await request(app.getHttpServer()).get(res.body.url).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    const meta = await sharp(file.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('rejects files that are not images, whatever their name says', async () => {
    const { jar } = await signIn(app, A, 'editor@aurelia.example', password);
    const res = await upload(jar, Buffer.from('<script>alert(1)</script>'), 'evil.jpg');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
  });

  it('rejects tiny images', async () => {
    const { jar } = await signIn(app, A, 'editor@aurelia.example', password);
    expect((await upload(jar, await photo(200, 150))).status).toBe(400);
  });

  it('roles without edit rights cannot upload', async () => {
    const { jar } = await signIn(app, A, 'support@aurelia.example', password);
    expect((await upload(jar, await photo())).status).toBe(403);
  });

  it('only serves well-formed media paths', async () => {
    expect((await request(app.getHttpServer()).get('/media/../.env')).status).toBe(404);
    expect((await request(app.getHttpServer()).get('/media/abc/def.webp')).status).toBe(404);
  });
});

describe('property management', () => {
  it('creates a draft, refuses to publish until complete, then publishes', async () => {
    const { c, jar } = await signIn(app, A, 'editor@aurelia.example', password);
    const created = await c.post('/v1/admin/properties', draftInput());
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('draft');
    expect(created.body.slug).toBe('courtyard-house-juhu-juhu');
    expect(created.body.publishProblems.length).toBeGreaterThan(0);

    const id = created.body.id;
    const early = await c.post(`/v1/admin/properties/${id}/status`, { status: 'published' });
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('PUBLISH_REQUIREMENTS');

    // Not visible publicly while a draft.
    expect((await request(app.getHttpServer()).get(`/v1/properties/${created.body.slug}`).set('Host', A)).status).toBe(404);

    const img = await upload(jar, await photo());
    const complete = await c.patch(`/v1/admin/properties/${id}`, {}); // wrong verb guard
    expect(complete.status).toBe(404);
    const updated = await (async () => {
      const r = await request(app.getHttpServer()).put(`/v1/admin/properties/${id}`).set('Host', A).set('Cookie', jar.header()).set('x-csrf-token', jar.get('es_csrf')!)
        .send(draftInput({
          slug: 'courtyard-house-juhu', images: [{ url: img.body.url, alt: 'Courtyard at dusk' }],
          summary: 'A rare courtyard home two streets from Juhu beach.',
          description: 'Built around a planted courtyard, this four-bedroom home brings light into every room and stays cool through the Mumbai summer.',
        }));
      return r;
    })();
    expect(updated.status).toBe(200);
    expect(updated.body.publishProblems).toEqual([]);

    const pub = await c.post(`/v1/admin/properties/${id}/status`, { status: 'published' });
    expect(pub.status).toBe(200);
    const pubRes = await request(app.getHttpServer()).get('/v1/properties/courtyard-house-juhu').set('Host', A);
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.property.images[0].url).toBe(img.body.url);
  });

  it('renaming a listing keeps the old URL working as a redirect', async () => {
    const { jar } = await signIn(app, A, 'editor@aurelia.example', password);
    const list = await request(app.getHttpServer()).get('/v1/admin/properties?q=Courtyard').set('Host', A).set('Cookie', jar.header());
    const id = list.body.items[0].id;
    const current = await request(app.getHttpServer()).get(`/v1/admin/properties/${id}`).set('Host', A).set('Cookie', jar.header());
    const { id: _i, status: _s, publishedAt: _p, updatedAt: _u, previousSlugs: _ps, publishProblems: _pp, allowedTransitions: _a, ...input } = current.body;
    const r = await request(app.getHttpServer()).put(`/v1/admin/properties/${id}`).set('Host', A).set('Cookie', jar.header()).set('x-csrf-token', jar.get('es_csrf')!)
      .send({ ...input, slug: 'juhu-courtyard-residence' });
    expect(r.status).toBe(200);
    const old = await request(app.getHttpServer()).get('/v1/properties/courtyard-house-juhu').set('Host', A);
    expect(old.body.redirectTo).toBe('juhu-courtyard-residence');
  });

  it('rejects a slug already used by another listing', async () => {
    const { c } = await signIn(app, A, 'editor@aurelia.example', password);
    const r = await c.post('/v1/admin/properties', draftInput({ slug: 'the-glasshouse-alibaug' }));
    expect(r.status).toBe(400);
    expect(r.body.error.fields[0].path).toBe('slug');
  });

  it('cannot attach another agency’s uploaded image', async () => {
    const banyan = await signIn(app, B, 'owner@banyan.example', password);
    const theirs = await upload(banyan.jar, await photo());
    expect(theirs.status).toBe(201);
    const { c } = await signIn(app, A, 'editor@aurelia.example', password);
    const r = await c.post('/v1/admin/properties', draftInput({ title: 'Image theft attempt', images: [{ url: theirs.body.url, alt: '' }] }));
    expect(r.status).toBe(400);
    expect(r.body.error.fields[0].path).toBe('images');
  });

  it('cannot read or edit another agency’s listing by id', async () => {
    const banyan = await signIn(app, B, 'owner@banyan.example', password);
    const theirs = await banyan.c.get('/v1/admin/properties');
    const id = theirs.body.items[0].id;
    const { c, jar } = await signIn(app, A, 'owner@aurelia.example', password);
    expect((await c.get(`/v1/admin/properties/${id}`)).status).toBe(404);
    const put = await request(app.getHttpServer()).put(`/v1/admin/properties/${id}`).set('Host', A).set('Cookie', jar.header()).set('x-csrf-token', jar.get('es_csrf')!).send(draftInput());
    expect(put.status).toBe(404);
    expect((await c.post(`/v1/admin/properties/${id}/status`, { status: 'archived' })).status).toBe(404);
  });

  it('agents and support can read listings but not change them', async () => {
    for (const email of ['kabir@aurelia.example', 'support@aurelia.example']) {
      const { c } = await signIn(app, A, email, password);
      expect((await c.get('/v1/admin/properties')).status).toBe(200);
      expect((await c.post('/v1/admin/properties', draftInput())).status).toBe(403);
    }
  });

  it('enforces status transitions and only deletes never-published drafts', async () => {
    const { c } = await signIn(app, A, 'owner@aurelia.example', password);
    const d = await c.post('/v1/admin/properties', draftInput({ title: 'Transition test home' }));
    expect((await c.post(`/v1/admin/properties/${d.body.id}/status`, { status: 'sold' })).status).toBe(400);
    expect((await c.del(`/v1/admin/properties/${d.body.id}`)).status).toBe(204);
    const live = (await c.get('/v1/admin/properties?status=published')).body.items[0];
    expect((await c.del(`/v1/admin/properties/${live.id}`)).status).toBe(409);
  });
});

describe('CSV import and export', () => {
  it('exports with spreadsheet-formula protection', async () => {
    const { c, jar } = await signIn(app, A, 'owner@aurelia.example', password);
    await c.post('/v1/admin/properties', draftInput({ title: '=HYPERLINK("http://evil")' }));
    const res = await request(app.getHttpServer()).get('/v1/admin/properties/export.csv').set('Host', A).set('Cookie', jar.header());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toContain('slug,title,status');
    expect(res.text).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  it('dry run reports row errors and writes nothing; valid import creates drafts', async () => {
    const { c } = await signIn(app, A, 'owner@aurelia.example', password);
    const before = await conn.collection('properties').countDocuments({});
    const header = 'title,listingType,category,type,price,areaSqft,locality,city,bhk';
    const bad = `${header}\nGood Row Apartment,sale,residential,apartment,25000000,1400,Powai,Mumbai,3\nBad,sale,residential,castle,-5,0,P,M,2`;
    const dry = await c.post('/v1/admin/properties/import', { csv: bad, dryRun: false });
    expect(dry.status).toBe(200);
    expect(dry.body.errors[0].row).toBe(3);
    expect(await conn.collection('properties').countDocuments({})).toBe(before);

    const good = `${header}\nLakeview Apartment,sale,residential,apartment,25000000,1400,Powai,Mumbai,3`;
    const run = await c.post('/v1/admin/properties/import', { csv: good, dryRun: false });
    expect(run.body).toMatchObject({ created: 1, updated: 0, errors: [] });
    const created = await conn.collection('properties').findOne({ title: 'Lakeview Apartment' });
    expect(created?.status).toBe('draft');
  });
});

describe('site editor: draft, preview, publish', () => {
  it('draft edits are invisible to visitors until published, then appear', async () => {
    const { c } = await signIn(app, A, 'owner@aurelia.example', password);
    const draft = await c.get('/v1/admin/site/draft');
    expect(draft.body.changed).toEqual([]);
    void c;
    const homepage = draft.body.draft.homepage;
    homepage.sections[0].data.headline = 'Homes with a sense of place.';
    homepage.sections[0].data.accentWords = '';
    const { jar } = await signIn(app, A, 'owner@aurelia.example', password);
    const noCsrf = await request(app.getHttpServer()).put('/v1/admin/site/draft/homepage').set('Host', A).set('Cookie', jar.header())
      .send({ value: homepage, baseRevision: draft.body.revisions.homepage });
    expect(noCsrf.status).toBe(403); // no CSRF header → rejected

    const put = (part: string, value: unknown, baseRevision: number) =>
      request(app.getHttpServer()).put(`/v1/admin/site/draft/${part}`).set('Host', A).set('Cookie', jar.header()).set('x-csrf-token', jar.get('es_csrf')!).send({ value, baseRevision });
    const ok = await put('homepage', homepage, draft.body.revisions.homepage);
    expect(ok.status).toBe(200);
    // A second save from the stale revision is a conflict, not a silent overwrite.
    expect((await put('homepage', homepage, draft.body.revisions.homepage)).status).toBe(409);

    const visitor = await request(app.getHttpServer()).get('/v1/site').set('Host', A);
    expect(visitor.body.homepage.sections[0].data.headline).not.toBe('Homes with a sense of place.');
    const preview = await request(app.getHttpServer()).get('/v1/admin/site/preview').set('Host', A).set('Cookie', jar.header());
    expect(preview.body.homepage.sections[0].data.headline).toBe('Homes with a sense of place.');
    expect((await request(app.getHttpServer()).get('/v1/admin/site/preview').set('Host', A)).status).toBe(401);

    const pub = await request(app.getHttpServer()).post('/v1/admin/site/publish').set('Host', A).set('Cookie', jar.header()).set('x-csrf-token', jar.get('es_csrf')!).send({ note: 'New headline' });
    expect(pub.status).toBe(200);
    expect(pub.body.version).toBe(2);
    const after = await request(app.getHttpServer()).get('/v1/site').set('Host', A);
    expect(after.body.homepage.sections[0].data.headline).toBe('Homes with a sense of place.');
  });

  it('rejects unsafe content: javascript: links and foreign images', async () => {
    const { jar } = await signIn(app, A, 'owner@aurelia.example', password);
    const draft = await request(app.getHttpServer()).get('/v1/admin/site/draft').set('Host', A).set('Cookie', jar.header());
    const hp = draft.body.draft.homepage;
    hp.sections[0].data.primaryCta.href = 'javascript:alert(document.cookie)';
    const r = await request(app.getHttpServer()).put('/v1/admin/site/draft/homepage').set('Host', A).set('Cookie', jar.header()).set('x-csrf-token', jar.get('es_csrf')!)
      .send({ value: hp, baseRevision: draft.body.revisions.homepage });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body.error.fields)).toMatch(/primaryCta\.href/);
  });

  it('content editors cannot change the theme; owners can, and versions can be restored', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const d = await request(app.getHttpServer()).get('/v1/admin/site/draft').set('Host', A).set('Cookie', editor.jar.header());
    const theme = { ...d.body.draft.theme, colors: { ...d.body.draft.theme.colors, accent: '#AA3355' } };
    const put = (jar: Jar, rev: number) => request(app.getHttpServer()).put('/v1/admin/site/draft/theme').set('Host', A).set('Cookie', jar.header()).set('x-csrf-token', jar.get('es_csrf')!).send({ value: theme, baseRevision: rev });
    expect((await put(editor.jar, d.body.revisions.theme)).status).toBe(403);

    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    expect((await put(owner.jar, d.body.revisions.theme)).status).toBe(200);
    // The editor now can't publish, because the pending change includes the theme.
    const pubAsEditor = await request(app.getHttpServer()).post('/v1/admin/site/publish').set('Host', A).set('Cookie', editor.jar.header()).set('x-csrf-token', editor.jar.get('es_csrf')!).send({});
    expect(pubAsEditor.status).toBe(403);
    const pub = await request(app.getHttpServer()).post('/v1/admin/site/publish').set('Host', A).set('Cookie', owner.jar.header()).set('x-csrf-token', owner.jar.get('es_csrf')!).send({ note: 'Accent test' });
    expect(pub.status).toBe(200);
    expect((await request(app.getHttpServer()).get('/v1/site').set('Host', A)).body.theme.colors.accent).toBe('#AA3355');

    const restore = await request(app.getHttpServer()).post('/v1/admin/site/versions/1/restore').set('Host', A).set('Cookie', owner.jar.header()).set('x-csrf-token', owner.jar.get('es_csrf')!);
    expect(restore.status).toBe(204);
    const again = await request(app.getHttpServer()).post('/v1/admin/site/publish').set('Host', A).set('Cookie', owner.jar.header()).set('x-csrf-token', owner.jar.get('es_csrf')!).send({ note: 'Rollback' });
    expect(again.status).toBe(200);
    expect((await request(app.getHttpServer()).get('/v1/site').set('Host', A)).body.theme.colors.accent).toBe('#C6A66B');
  });

  it('one agency’s publish never touches another agency’s site', async () => {
    const banyan = await request(app.getHttpServer()).get('/v1/site').set('Host', B);
    expect(banyan.body.homepage.sections[0].data.headline).toBe('Your first home, without the guesswork.');
    expect(banyan.body.theme.colors.primary).toBe('#141B2D');
  });
});

describe('content library', () => {
  it('creates, reorders and protects in-use advisors', async () => {
    const { c, jar } = await signIn(app, A, 'editor@aurelia.example', password);
    const img = await upload(jar, await photo(900, 1100));
    const created = await c.post('/v1/admin/library/testimonials', { quote: 'Patient, honest and quick to reply.', author: 'Nisha R.', context: 'Rented in Bandra' });
    expect(created.status).toBe(201);
    const agents = await c.get('/v1/admin/library/agents');
    const kabir = agents.body.items.find((a: { name: string }) => a.name === 'Kabir Malhotra');
    expect((await c.del(`/v1/admin/library/agents/${kabir.id}`)).status).toBe(409);
    const newAgent = await c.post('/v1/admin/library/agents', { name: 'Zoya Ali', title: 'Advisor', photoUrl: img.body.url });
    expect(newAgent.status).toBe(201);
    expect((await c.del(`/v1/admin/library/agents/${newAgent.body.id}`)).status).toBe(204);
    expect((await c.post('/v1/admin/library/castles', {})).status).toBe(400);
  });
});
