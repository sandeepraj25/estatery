import 'reflect-metadata';
import mongoose, { type Connection, Types } from 'mongoose';
import { homepageSchema, siteSettingsSchema, THEME_PRESETS, type Homepage, type SiteSettings, type ThemeTokens } from '@estatery/shared';
import { loadEnv } from '../config/env.js';
import { LeadActivitySchema, LeadReminderSchema, LeadSchema } from '../modules/leads/lead.schema.js';
import { PropertySchema } from '../modules/properties/property.schema.js';
import {
  AgentSchema, ArticleSchema, LocationSchema, PageSchema, ProjectSchema, SiteVersionSchema, TestimonialSchema, ThemeSchema,
} from '../modules/site/site.schemas.js';
import { MediaSchema } from '../modules/media/media.schema.js';
import { DomainSchema, TenantSchema } from '../modules/tenants/tenant.schemas.js';
import { AuditLogSchema } from '../modules/audit/audit.schema.js';
import { BillingEventSchema, BillingPaymentSchema, BillingPlanSchema, BillingSimSubscriptionSchema } from '../modules/billing/billing.schemas.js';
import { PLAN_CODES, PLANS, BILLING_INTERVALS } from '@estatery/shared';
import { InviteSchema, MembershipSchema, PasswordResetSchema, SessionSchema, UserSchema } from '../modules/auth/auth.schemas.js';
import { hash } from '@node-rs/argon2';
import { defaultPages } from '../modules/admin/site-defaults.js';
import { readingMinutes, sitePagesSchema, type SitePages } from '@estatery/shared';
import {
  AURELIA_PROPERTIES, BANYAN_PROPERTIES, CR, IMG, PORTRAITS, aureliaHomepage, aureliaSettings, banyanHomepage, banyanSettings, img,
  type SeedProperty,
} from './seed-data.js';

const DAY = 86_400_000;

/** Plain paragraphs separated by blank lines. Rendered as text, never as HTML. */
const ARTICLE_BODIES: Record<string, string> = {
  'mumbai-luxury-market-2026': [
    '## Demand is still outrunning supply',
    'Demand for homes above ₹10 crore in Mumbai kept rising through 2026, led by founders, senior professionals and returning NRIs. Supply has not kept pace: new sea-facing launches in Worli and Prabhadevi were largely absorbed before construction began.',
    '## What it means for buyers',
    'For buyers, that means two things. First, the best inventory increasingly trades privately, before it is listed. Second, negotiation room on ready homes has narrowed, while under-construction projects still offer pricing and payment-plan flexibility.',
    '- The best inventory increasingly trades privately, before it is listed\n- Negotiation room on ready homes has narrowed\n- Under-construction projects still offer pricing and payment-plan flexibility',
    '## Our advice',
    'If you are planning a purchase in the next twelve months, decide early whether possession timing or price matters more to you. That single choice narrows the field faster than any filter. [Browse current Mumbai listings](/properties?city=Mumbai) or [speak to an advisor](/contact).',
  ].join('\n\n'),
  'buying-second-home-goa': [
    '## Start with the land',
    'Goa rewards patient buyers. Before falling for a view, confirm the land use: many beautiful plots and villas sit on land that is not converted for residential use, which limits resale and financing.',
    '## Documents to ask for',
    '1. The conversion sanad for the land\n2. A 30-year title search report\n3. The occupancy certificate\n4. For managed communities, the maintenance agreement',
    'Ask for the conversion sanad, a 30-year title search and the occupancy certificate. For villas in a managed community, review the maintenance agreement and the rental programme terms if you plan to let the home.',
    '## Renting it out',
    'Gross rental yields for well-run villas in North Goa typically land between 3% and 5%, with strong seasonality. Budget for a property manager; the difference in occupancy usually pays for the fee.',
  ].join('\n\n'),
  'nri-home-buying-guide': [
    '## What you can buy',
    'Non-resident Indians can buy residential and commercial property in India without RBI approval, but not agricultural land, plantations or farmhouses. Payments must come through normal banking channels — an NRE, NRO or FCNR account.',
    '## Taxes and paperwork',
    'Buyers must deduct TDS when purchasing from an NRI seller, and NRI sellers should plan for capital gains tax before repatriating proceeds. A registered power of attorney lets a trusted person complete the registration if you cannot travel.',
    '## Before you sell later',
    'Keep every payment receipt and the sale deed together: you will need them to repatriate sale proceeds later.',
  ].join('\n\n'),
};

