import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import {
  can, homepageSchema, siteSettingsSchema, sitePagesSchema, THEME_PRESETS, DEFAULT_THEME_PRESET, themeTokensSchema, PAGE_KEYS,
  type Homepage, type PageKey, type SitePages, type SiteSettings, type ThemeTokens,
} from '@estatery/shared';
import type { ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { MediaService } from '../media/media.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { defaultHomepage, defaultPages } from './site-defaults.js';

type Part = 'settings' | 'theme' | 'homepage' | 'pages';
const PARTS: Part[] = ['settings', 'theme', 'homepage', 'pages'];
const PART_LABEL: Record<Part, string> = { settings: 'business details', theme: 'theme', homepage: 'homepage', pages: 'pages' };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const enabledPages = (p: SitePages) => Object.fromEntries(PAGE_KEYS.map((k) => [k, !!p?.[k]?.enabled])) as Record<PageKey, boolean>;

/** Collects every image URL inside a structured value, so ownership can be checked. */
function imageUrls(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => imageUrls(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && /image|logoUrl|ogImage/i.test(k)) out.push(v);
      else imageUrls(v, out);
    }
  }
  return out;
}

/**
 * Draft → preview → publish for everything the public site renders from configuration.
 *
 * Editors save drafts freely; visitors only ever see the published copy. Each save carries the
 * draft revision it was based on, so two people editing at once can't silently overwrite each
 * other. Every publish stores a full snapshot that can be restored later.
 */
@Injectable()
export class SiteEditorService {
  constructor(
    @InjectModel('Tenant') private readonly tenants: Model<any>,
    @InjectModel('Theme') private readonly themes: Model<any>,
    @InjectModel('Page') private readonly pages: Model<any>,
    @InjectModel('SiteVersion') private readonly versions: Model<any>,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly tenantsService: TenantsService,
  ) {}

  /** Content pages live in one Page document (key "pages"). Agencies created before they existed get defaults. */
  async ensurePages(tenantId: Types.ObjectId) {
    const existing = await this.pages.findOne({ tenantId, key: 'pages' }).lean<any>();
    if (existing) return existing;
    const t = await this.tenants.findById(tenantId, { settings: 1 }).lean<any>();
    const value = defaultPages(t.settings as SiteSettings);
    await this.pages.updateOne({ tenantId, key: 'pages' }, { $setOnInsert: { tenantId, key: 'pages', draft: value, published: value, draftRevision: 0 } }, { upsert: true });
    return this.pages.findOne({ tenantId, key: 'pages' }).lean<any>();
  }

  async getDraft(tenantId: Types.ObjectId) {
    const pagesDoc = await this.ensurePages(tenantId);
    const [t, theme, home, last] = await Promise.all([
      this.tenants.findById(tenantId).lean<any>(),
      this.themes.findOne({ tenantId }).lean<any>(),
      this.pages.findOne({ tenantId, key: 'home' }).lean<any>(),
      this.versions.findOne({ tenantId }).sort({ version: -1 }).lean<any>(),
    ]);
    if (!t || !theme || !home) throw new NotFoundException({ code: 'SITE_NOT_CONFIGURED', message: 'This site has not been set up yet.' });
    const draft = { settings: (t.settingsDraft ?? t.settings) as SiteSettings, theme: theme.draft as ThemeTokens, homepage: home.draft as Homepage, pages: pagesDoc.draft as SitePages };
    const published = { settings: t.settings as SiteSettings, theme: theme.published as ThemeTokens, homepage: home.published as Homepage, pages: pagesDoc.published as SitePages };
    return {
      draft,
      revisions: { settings: t.settingsDraftRevision ?? 0, theme: theme.draftRevision ?? 0, homepage: home.draftRevision ?? 0, pages: pagesDoc.draftRevision ?? 0 },
      changed: PARTS.filter((p) => !same(draft[p], published[p])),
      version: t.siteVersion ?? 1,
      lastPublished: last ? { at: new Date(last.createdAt).toISOString(), by: last.publishedByName } : null,
    };
  }

