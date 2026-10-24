import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import {
  homepageSchema,
  PAGE_KEYS,
  PAGE_PATHS,
  readingMinutes,
  sitePagesSchema,
  themeTokensSchema,
  type PageKey,
  type PublicArticleDetail,
  type SitemapEntry,
  type SitePages,
  type PublicAgent,
  type PublicArticle,
  type PublicLocation,
  type PublicProject,
  type PublicSiteConfig,
  type PublicTestimonial,
} from '@estatery/shared';
import type { ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { PropertiesService } from '../properties/properties.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { defaultPages } from '../admin/site-defaults.js';

@Injectable()
export class SiteService {
  private readonly logger = new Logger(SiteService.name);

  constructor(
    private readonly tenants: TenantsService,
    private readonly properties: PropertiesService,
    @InjectModel('Theme') private readonly themes: Model<any>,
    @InjectModel('Page') private readonly pages: Model<any>,
    @InjectModel('Agent') private readonly agents: Model<any>,
    @InjectModel('Project') private readonly projects: Model<any>,
    @InjectModel('Location') private readonly locations: Model<any>,
    @InjectModel('Testimonial') private readonly testimonials: Model<any>,
    @InjectModel('Article') private readonly articles: Model<any>,
    @InjectModel('Property') private readonly propertyModel: Model<any>,
    @InjectModel('Domain') private readonly domainModel: Model<any>,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async canonicalHost(tenantId: Types.ObjectId): Promise<string | null> {
    const d = await this.domainModel.findOne({ tenantId, isPrimary: true, kind: 'custom', verified: true, 'tls.status': 'active' }, { hostname: 1 }).lean<any>();
    return d?.hostname ?? null;
  }

  /** Published (never draft) theme + homepage + settings. Re-validated on read so bad data can't break rendering. */
  async getConfig(tenant: ResolvedTenant): Promise<PublicSiteConfig> {
    const [settings, theme, home, canonicalHost, removeBranding, pages] = await Promise.all([
      this.tenants.getSettings(tenant.id),
      this.themes.findOne({ tenantId: tenant.id }, { published: 1 }).lean<any>(),
      this.pages.findOne({ tenantId: tenant.id, key: 'home' }, { published: 1 }).lean<any>(),
      this.canonicalHost(tenant.id),
      this.entitlements.has(tenant.id, 'removeBranding'),
      this.publishedPages(tenant.id),
    ]);
    if (!theme || !home) throw new NotFoundException({ code: 'SITE_NOT_CONFIGURED', message: 'This site has not been set up yet.' });

    const parsedHome = homepageSchema.safeParse(home.published);
    if (!parsedHome.success) {
      this.logger.error(`Invalid published homepage for tenant ${tenant.slug}: ${parsedHome.error.message}`);
      throw new NotFoundException({ code: 'SITE_NOT_CONFIGURED', message: 'This site is being updated.' });
    }
    return {
      tenant: { id: tenant.id.toString(), slug: tenant.slug, name: tenant.name },
      canonicalHost,
      settings: removeBranding ? settings : { ...settings, showPlatformBranding: true },
      theme: themeTokensSchema.parse(theme.published),
      homepage: parsedHome.data,
      pages: Object.fromEntries(PAGE_KEYS.map((k) => [k, pages[k].enabled])) as Record<PageKey, boolean>,
    };
  }

  /** Published content pages (defaults for agencies that have never edited them). */
  async publishedPages(tenantId: Types.ObjectId): Promise<SitePages> {
    const doc = await this.pages.findOne({ tenantId, key: 'pages' }, { published: 1 }).lean<any>();
    if (doc) {
      const parsed = sitePagesSchema.safeParse(doc.published);
      if (parsed.success) return parsed.data;
      this.logger.error(`Invalid published pages for tenant ${tenantId}: ${parsed.error.message}`);
    }
    const settings = await this.tenants.getSettings(tenantId);
    return defaultPages(settings);
  }

  async getPage(tenantId: Types.ObjectId, key: PageKey) {
    const page = (await this.publishedPages(tenantId))[key];
    if (!page.enabled) throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: 'This page is not available.' });
    return page;
  }

  /** Paginated, optionally by category, for /insights. */
  async listArticles(tenantId: Types.ObjectId, q: { page: number; limit: number; category?: string }) {
    const filter: Record<string, unknown> = { tenantId, status: 'published' };
    if (q.category) filter.category = q.category;
    const [docs, total, categories] = await Promise.all([
      this.articles.find(filter, { body: 0 }).sort({ publishedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean<any[]>(),
      this.articles.countDocuments(filter),
      this.articles.distinct('category', { tenantId, status: 'published' }),
    ]);
    return {
      items: docs.map((a) => this.articleCard(a)),
      page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)),
      categories: (categories as string[]).sort((a, b) => a.localeCompare(b)),
    };
  }

  private articleCard(a: any): PublicArticle {
    return {
      id: a._id.toString(), title: a.title, slug: a.slug, excerpt: a.excerpt, category: a.category, image: a.image,
      readMinutes: a.readMinutes, publishedAt: new Date(a.publishedAt).toISOString(),
    };
  }

  /** Everything a crawler should find: live listings, articles, pages and the index pages. */
  async sitemap(tenantId: Types.ObjectId): Promise<SitemapEntry[]> {
    const [props, arts, pages, home] = await Promise.all([
      this.propertyModel.find({ tenantId, status: 'published' }, { slug: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(5000).lean<any[]>(),
      this.articles.find({ tenantId, status: 'published' }, { slug: 1, updatedAt: 1, publishedAt: 1 }).sort({ publishedAt: -1 }).limit(5000).lean<any[]>(),
      this.publishedPages(tenantId),
      this.pages.findOne({ tenantId, key: 'home' }, { publishedAt: 1, updatedAt: 1 }).lean<any>(),
    ]);
    const iso = (d: unknown) => new Date((d as Date) ?? Date.now()).toISOString();
    const newestListing = props[0]?.updatedAt ?? home?.publishedAt;
    const entries: SitemapEntry[] = [
      { path: '/', lastModified: iso(home?.publishedAt ?? home?.updatedAt), priority: 1 },
      { path: '/properties', lastModified: iso(newestListing), priority: 0.9 },
      ...props.map((p) => ({ path: `/properties/${p.slug}`, lastModified: iso(p.updatedAt), priority: 0.8 })),
    ];
    if (arts.length) entries.push({ path: '/insights', lastModified: iso(arts[0].publishedAt), priority: 0.6 });
    entries.push(...arts.map((a) => ({ path: `/insights/${a.slug}`, lastModified: iso(a.updatedAt ?? a.publishedAt), priority: 0.6 })));
    for (const k of PAGE_KEYS) {
      if (pages[k].enabled) entries.push({ path: PAGE_PATHS[k], lastModified: iso(home?.publishedAt), priority: k === 'privacy' || k === 'terms' ? 0.2 : 0.5 });
    }
    return entries;
  }

  async getLocations(tenantId: Types.ObjectId): Promise<PublicLocation[]> {
    const [locs, counts] = await Promise.all([
      this.locations.find({ tenantId }).sort({ order: 1 }).lean<any[]>(),
      this.propertyModel.aggregate<{ _id: string; n: number }>([
        { $match: { tenantId, status: 'published' } },
        { $group: { _id: '$location.city', n: { $sum: 1 } } },
      ]),
    ]);
    const byCity = new Map(counts.map((c) => [String(c._id).toLowerCase(), c.n]));
    return locs.map((l) => ({
      id: l._id.toString(),
      name: l.name,
      city: l.city,
      slug: l.slug,
      image: l.image,
      blurb: l.blurb,
      propertyCount: byCity.get(String(l.city).toLowerCase()) ?? 0,
    }));
  }

  async getProjects(tenantId: Types.ObjectId): Promise<PublicProject[]> {
    const docs = await this.projects.find({ tenantId }).sort({ featured: -1, order: 1 }).limit(8).lean<any[]>();
    return docs.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      slug: p.slug,
      developer: p.developer,
      city: p.city,
      locality: p.locality,
      status: p.status,
      possession: p.possession,
      startingPrice: p.startingPrice,
      configurations: p.configurations,
      image: p.image,
      summary: p.summary,
    }));
  }

  async getAgents(tenantId: Types.ObjectId): Promise<PublicAgent[]> {
    const docs = await this.agents.find({ tenantId, active: true }).sort({ order: 1 }).limit(8).lean<any[]>();
    return docs.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      title: a.title,
      photoUrl: a.photoUrl,
      specialities: a.specialities,
      phone: a.phone,
      email: a.email,
      languages: a.languages,
      yearsExperience: a.yearsExperience,
    }));
  }

  async getTestimonials(tenantId: Types.ObjectId): Promise<PublicTestimonial[]> {
    const docs = await this.testimonials.find({ tenantId, published: true }).sort({ order: 1 }).limit(8).lean<any[]>();
    return docs.map((t) => ({ id: t._id.toString(), quote: t.quote, author: t.author, context: t.context, rating: t.rating }));
  }

  async getArticles(tenantId: Types.ObjectId, limit = 3): Promise<PublicArticle[]> {
    const docs = await this.articles
      .find({ tenantId, status: 'published' }, { body: 0 })
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean<any[]>();
    return docs.map((a) => ({
      id: a._id.toString(),
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt,
      category: a.category,
      image: a.image,
      readMinutes: a.readMinutes,
      publishedAt: new Date(a.publishedAt).toISOString(),
    }));
  }

  async getArticle(tenantId: Types.ObjectId, slug: string): Promise<PublicArticleDetail> {
    const a = await this.articles.findOne({ tenantId, slug, status: 'published' }).lean<any>();
    if (!a) throw new NotFoundException({ code: 'ARTICLE_NOT_FOUND', message: 'This article is not available.' });
    const [author, sameCategory, latest] = await Promise.all([
      a.authorId ? this.agents.findOne({ tenantId, _id: a.authorId, active: true }, { name: 1, title: 1, photoUrl: 1 }).lean<any>() : null,
      this.articles.find({ tenantId, status: 'published', category: a.category, _id: { $ne: a._id } }, { body: 0 }).sort({ publishedAt: -1 }).limit(3).lean<any[]>(),
      this.articles.find({ tenantId, status: 'published', _id: { $ne: a._id } }, { body: 0 }).sort({ publishedAt: -1 }).limit(3).lean<any[]>(),
    ]);
    const related = [...sameCategory, ...latest.filter((l) => !sameCategory.some((s) => s._id.equals(l._id)))].slice(0, 3);
    return {
      id: a._id.toString(), title: a.title, slug: a.slug, excerpt: a.excerpt, body: a.body as string, category: a.category,
      image: a.image, imageAlt: a.imageAlt ?? '', readMinutes: a.readMinutes ?? readingMinutes(a.body ?? ''),
      publishedAt: new Date(a.publishedAt).toISOString(), updatedAt: new Date(a.updatedAt ?? a.publishedAt).toISOString(),
      seoTitle: a.seoTitle ?? '', seoDescription: a.seoDescription ?? '',
      author: author ? { name: author.name, title: author.title, photoUrl: author.photoUrl ?? '' } : null,
      related: related.map((r) => ({ title: r.title, slug: r.slug, image: r.image, category: r.category, publishedAt: new Date(r.publishedAt).toISOString(), readMinutes: r.readMinutes })),
    };
  }

  /** Everything the homepage renders, in one round trip from the Next.js server. */
  async getHomeBundle(tenant: ResolvedTenant, configOverride?: PublicSiteConfig) {
    const config = configOverride ?? (await this.getConfig(tenant));
    const featuredSection = config.homepage.sections.find((s) => s.type === 'featured');
    const limit = featuredSection?.type === 'featured' ? featuredSection.data.limit : 6;
    const [featured, locations, projects, agents, testimonials, articles, cities] = await Promise.all([
      this.properties.search(tenant.id, { featured: true, sort: 'relevance', page: 1, limit }),
      this.getLocations(tenant.id),
      this.getProjects(tenant.id),
      this.getAgents(tenant.id),
      this.getTestimonials(tenant.id),
      this.getArticles(tenant.id),
      this.getCities(tenant.id),
    ]);
    return { config, featured: featured.items, locations, projects, agents, testimonials, articles, cities };
  }

  /** Cities with live listings, for the search dropdown. */
  async getCities(tenantId: Types.ObjectId): Promise<string[]> {
    const cities: string[] = await this.propertyModel.distinct('location.city', { tenantId, status: 'published' });
    return cities.sort((a, b) => a.localeCompare(b));
  }
}