/** Page content per demo agency, starting from the defaults every new agency gets. */
function seedPages(slug: string, settings: SiteSettings): SitePages {
  const p = defaultPages(settings);
  if (slug === 'aurelia') {
    p.about.intro = 'Private real estate advisory for exceptional homes across Mumbai, Goa, Bengaluru and the NCR.';
    p.about.image = img(IMG.villaGlass, 1800);
    p.about.highlights = [
      { value: '18 yrs', label: 'Advising families and family offices' },
      { value: '₹2,400 Cr', label: 'In homes bought and sold for clients' },
      { value: '5 cities', label: 'With advisors on the ground' },
      { value: '1:1', label: 'One advisor from first visit to handover' },
    ];
    p.about.body = [
      '## Who we are',
      'Aurelia Estates began in 2008 as a two-person advisory in Lower Parel, helping a handful of families buy sea-facing homes without the noise of the open market. Today our advisors work across Mumbai, Goa, Bengaluru, Alibaug and Gurugram, but the idea is the same: fewer, better options and honest advice.',
      '## How we work',
      '- **We visit everything first.** Every home on our website has been walked through by an advisor, and every price is checked against recent registered sales.',
      '- **We check the paperwork early.** Title, approvals and society NOCs are reviewed before you make an offer, not after.',
      '- **We are discreet.** Many of our best homes are never advertised. Tell us what you need and we will tell you what exists.',
      '## For NRI clients',
      'About a third of our clients live abroad. We handle video viewings, document checks, home loans and registration through a power of attorney, so you only fly in for the keys — if at all. Read our [NRI buying guide](/insights/nri-home-buying-guide).',
      '## Speak to an advisor',
      '[Tell us what you’re looking for](/contact) and an advisor will call you within one working day.',
    ].join('\n\n');
    p.contact.mapUrl = 'https://maps.app.goo.gl/lodhaPlaceLowerParel';
    p.contact.body = 'Our Lower Parel office is a short walk from Lower Parel station. Visits are by appointment so the right advisor can meet you, and **visitor parking** is available in the building.';
    p.faq.items.push(
      { question: 'Do you list off-market homes?', answer: 'Yes. Many of our sellers prefer not to advertise. Tell us what you are looking for and we will share suitable off-market homes privately, after a short call.' },
      { question: 'Which cities do you cover?', answer: 'Mumbai (including Alibaug), Goa, Bengaluru, Pune and Gurugram. For other cities we work with trusted partner agencies.' },
    );
  } else {
    p.about.intro = 'Verified apartments and builder floors across Delhi, Noida and Gurugram, with no pressure and clear charges.';
    p.about.image = img(IMG.classicHouse, 1800);
    p.about.highlights = [{ value: '14 yrs', label: 'Helping families in the NCR' }, { value: '0', label: 'Hidden charges, ever' }];
    p.about.showTestimonials = true;
    p.faq.items = p.faq.items.slice(0, 4);
  }
  return sitePagesSchema.parse(p);
}