  /** Draft config shaped like the public config, for the preview iframe. */
  async getDraftConfig(tenant: ResolvedTenant) {
    const d = await this.getDraft(tenant.id);
    return {
      tenant: { id: tenant.id.toString(), slug: tenant.slug, name: tenant.name },
      settings: siteSettingsSchema.parse(d.draft.settings),
      theme: themeTokensSchema.parse(d.draft.theme),
      homepage: homepageSchema.parse(d.draft.homepage),
      pages: enabledPages(d.draft.pages),
    };
  }

  /** One draft content page for the preview (shown even while switched off). */
  async getDraftPage(tenantId: Types.ObjectId, key: PageKey) {
    const d = await this.getDraft(tenantId);
    return sitePagesSchema.parse(d.draft.pages)[key];
  }

  async saveDraft(tenantId: Types.ObjectId, actor: AuthContext, part: Part, value: unknown, baseRevision: number) {
    this.assertCanEdit(actor, part);
    const parsed =
      part === 'homepage' ? homepageSchema.safeParse(value)
        : part === 'theme' ? themeTokensSchema.safeParse(value)
          : part === 'pages' ? sitePagesSchema.safeParse(value)
            : siteSettingsSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED', message: 'Some fields need attention.',
        fields: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (!(await this.media.ownsAll(tenantId, imageUrls(parsed.data)))) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'One or more images aren’t in your media library.' });
    }

    // Conditional write on the revision we started from: a stale save fails instead of clobbering.
    const conflict = () => new ConflictException({ code: 'DRAFT_CONFLICT', message: 'Someone else saved changes to this while you were editing. Reload to see their version.' });
    if (part === 'settings') {
      const r = await this.tenants.updateOne(
        { _id: tenantId, settingsDraftRevision: baseRevision === 0 ? { $in: [0, null] } : baseRevision },
        { $set: { settingsDraft: parsed.data }, $inc: { settingsDraftRevision: 1 } },
      );
      if (r.modifiedCount === 0) throw conflict();
    } else {
      if (part === 'pages') await this.ensurePages(tenantId);
      const model = part === 'theme' ? this.themes : this.pages;
      const filter: Record<string, unknown> = { tenantId, draftRevision: baseRevision === 0 ? { $in: [0, null] } : baseRevision };
      if (part === 'homepage') filter.key = 'home';
      if (part === 'pages') filter.key = 'pages';
      const r = await model.updateOne(filter, { $set: { draft: parsed.data }, $inc: { draftRevision: 1 } });
      if (r.modifiedCount === 0) throw conflict();
    }
    return { revision: baseRevision + 1 };
  }

  async publish(tenant: ResolvedTenant, actor: AuthContext, note: string, ip: string | null) {
    const d = await this.getDraft(tenant.id);
    if (d.changed.length === 0) throw new BadRequestException({ code: 'NOTHING_TO_PUBLISH', message: 'There are no unpublished changes.' });
    d.changed.forEach((p) => this.assertCanEdit(actor, p));

    // Re-validate the whole draft right before it goes live.
    const settings = siteSettingsSchema.parse(d.draft.settings);
    const theme = themeTokensSchema.parse(d.draft.theme);
    const homepage = homepageSchema.parse(d.draft.homepage);
    const pages = sitePagesSchema.parse(d.draft.pages);
    const version = d.version + 1;

    await this.versions.create({
      tenantId: tenant.id, version, snapshot: { settings, theme, homepage, pages }, note: note.slice(0, 200),
      publishedBy: actor.userId, publishedByName: actor.name, changed: d.changed,
    });
    await Promise.all([
      this.tenants.updateOne({ _id: tenant.id }, { $set: { settings, name: settings.businessName, siteVersion: version } }),
      this.themes.updateOne({ tenantId: tenant.id }, { $set: { published: theme, version, publishedAt: new Date() } }),
      this.pages.updateOne({ tenantId: tenant.id, key: 'home' }, { $set: { published: homepage, version, publishedAt: new Date() } }),
      this.pages.updateOne({ tenantId: tenant.id, key: 'pages' }, { $set: { published: pages, version, publishedAt: new Date() } }),
    ]);
    this.tenantsService.invalidate(tenant.hostname);
    await this.audit.record({
      tenantId: tenant.id, actor: { id: actor.userId, name: actor.name }, action: 'site.published', targetType: 'site', targetId: String(version),
      summary: `Published version ${version} (${d.changed.map((p) => PART_LABEL[p]).join(', ')})${note ? `: ${note}` : ''}`, ip,
    });
    return { version, changed: d.changed };
  }

  async discard(tenantId: Types.ObjectId, actor: AuthContext, ip: string | null) {
    const d = await this.getDraft(tenantId);
    d.changed.forEach((p) => this.assertCanEdit(actor, p));
    const [theme, page, contentPages] = await Promise.all([
      this.themes.findOne({ tenantId }, { published: 1 }).lean<any>(),
      this.pages.findOne({ tenantId, key: 'home' }, { published: 1 }).lean<any>(),
      this.pages.findOne({ tenantId, key: 'pages' }, { published: 1 }).lean<any>(),
    ]);
    await Promise.all([
      this.tenants.updateOne({ _id: tenantId }, { $set: { settingsDraft: null }, $inc: { settingsDraftRevision: 1 } }),
      this.themes.updateOne({ tenantId }, { $set: { draft: theme.published }, $inc: { draftRevision: 1 } }),
      this.pages.updateOne({ tenantId, key: 'home' }, { $set: { draft: page.published }, $inc: { draftRevision: 1 } }),
      this.pages.updateOne({ tenantId, key: 'pages' }, { $set: { draft: contentPages.published }, $inc: { draftRevision: 1 } }),
    ]);
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'site.discarded', summary: `Discarded unpublished changes (${d.changed.map((p) => PART_LABEL[p]).join(', ') || 'none'})`, ip });
  }

  async listVersions(tenantId: Types.ObjectId) {
    const docs = await this.versions.find({ tenantId }, { snapshot: 0 }).sort({ version: -1 }).limit(25).lean<any[]>();
    return {
      items: docs.map((v) => ({
        version: v.version, note: v.note, publishedBy: v.publishedByName, changed: v.changed as Part[], at: new Date(v.createdAt).toISOString(),
      })),
    };
  }

  /** Loads an old snapshot into the draft (it is not published until someone publishes). */
  async restore(tenantId: Types.ObjectId, actor: AuthContext, version: number, ip: string | null) {
    this.assertCanEdit(actor, 'theme');
    this.assertCanEdit(actor, 'homepage');
    const v = await this.versions.findOne({ tenantId, version }).lean<any>();
    if (!v) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That version doesn’t exist.' });
    await Promise.all([
      this.tenants.updateOne({ _id: tenantId }, { $set: { settingsDraft: v.snapshot.settings }, $inc: { settingsDraftRevision: 1 } }),
      this.themes.updateOne({ tenantId }, { $set: { draft: v.snapshot.theme }, $inc: { draftRevision: 1 } }),
      this.pages.updateOne({ tenantId, key: 'home' }, { $set: { draft: v.snapshot.homepage }, $inc: { draftRevision: 1 } }),
      // Versions published before content pages existed don't include them; keep the current draft.
      v.snapshot.pages ? this.pages.updateOne({ tenantId, key: 'pages' }, { $set: { draft: v.snapshot.pages }, $inc: { draftRevision: 1 } }) : Promise.resolve(),
    ]);
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'site.restored', summary: `Loaded version ${version} into the draft`, ip });
  }

  defaults(settings: SiteSettings) {
    return {
      homepage: defaultHomepage(settings.businessName),
      pages: defaultPages(settings),
      themePresets: Object.entries(THEME_PRESETS).map(([id, p]) => ({ id, label: p.label, tokens: p.tokens, isDefault: id === DEFAULT_THEME_PRESET })),
    };
  }

  /** Homepage content needs content:write; theme and business details need branding:write. */
  private assertCanEdit(actor: AuthContext, part: Part) {
    const perm = part === 'homepage' || part === 'pages' ? 'content:write' : 'branding:write';
    if (!can(actor.role, perm)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: `Your role can’t change the ${PART_LABEL[part]}.` });
    }
  }
}
