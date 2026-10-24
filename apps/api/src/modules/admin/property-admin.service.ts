import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { isValidObjectId, Types, type Model } from 'mongoose';
import {
  PROPERTY_CSV_COLUMNS, propertyInputSchema, publishProblems, slugify, STATUS_TRANSITIONS,
  type PropertyInputParsed, type PropertyStatus,
} from '@estatery/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { MediaService } from '../media/media.service.js';

const MAX_IMPORT_ROWS = 500;

type FieldError = { path: string; message: string };
const fieldError = (path: string, message: string) =>
  new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Some fields need attention.', fields: [{ path, message }] });

@Injectable()
export class PropertyAdminService {
  constructor(
    @InjectModel('Property') private readonly properties: Model<any>,
    @InjectModel('Agent') private readonly agents: Model<any>,
    @InjectModel('Project') private readonly projects: Model<any>,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async get(tenantId: Types.ObjectId, id: string) {
    const doc = await this.find(tenantId, id);
    return this.toEditDto(doc);
  }

  async create(tenantId: Types.ObjectId, actor: AuthContext, input: PropertyInputParsed, ip: string | null) {
    await this.validateRefs(tenantId, input);
    const slug = await this.resolveSlug(tenantId, input.slug || slugify(`${input.title} ${input.location.locality}`), null, !input.slug);
    const doc = await this.properties.create({
      ...this.toDoc(input), tenantId, slug, status: 'draft', createdBy: actor.userId, updatedBy: actor.userId,
    });
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'property.created', targetType: 'property', targetId: doc._id.toString(), summary: `Created draft “${input.title}”`, ip });
    return this.toEditDto(doc.toObject());
  }

  async update(tenantId: Types.ObjectId, actor: AuthContext, id: string, input: PropertyInputParsed, ip: string | null) {
    const current = await this.find(tenantId, id);
    await this.validateRefs(tenantId, input);
    const wantedSlug = input.slug || current.slug;
    const slug = wantedSlug === current.slug ? current.slug : await this.resolveSlug(tenantId, wantedSlug, current._id, false);

    // A live listing must stay publishable after an edit.
    if (current.status === 'published') {
      const problems = publishProblems(input);
      if (problems.length) {
        throw new BadRequestException({ code: 'PUBLISH_REQUIREMENTS', message: 'This listing is live, so it needs to stay complete.', problems });
      }
    }

    const set: Record<string, unknown> = { ...this.toDoc(input), slug, updatedBy: actor.userId };
    const update: Record<string, unknown> = { $set: set };
    if (slug !== current.slug) {
      // Keep the old URL redirecting, and free the new slug from this listing's own history.
      update.$addToSet = { previousSlugs: current.slug };
      update.$pull = { previousSlugs: slug };
    }
    // Mongo forbids $addToSet and $pull on the same path in one update; apply in two steps.
    if (update.$addToSet && update.$pull) {
      await this.properties.updateOne({ tenantId, _id: current._id }, { $set: set, $pull: update.$pull });
      await this.properties.updateOne({ tenantId, _id: current._id }, { $addToSet: update.$addToSet });
    } else {
      await this.properties.updateOne({ tenantId, _id: current._id }, update);
    }
    const changed = Object.keys(this.diff(current, input)).join(', ');
    await this.audit.record({
      tenantId, actor: { id: actor.userId, name: actor.name }, action: 'property.updated', targetType: 'property', targetId: id,
      summary: `Edited “${input.title}”${changed ? ` (${changed})` : ''}${slug !== current.slug ? `; URL changed to /properties/${slug}` : ''}`, ip,
    });
    return this.get(tenantId, id);
  }

  async setStatus(tenantId: Types.ObjectId, actor: AuthContext, id: string, status: PropertyStatus, ip: string | null) {
    const current = await this.find(tenantId, id);
    if (current.status === status) return this.toEditDto(current);
    const allowed = STATUS_TRANSITIONS[current.status as PropertyStatus];
    if (!allowed.includes(status)) {
      throw new BadRequestException({ code: 'INVALID_TRANSITION', message: `A ${current.status} listing can’t be marked ${status}.` });
    }
    if (status === 'published') {
      const problems = publishProblems(this.toInputShape(current));
      if (problems.length) throw new BadRequestException({ code: 'PUBLISH_REQUIREMENTS', message: 'Finish these before publishing.', problems });
      await this.entitlements.assertCanAdd(tenantId, 'listings');
    }
    const set: Record<string, unknown> = { status, updatedBy: actor.userId };
    if (status === 'published' && !current.publishedAt) set.publishedAt = new Date();
    if (status === 'sold' && current.listingType === 'rent') set.status = 'rented';
    if (status === 'rented' && current.listingType === 'sale') set.status = 'sold';
    await this.properties.updateOne({ tenantId, _id: current._id }, { $set: set });
    const verb: Record<string, string> = { published: 'Published', draft: 'Unpublished', sold: 'Marked as sold', rented: 'Marked as rented', archived: 'Archived' };
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: `property.${set.status}`, targetType: 'property', targetId: id, summary: `${verb[set.status as string]} “${current.title}”`, ip });
    return this.get(tenantId, id);
  }

  /** Only drafts can be deleted outright; anything that was ever live is archived instead. */
  async remove(tenantId: Types.ObjectId, actor: AuthContext, id: string, ip: string | null) {
    const current = await this.find(tenantId, id);
    if (current.status !== 'draft' || current.publishedAt) {
      throw new ConflictException({ code: 'NOT_DELETABLE', message: 'Only drafts that were never published can be deleted. Archive this listing instead.' });
    }
    await this.properties.deleteOne({ tenantId, _id: current._id });
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'property.deleted', targetType: 'property', targetId: id, summary: `Deleted draft “${current.title}”`, ip });
  }

  async exportCsv(tenantId: Types.ObjectId, actor: AuthContext, ip: string | null) {
    const docs = await this.properties.find({ tenantId }).sort({ updatedAt: -1 }).limit(10_000).lean<any[]>();
    const rows = docs.map((d) => ({
      slug: d.slug, title: d.title, status: d.status, listingType: d.listingType, category: d.category, type: d.type,
      price: d.price, bhk: d.bhk ?? '', bathrooms: d.bathrooms ?? '', areaSqft: d.areaSqft,
      locality: d.location?.locality ?? '', city: d.location?.city ?? '', state: d.location?.state ?? '',
      lat: d.location?.lat ?? '', lng: d.location?.lng ?? '',
      amenities: (d.amenities ?? []).join('|'), images: (d.images ?? []).map((i: any) => i.url).join('|'),
      featured: d.featured ? 'true' : 'false', verified: d.verified ? 'true' : 'false', summary: d.summary ?? '', description: d.description ?? '',
    }));
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'property.exported', summary: `Exported ${rows.length} listings to CSV`, ip });
    // Leading =,+,-,@ would run as formulas in spreadsheet apps (CSV injection); prefix them with '.
    const safe = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
    return stringify(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safe(v)]))), { header: true, columns: [...PROPERTY_CSV_COLUMNS] });
  }

  /**
   * CSV import. Rows with an existing slug update that listing (its status is kept); new slugs
   * become drafts. All-or-nothing: if any row is invalid, nothing is written.
   */
  async importCsv(tenantId: Types.ObjectId, actor: AuthContext, csv: string, dryRun: boolean, ip: string | null) {
    let records: Record<string, string>[];
    try {
      records = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true, max_record_size: 20_000 });
    } catch (e) {
      throw new BadRequestException({ code: 'CSV_INVALID', message: `The file couldn’t be read as CSV: ${(e as Error).message.split('\n')[0]}` });
    }
    if (records.length === 0) throw new BadRequestException({ code: 'CSV_EMPTY', message: 'The file has no rows.' });
    if (records.length > MAX_IMPORT_ROWS) throw new BadRequestException({ code: 'CSV_TOO_LARGE', message: `Import up to ${MAX_IMPORT_ROWS} rows at a time.` });
    const missing = ['title', 'listingType', 'category', 'type', 'price', 'areaSqft', 'locality', 'city'].filter((c) => !(c in records[0]!));
    if (missing.length) throw new BadRequestException({ code: 'CSV_COLUMNS', message: `Missing columns: ${missing.join(', ')}. Export your listings to get a template.` });

    const existing = await this.properties.find({ tenantId }, { slug: 1, status: 1 }).lean<any[]>();
    const bySlug = new Map(existing.map((e) => [e.slug as string, e]));
    const seen = new Set<string>();
    const errors: Array<{ row: number; messages: string[] }> = [];
    const plans: Array<{ op: 'create' | 'update'; id?: Types.ObjectId; slug: string; input: PropertyInputParsed }> = [];

    for (const [i, r] of records.entries()) {
      const row = i + 2; // header is row 1
      const unformula = (v: string | undefined) => (v ?? '').replace(/^'(?=[=+\-@])/, '');
      const parsed = propertyInputSchema.safeParse({
        title: unformula(r.title), slug: unformula(r.slug) || '', summary: unformula(r.summary), description: unformula(r.description),
        listingType: r.listingType, category: r.category, type: r.type, price: r.price, bhk: r.bhk, bathrooms: r.bathrooms, areaSqft: r.areaSqft,
        location: { locality: unformula(r.locality), city: unformula(r.city), state: unformula(r.state), lat: r.lat, lng: r.lng },
        amenities: (r.amenities ?? '').split('|').map((x) => x.trim()).filter(Boolean),
        images: (r.images ?? '').split('|').map((x) => x.trim()).filter(Boolean).map((url) => ({ url, alt: '' })),
        featured: /^(true|yes|1)$/i.test(r.featured ?? ''), verified: /^(true|yes|1)$/i.test(r.verified ?? ''),
        agentId: null, projectId: null,
      });
      if (!parsed.success) {
        errors.push({ row, messages: parsed.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`) });
        continue;
      }
      const slug = parsed.data.slug || slugify(`${parsed.data.title} ${parsed.data.location.locality}`);
      if (seen.has(slug)) {
        errors.push({ row, messages: [`slug: “${slug}” appears more than once in the file`] });
        continue;
      }
      seen.add(slug);
      if (!(await this.media.ownsAll(tenantId, parsed.data.images.map((x) => x.url)))) {
        errors.push({ row, messages: ['images: one or more image URLs belong to another site'] });
        continue;
      }
      const match = bySlug.get(slug);
      if (match?.status === 'published' && publishProblems(parsed.data).length) {
        errors.push({ row, messages: [`This listing is live: ${publishProblems(parsed.data).join('; ').toLowerCase()}`] });
        continue;
      }
      plans.push(match ? { op: 'update', id: match._id, slug, input: parsed.data } : { op: 'create', slug, input: parsed.data });
    }

    const summary = { created: plans.filter((p) => p.op === 'create').length, updated: plans.filter((p) => p.op === 'update').length, errors, dryRun };
    if (dryRun || errors.length) return summary;

    for (const p of plans) {
      if (p.op === 'create') {
        await this.properties.create({ ...this.toDoc(p.input), tenantId, slug: p.slug, status: 'draft', createdBy: actor.userId, updatedBy: actor.userId });
      } else {
        await this.properties.updateOne({ tenantId, _id: p.id }, { $set: { ...this.toDoc(p.input), updatedBy: actor.userId } });
      }
    }
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'property.imported', summary: `Imported CSV: ${summary.created} created, ${summary.updated} updated`, ip });
    return summary;
  }

  // ---------------------------------------------------------------------------------------------

  private async find(tenantId: Types.ObjectId, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Listing not found.' });
    const doc = await this.properties.findOne({ tenantId, _id: id }).lean<any>();
    if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Listing not found.' });
    return doc;
  }

  /** Agents, projects and images must all belong to this tenant. */
  private async validateRefs(tenantId: Types.ObjectId, input: PropertyInputParsed) {
    if (input.agentId && !(await this.agents.exists({ tenantId, _id: input.agentId }))) throw fieldError('agentId', 'Choose an advisor from your team');
    if (input.projectId && !(await this.projects.exists({ tenantId, _id: input.projectId }))) throw fieldError('projectId', 'Choose one of your projects');
    if (!(await this.media.ownsAll(tenantId, input.images.map((i) => i.url)))) throw fieldError('images', 'One or more images aren’t in your media library');
  }

  /** Unique per tenant, also against other listings' old slugs (so redirects never collide). */
  private async resolveSlug(tenantId: Types.ObjectId, wanted: string, selfId: Types.ObjectId | null, autoSuffix: boolean) {
    const base = slugify(wanted) || 'listing';
    if (base.length < 3) throw fieldError('slug', 'Use at least 3 characters');
    for (let n = 0; n < 50; n++) {
      const candidate = n === 0 ? base : `${base}-${n + 1}`;
      const clash = await this.properties.exists({
        tenantId, $or: [{ slug: candidate }, { previousSlugs: candidate }], ...(selfId ? { _id: { $ne: selfId } } : {}),
      });
      if (!clash) return candidate;
      if (!autoSuffix) throw fieldError('slug', `/properties/${candidate} is already used by another listing`);
    }
    throw fieldError('slug', 'Choose a more specific URL');
  }

  private toDoc(i: PropertyInputParsed) {
    return {
      title: i.title, summary: i.summary, description: i.description, listingType: i.listingType, category: i.category, type: i.type,
      price: i.price, priceUnit: i.listingType === 'rent' ? 'month' : 'total', bhk: i.bhk, bathrooms: i.bathrooms, areaSqft: i.areaSqft,
      location: i.location, amenities: [...new Set(i.amenities)], images: i.images, featured: i.featured, verified: i.verified,
      agentId: i.agentId ? new Types.ObjectId(i.agentId) : null, projectId: i.projectId ? new Types.ObjectId(i.projectId) : null,
    };
  }

  private toInputShape(d: any): PropertyInputParsed {
    return {
      title: d.title, slug: d.slug, summary: d.summary ?? '', description: d.description ?? '', listingType: d.listingType, category: d.category,
      type: d.type, price: d.price, bhk: d.bhk ?? null, bathrooms: d.bathrooms ?? null, areaSqft: d.areaSqft,
      location: { locality: d.location?.locality ?? '', city: d.location?.city ?? '', state: d.location?.state ?? '', lat: d.location?.lat ?? null, lng: d.location?.lng ?? null },
      amenities: d.amenities ?? [], images: (d.images ?? []).map((x: any) => ({ url: x.url, alt: x.alt ?? '' })),
      featured: !!d.featured, verified: !!d.verified, agentId: d.agentId?.toString() ?? null, projectId: d.projectId?.toString() ?? null,
    };
  }

  private toEditDto(d: any) {
    const input = this.toInputShape(d);
    return {
      id: d._id.toString(), status: d.status as PropertyStatus, publishedAt: d.publishedAt ? new Date(d.publishedAt).toISOString() : null,
      updatedAt: new Date(d.updatedAt ?? d.createdAt).toISOString(), previousSlugs: d.previousSlugs ?? [],
      publishProblems: publishProblems(input), allowedTransitions: STATUS_TRANSITIONS[d.status as PropertyStatus], ...input,
    };
  }

  private diff(current: any, next: PropertyInputParsed) {
    const before = this.toInputShape(current);
    const labels: Record<string, string> = { title: 'title', price: 'price', images: 'photos', description: 'description', summary: 'summary', featured: 'featured', agentId: 'advisor', location: 'location', amenities: 'amenities' };
    const out: Record<string, true> = {};
    for (const k of Object.keys(labels) as Array<keyof PropertyInputParsed>) {
      if (JSON.stringify(before[k]) !== JSON.stringify(next[k])) out[labels[k]!] = true;
    }
    return out;
  }
}