function models(conn: Connection) {
  // Typed as Model<any>: seed code is validated by the shared Zod schemas instead, and fully-inferred
  // mongoose generics here make the type checker extremely slow.
  const m = (name: string, schema: mongoose.Schema): mongoose.Model<any> =>
    (conn.models[name] as mongoose.Model<any> | undefined) ?? (conn.model(name, schema) as unknown as mongoose.Model<any>);
  return {
    Tenant: m('Tenant', TenantSchema), Domain: m('Domain', DomainSchema), Property: m('Property', PropertySchema),
    Agent: m('Agent', AgentSchema), Project: m('Project', ProjectSchema), Location: m('Location', LocationSchema),
    Testimonial: m('Testimonial', TestimonialSchema), Article: m('Article', ArticleSchema), Theme: m('Theme', ThemeSchema),
    Page: m('Page', PageSchema), Lead: m('Lead', LeadSchema),
    User: m('User', UserSchema), Membership: m('Membership', MembershipSchema), Session: m('Session', SessionSchema),
    Invite: m('Invite', InviteSchema), SiteVersion: m('SiteVersion', SiteVersionSchema), Media: m('Media', MediaSchema), LeadActivity: m('LeadActivity', LeadActivitySchema), LeadReminder: m('LeadReminder', LeadReminderSchema), PasswordReset: m('PasswordReset', PasswordResetSchema), AuditLog: m('AuditLog', AuditLogSchema),
    BillingPlan: m('BillingPlan', BillingPlanSchema), BillingEvent: m('BillingEvent', BillingEventSchema), BillingPayment: m('BillingPayment', BillingPaymentSchema),
    BillingSimSubscription: m('BillingSimSubscription', BillingSimSubscriptionSchema),
  };
}

interface TenantSeed {
  slug: string;
  name: string;
  hostnames: string[];
  settings: SiteSettings;
  theme: ThemeTokens;
  homepage: Homepage;
  properties: SeedProperty[];
  agents: Array<{ name: string; title: string; specialities: string[]; languages: string[]; years: number }>;
  withEditorial: boolean;
}

async function seedTenant(conn: Connection, t: TenantSeed) {
  const M = models(conn);
  // Validate exactly like the admin panel will, so seed data can never be "special".
  const settings = siteSettingsSchema.parse(t.settings);
  const homepage = homepageSchema.parse(t.homepage);

  const tenant = await M.Tenant.create({ slug: t.slug, name: t.name, status: 'active', settings });
  const tenantId = tenant._id as Types.ObjectId;
  await M.Domain.insertMany(
    t.hostnames.map((hostname, i) => ({ hostname, tenantId, kind: 'platform', verified: true, status: 'verified', verifiedAt: new Date(), isPrimary: i === 0 })),
  );
  await M.Theme.create({ tenantId, draft: t.theme, published: t.theme });
  await M.Page.create({ tenantId, key: 'home', draft: homepage, published: homepage });
  const pages = seedPages(t.slug, settings);
  await M.Page.create({ tenantId, key: 'pages', draft: pages, published: pages });
  await M.SiteVersion.create({ tenantId, version: 1, snapshot: { settings, theme: t.theme, homepage, pages }, note: 'Initial site', publishedByName: 'Setup', changed: ['settings', 'theme', 'homepage'] });

  const agents = await M.Agent.insertMany(
    t.agents.map((a, i) => ({
      tenantId, name: a.name, title: a.title, specialities: a.specialities, languages: a.languages, yearsExperience: a.years,
      photoUrl: img(PORTRAITS[i % PORTRAITS.length]!, 800),
      phone: settings.contact.phone, email: `${a.name.split(' ')[0]!.toLowerCase()}@${t.slug}.example`, order: i,
    })),
  );

  const projectDefs = t.withEditorial
    ? [
        { name: 'Aurelia Sea Crest', slug: 'aurelia-sea-crest', developer: 'Aurelia Developments with Studio Kohler', city: 'Mumbai', locality: 'Worli', status: 'under-construction', possession: 'Dec 2028', startingPrice: 11.5 * CR, configurations: '3, 4 & 5 BHK residences', image: img(IMG.tower, 1600), summary: 'A 58-storey sea-facing tower with only two residences per floor.', featured: true },
        { name: 'The Groves', slug: 'aurelia-the-groves', developer: 'Greenline Habitats', city: 'Bengaluru', locality: 'Whitefield', status: 'ready-to-move', possession: 'Ready to move', startingPrice: 4.25 * CR, configurations: '4 BHK villas', image: img(IMG.suburban, 1400), summary: 'Forty-two garden villas around a ten-acre central forest.', featured: true },
        { name: 'Casa Vagator', slug: 'casa-vagator', developer: 'Coastline Living', city: 'Goa', locality: 'Vagator', status: 'pre-launch', possession: 'Mar 2028', startingPrice: 7.8 * CR, configurations: '3 & 4 BHK pool villas', image: img(IMG.resortVilla, 1400), summary: 'Twelve hillside pool villas overlooking the Chapora river.', featured: false },
      ]
    : [];
  const projects = projectDefs.length ? await M.Project.insertMany(projectDefs.map((p, i) => ({ ...p, tenantId, order: i }))) : [];
  const projectBySlug = new Map(projects.map((p: any) => [p.slug, p._id]));

  const now = Date.now();
  const properties = await M.Property.insertMany(
    t.properties.map((p) => ({
      tenantId, slug: p.slug, title: p.title, summary: p.summary, description: p.description,
      listingType: p.listingType, category: p.category, type: p.type, status: p.status,
      price: p.price, priceUnit: p.priceUnit ?? 'total', currency: 'INR', bhk: p.bhk, bathrooms: p.bathrooms, areaSqft: p.areaSqft,
      location: { locality: p.locality, city: p.city, state: p.state, lat: p.lat, lng: p.lng },
      amenities: p.amenities,
      images: p.images.map((k, i) => ({ url: img(IMG[k]), alt: `${p.title} — view ${i + 1}` })),
      featured: !!p.featured, verified: !!p.verified,
      projectId: p.project ? (projectBySlug.get(p.project) ?? null) : null,
      agentId: agents[p.agent % agents.length]!._id,
      publishedAt: p.status === 'draft' ? null : new Date(now - p.daysAgo * DAY),
    })),
  );

  if (t.withEditorial) {
    await M.Location.insertMany([
      { name: 'Mumbai', city: 'Mumbai', slug: 'mumbai', image: img(IMG.mumbai, 1400), blurb: 'Sea-facing towers, Art Deco classics and the city’s best addresses.' },
      { name: 'Goa', city: 'Goa', slug: 'goa', image: img(IMG.goa, 1200), blurb: 'Portuguese villas, hillside retreats and slow coastal living.' },
      { name: 'Bengaluru', city: 'Bengaluru', slug: 'bengaluru', image: img(IMG.bengaluru, 1200), blurb: 'Garden homes in the city’s greenest neighbourhoods.' },
      { name: 'Gurugram', city: 'Gurugram', slug: 'gurugram', image: img(IMG.delhi, 1200), blurb: 'Golf-course residences and Grade-A offices.' },
      { name: 'Alibaug', city: 'Alibaug', slug: 'alibaug', image: img(IMG.villaGlass, 1200), blurb: 'Weekend estates an hour from South Mumbai by sea.' },
    ].map((l, i) => ({ ...l, tenantId, order: i })));

    await M.Article.insertMany([
      { title: 'Mumbai luxury market: what changed in 2026', slug: 'mumbai-luxury-market-2026', excerpt: 'Sea-facing inventory is tightening while ticket sizes keep climbing. Here is what that means for buyers this year.', category: 'Market Report', image: img(IMG.mumbai, 1200), readMinutes: 7 },
      { title: 'Buying a second home in Goa: a practical guide', slug: 'buying-second-home-goa', excerpt: 'Title checks, conversion sanad, rental yields and the questions to ask before you sign.', category: 'Buyer’s Guide', image: img(IMG.goa, 1200), readMinutes: 9 },
      { title: 'NRI home buying: taxes, repatriation and POA', slug: 'nri-home-buying-guide', excerpt: 'A clear walkthrough of FEMA rules, TDS and how to buy confidently from abroad.', category: 'Guide', image: img(IMG.livingLight, 1200), readMinutes: 6 },
    ].map((a, i) => {
      const body = ARTICLE_BODIES[a.slug] ?? a.excerpt;
      return { ...a, tenantId, status: 'published', publishedAt: new Date(now - (i * 9 + 2) * DAY), body, readMinutes: readingMinutes(body), imageAlt: `${a.title} — cover image`, authorId: agents[i % agents.length]!._id };
    }));
  }

  await M.Testimonial.insertMany(
    (t.withEditorial
      ? [
          { quote: 'They showed us six homes, not sixty. The fourth one was the one — and they knew it before we did.', author: 'Ananya & Rohan Mehta', context: 'Bought a villa in Alibaug' },
          { quote: 'Buying from Singapore felt impossible until Aurelia handled the diligence, the POA and the handover. Flawless.', author: 'Vikram Iyer', context: 'NRI buyer, Worli penthouse' },
          { quote: 'Discreet, patient and genuinely honest about what was overpriced. Rare in this market.', author: 'Meera Kapoor', context: 'Sold a family home in Bengaluru' },
        ]
      : [
          { quote: 'Banyan helped us find our first flat near the metro within our budget. No pressure, ever.', author: 'Priya & Arjun Sethi', context: 'First-time buyers, Noida' },
          { quote: 'Transparent on every charge. The registration day went exactly as planned.', author: 'Rahul Verma', context: 'Bought in Dwarka' },
        ]
    ).map((x, i) => ({ ...x, tenantId, order: i, rating: 5 })),
  );

  return { tenantId, agents: agents.map((a: any) => a._id as Types.ObjectId), properties: properties as any[] };
}

/** Demo password for every seeded login. Override with SEED_PASSWORD. Development only. */
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Estatery-demo-2026';

async function seedPeople(
  conn: Connection,
  aurelia: Awaited<ReturnType<typeof seedTenant>>,
  banyan: Awaited<ReturnType<typeof seedTenant>>,
) {
  const M = models(conn);
  // Lower-cost argon2 for seed speed; real passwords use AuthService parameters.
  const passwordHash = await hash(SEED_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const people = [
    { email: 'platform@estatery.example', name: 'Riya Kapoor', platformOwner: true, memberships: [{ t: aurelia, role: 'owner' }] },
    { email: 'owner@aurelia.example', name: 'Vikram Sethi', memberships: [{ t: aurelia, role: 'owner' }] },
    { email: 'admin@aurelia.example', name: 'Anika Bose', memberships: [{ t: aurelia, role: 'admin' }] },
    { email: 'manager@aurelia.example', name: 'Dev Menon', memberships: [{ t: aurelia, role: 'manager' }] },
    { email: 'editor@aurelia.example', name: 'Tara Pillai', memberships: [{ t: aurelia, role: 'editor' }] },
    { email: 'support@aurelia.example', name: 'Neil D’Souza', memberships: [{ t: aurelia, role: 'support' }] },
    { email: 'kabir@aurelia.example', name: 'Kabir Malhotra', memberships: [{ t: aurelia, role: 'agent', agent: 0 }] },
    { email: 'isha@aurelia.example', name: 'Isha Raman', memberships: [{ t: aurelia, role: 'agent', agent: 1 }] },
    { email: 'owner@banyan.example', name: 'Sanjay Bhatia', memberships: [{ t: banyan, role: 'owner', agent: 0 }] },
  ] as const;
  for (const p of people) {
    const user = await M.User.create({ email: p.email, name: p.name, passwordHash, platformOwner: 'platformOwner' in p && p.platformOwner });
    for (const m of p.memberships) {
      await M.Membership.create({
        tenantId: m.t.tenantId, userId: user._id, role: m.role,
        agentId: 'agent' in m ? m.t.agents[m.agent as number] : null,
      });
    }
  }

  // Realistic enquiries spread across advisors and pipeline stages.
  const day = (d: number) => new Date(Date.now() + d * DAY);
  const iso = (d: number) => day(d).toISOString().slice(0, 10);
  const byAgent = (i: number) => aurelia.properties.filter((p: any) => p.agentId?.equals(aurelia.agents[i]) && p.status === 'published');
  const pick = (i: number, n = 0) => byAgent(i)[n] ?? byAgent(i)[0];
  const leads = [
    { name: 'Rohan Gupta', email: 'rohan.g@example.com', phone: '+91 98201 11223', intent: 'site-visit', status: 'new', p: pick(0), preferredDate: iso(3), ago: 0.2, message: 'Would like to see the estate this weekend with my family.' },
    { name: 'Sneha Iyer', email: 'sneha.iyer@example.com', phone: '+91 99300 44556', intent: 'enquiry', status: 'new', p: pick(1), ago: 0.6, message: 'Is the price negotiable for a quick close?' },
    { name: 'Arjun Nair', email: 'arjun.nair@example.com', phone: '+91 98450 77889', intent: 'callback', status: 'contacted', p: pick(3), ago: 1.5, message: '' },
    { name: 'Farah Khan', email: 'farah.k@example.com', phone: '+91 98111 22334', intent: 'site-visit', status: 'site-visit', p: pick(1, 1), preferredDate: iso(5), ago: 2, message: 'Weekday evening works best.' },
    { name: 'Michael D’Costa', email: 'michael.dc@example.com', phone: '+971 50 123 4567', intent: 'enquiry', status: 'qualified', p: pick(2), ago: 4, message: 'NRI buyer, based in Dubai. Need help with POA.' },
    { name: 'Pooja Shah', email: 'pooja.shah@example.com', phone: '+91 98200 99887', intent: 'general', status: 'negotiation', p: null, ago: 7, budget: '₹10 – 25 Cr', message: 'Looking for a sea-facing 4 BHK in Worli or Prabhadevi.' },
    { name: 'Karan Mehra', email: 'karan.m@example.com', phone: '+91 98765 10101', intent: 'enquiry', status: 'won', p: pick(4), ago: 21, message: '' },
    { name: 'Lata Krishnan', email: 'lata.k@example.com', phone: '+91 94440 55667', intent: 'callback', status: 'lost', p: pick(3, 1), ago: 26, message: 'Chose a home closer to school.' },
  ];
  await M.Lead.insertMany(
    leads.map((l) => ({
      tenantId: aurelia.tenantId, name: l.name, email: l.email, phone: l.phone, message: l.message, intent: l.intent, status: l.status,
      propertyId: l.p?._id ?? null, agentId: l.p?.agentId ?? aurelia.agents[1], preferredDate: l.preferredDate ?? null,
      budget: l.budget ?? null, source: l.p ? 'property-page' : 'homepage', consentAt: day(-l.ago), createdAt: day(-l.ago), updatedAt: day(-l.ago),
    })),
    { timestamps: false }, // keep the backdated createdAt values
  );
  // Timelines and a couple of follow-ups so the CRM looks lived-in.
  const seeded = await M.Lead.find({ tenantId: aurelia.tenantId }).lean<any[]>();
  const users = await M.User.find({}, { email: 1, name: 1 }).lean<any[]>();
  const byEmail = new Map(users.map((u: any) => [u.email, u]));
  const kabir = byEmail.get('kabir@aurelia.example');
  const isha = byEmail.get('isha@aurelia.example');
  const dev = byEmail.get('manager@aurelia.example');
  const acts: any[] = [];
  for (const l of seeded) {
    acts.push({ tenantId: aurelia.tenantId, leadId: l._id, type: 'created', actorName: l.name, body: l.message ?? '', meta: { source: l.source, intent: l.intent }, createdAt: l.createdAt });
    if (l.status !== 'new') {
      acts.push({ tenantId: aurelia.tenantId, leadId: l._id, type: 'call', actorId: dev._id, actorName: dev.name, body: 'Introductory call. Shared two similar options on WhatsApp.', createdAt: new Date(new Date(l.createdAt).getTime() + 3 * 3600_000) });
      acts.push({ tenantId: aurelia.tenantId, leadId: l._id, type: 'status', actorId: dev._id, actorName: dev.name, body: l.status === 'lost' ? 'Chose a home closer to school.' : '', meta: { from: 'new', to: l.status }, createdAt: new Date(new Date(l.createdAt).getTime() + 3.2 * 3600_000) });
    }
  }
  await M.LeadActivity.insertMany(acts, { timestamps: false } as any);
  for (const l of seeded.filter((x: any) => x.status !== 'new')) {
    await M.Lead.updateOne({ tenantId: aurelia.tenantId, _id: l._id }, { $set: { firstContactedAt: l.createdAt, lastActivityAt: l.createdAt } });
  }
  await M.Lead.updateMany({ tenantId: aurelia.tenantId, status: { $in: ['won', 'lost'] } }, { $set: { closedAt: new Date() } });
  const rohan = seeded.find((l: any) => l.name === 'Rohan Gupta');
  const farah = seeded.find((l: any) => l.name === 'Farah Khan');
  await M.LeadReminder.insertMany([
    { tenantId: aurelia.tenantId, leadId: rohan._id, assigneeId: kabir._id, createdBy: dev._id, dueAt: new Date(Date.now() + 2 * 3600_000), note: 'Confirm Saturday visit time and send the location pin' },
    { tenantId: aurelia.tenantId, leadId: farah._id, assigneeId: isha._id, createdBy: dev._id, dueAt: new Date(Date.now() - 3600_000), note: 'Share the society NOC and maintenance details' },
  ]);
}

/**
 * Billing demo (payment simulator plan ids): Aurelia pays monthly for Signature with three receipts;
 * Banyan is on the free trial, which ends in three days.
 */
async function seedBilling(conn: Connection, aureliaId: Types.ObjectId, banyanId: Types.ObjectId) {
  const M = models(conn);
  for (const code of PLAN_CODES) {
    for (const interval of BILLING_INTERVALS) {
      await M.BillingPlan.create({ code, interval, amount: PLANS[code].price[interval], mode: 'test', keyId: 'simulator', razorpayPlanId: `plan_sim${code}${interval}` });
    }
  }
  const s = (d: Date) => Math.floor(d.getTime() / 1000);
  const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };
  const periodStart = new Date(Date.now() - 12 * DAY);
  const periodEnd = addMonths(periodStart, 1);
  const subId = 'sub_simAureliaDemo1';
  await M.BillingSimSubscription.create({
    subId,
    entity: {
      id: subId, plan_id: 'plan_simsignaturemonthly', status: 'active', current_start: s(periodStart), current_end: s(periodEnd), start_at: s(addMonths(periodStart, -2)),
      charge_at: s(periodEnd), paid_count: 3, remaining_count: 117, customer_id: 'cust_simAurelia01', short_url: null, has_scheduled_changes: false, notes: { tenantId: aureliaId.toString(), plan: 'signature', interval: 'monthly' },
    },
  });
  await M.Tenant.updateOne({ _id: aureliaId }, {
    $set: {
      billing: {
        plan: 'signature', interval: 'monthly', status: 'active', trialEndsAt: addMonths(periodStart, -2), paidThrough: periodEnd, cancelAtPeriodEnd: false,
        haltedAt: null, compPlan: null, compUntil: null, scheduledPlan: null, scheduledInterval: null, subscriptionId: subId, customerId: 'cust_simAurelia01',
        lastEventAt: s(periodStart), checkout: { subscriptionId: null, plan: null, interval: null, createdAt: null }, notices: { trialEnding: null },
      },
    },
  });
  await M.BillingPayment.insertMany([0, 1, 2].map((i) => {
    const start = addMonths(periodStart, -i);
    return {
      tenantId: aureliaId, paymentId: `pay_simAureliaDemo${i}`, subscriptionId: subId, amount: PLANS.signature.price.monthly, status: 'captured', method: i === 2 ? 'upi' : 'card',
      plan: 'signature', interval: 'monthly', periodStart: start, periodEnd: addMonths(start, 1), invoiceId: null, invoiceUrl: null, paidAt: start,
    };
  }));
  await M.Tenant.updateOne({ _id: banyanId }, {
    $set: {
      billing: {
        plan: null, interval: null, status: 'none', trialEndsAt: new Date(Date.now() + 3 * DAY), paidThrough: null, cancelAtPeriodEnd: false,
        haltedAt: null, compPlan: null, compUntil: null, scheduledPlan: null, scheduledInterval: null, subscriptionId: null, customerId: null,
        lastEventAt: 0, checkout: { subscriptionId: null, plan: null, interval: null, createdAt: null }, notices: { trialEnding: null },
      },
    },
  });
}

export async function seedDatabase(conn: Connection, opts: { extraHosts?: string[] } = {}) {
  await conn.dropDatabase();
  const M = models(conn);
  // Build indexes up front. A MongoDB-compatible engine without TTL-index support (e.g. FerretDB)
  // only loses automatic cleanup of expired sessions; on MongoDB proper every index is created.
  for (const model of Object.values(M)) {
    await model.syncIndexes().catch((err: Error) => {
      if (process.env.NODE_ENV !== 'test') console.warn(`Index warning on ${model.modelName}: ${err.message}`);
    });
  }

  const aurelia = await seedTenant(conn, {
    slug: 'aurelia', name: 'Aurelia Estates',
    hostnames: ['aurelia.localhost', 'localhost', '127.0.0.1', ...(opts.extraHosts ?? [])],
    settings: aureliaSettings(), theme: THEME_PRESETS['forest-champagne']!.tokens, homepage: aureliaHomepage(),
    properties: AURELIA_PROPERTIES,
    agents: [
      { name: 'Kabir Malhotra', title: 'Partner · Coastal Estates', specialities: ['Alibaug', 'Commercial'], languages: ['English', 'Hindi'], years: 16 },
      { name: 'Isha Raman', title: 'Senior Advisor · South Mumbai', specialities: ['Worli', 'Bandra'], languages: ['English', 'Hindi', 'Marathi'], years: 11 },
      { name: 'Aditya Rao', title: 'Advisor · Goa & Pune', specialities: ['North Goa', 'Koregaon Park'], languages: ['English', 'Konkani'], years: 8 },
      { name: 'Naina Desai', title: 'Advisor · Bengaluru', specialities: ['Sadashivnagar', 'Whitefield'], languages: ['English', 'Kannada'], years: 9 },
      { name: 'Arjun Sinha', title: 'Advisor · NCR', specialities: ['Golf Course Road', 'DLF 5'], languages: ['English', 'Hindi', 'Punjabi'], years: 12 },
    ],
    withEditorial: true,
  });
  const banyan = await seedTenant(conn, {
    slug: 'banyan', name: 'Banyan & Co. Realty', hostnames: ['banyan.localhost'],
    settings: banyanSettings(), theme: THEME_PRESETS['midnight-terracotta']!.tokens, homepage: banyanHomepage(),
    properties: BANYAN_PROPERTIES,
    agents: [
      { name: 'Sanjay Bhatia', title: 'Founder', specialities: ['Noida'], languages: ['Hindi', 'English'], years: 14 },
      { name: 'Ritu Khanna', title: 'Advisor', specialities: ['South Delhi'], languages: ['Hindi', 'English'], years: 6 },
    ],
    withEditorial: false,
  });
  await seedPeople(conn, aurelia, banyan);
  await seedBilling(conn, aurelia.tenantId, banyan.tenantId);
  return { aurelia: aurelia.tenantId, banyan: banyan.tenantId };
}

// CLI entry point: `pnpm seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  const env = loadEnv();
  const conn = await mongoose.createConnection(env.MONGODB_URI).asPromise();
  const ids = await seedDatabase(conn);
  console.log('Seeded tenants:', { aurelia: ids.aurelia.toString(), banyan: ids.banyan.toString() });
  console.log('Open http://localhost:3000 (Aurelia) or http://banyan.localhost:3000 (Banyan).');
  console.log(`Admin: http://localhost:3000/admin  —  e.g. owner@aurelia.example / ${SEED_PASSWORD}`);
  await conn.close();
}
