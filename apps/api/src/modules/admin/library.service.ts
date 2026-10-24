import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types, type Model } from 'mongoose';
import { safeImageUrl, slugify } from '@estatery/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { MediaService } from '../media/media.service.js';

/**
 * Content library: advisor profiles, testimonials, destinations and projects that homepage
 * sections draw from. Each kind has its own schema; all share the same CRUD and ordering rules.
 */
const text = (min: number, max: number, label: string) => z.string().trim().min(min, `Enter ${label}`).max(max);
const list = z.array(z.string().trim().min(1).max(40)).max(12).default([]);

export const LIBRARY = {
  agents: {
    model: 'Agent',
    label: 'advisor',
    schema: z.object({
      name: text(2, 80, 'a name'), title: z.string().trim().max(80).default(''), photoUrl: safeImageUrl,
      phone: z.string().trim().regex(/^[+()\d\s-]{0,20}$/, 'Enter a valid phone number').default(''),
      email: z.union([z.literal(''), z.string().trim().email('Enter a valid email')]).default(''),
      specialities: list, languages: list, yearsExperience: z.coerce.number().int().min(0).max(70).default(0), active: z.boolean().default(true),
    }),
    title: (d: any) => d.name as string,
    images: (d: any) => [d.photoUrl],
  },
  testimonials: {
    model: 'Testimonial',
    label: 'testimonial',
    schema: z.object({
      quote: text(10, 600, 'the quote'), author: text(2, 80, 'who said it'), context: z.string().trim().max(120).default(''),
      rating: z.coerce.number().int().min(1).max(5).default(5), published: z.boolean().default(true),
    }),
    title: (d: any) => d.author as string,
    images: () => [],
  },
  locations: {
    model: 'Location',
    label: 'destination',
    schema: z.object({
      name: text(2, 60, 'a name'), city: text(2, 60, 'the city used in listings'), image: safeImageUrl, blurb: z.string().trim().max(200).default(''),
    }),
    title: (d: any) => d.name as string,
    images: (d: any) => [d.image],
  },
  projects: {
    model: 'Project',
    label: 'project',
    schema: z.object({
      name: text(2, 80, 'a name'), developer: z.string().trim().max(120).default(''), city: text(2, 60, 'the city'), locality: z.string().trim().max(80).default(''),
      status: z.enum(['pre-launch', 'under-construction', 'ready-to-move']), possession: z.string().trim().max(40).default(''),
      startingPrice: z.coerce.number().min(0).max(1e12), configurations: z.string().trim().max(120).default(''), image: safeImageUrl,
      summary: z.string().trim().max(300).default(''), featured: z.boolean().default(false),
    }),
    title: (d: any) => d.name as string,
    images: (d: any) => [d.image],
  },
} as const;
export type LibraryKind = keyof typeof LIBRARY;
export const isLibraryKind = (k: string): k is LibraryKind => k in LIBRARY;

@Injectable()
export class LibraryService {
  private readonly models: Record<LibraryKind, Model<any>>;

  constructor(
    @InjectModel('Agent') agents: Model<any>,
    @InjectModel('Testimonial') testimonials: Model<any>,
    @InjectModel('Location') locations: Model<any>,
    @InjectModel('Project') projects: Model<any>,
    @InjectModel('Property') private readonly properties: Model<any>,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {
    this.models = { agents, testimonials, locations, projects };
  }

  async list(tenantId: Types.ObjectId, kind: LibraryKind) {
    const docs = await this.models[kind].find({ tenantId }).sort({ order: 1, createdAt: 1 }).lean<any[]>();
    return { items: docs.map((d) => this.dto(d)) };
  }

  async create(tenantId: Types.ObjectId, actor: AuthContext, kind: LibraryKind, body: unknown, ip: string | null) {
    const data = await this.validate(tenantId, kind, body);
    const last = await this.models[kind].findOne({ tenantId }).sort({ order: -1 }).lean<any>();
    const extra = kind === 'projects' ? { slug: await this.uniqueSlug(tenantId, (data as any).name) } : kind === 'locations' ? { slug: await this.uniqueSlug(tenantId, (data as any).name, 'locations') } : {};
    const doc = await this.models[kind].create({ ...data, ...extra, tenantId, order: (last?.order ?? -1) + 1 });
    await this.log(tenantId, actor, `library.${kind}.created`, `Added ${LIBRARY[kind].label} “${LIBRARY[kind].title(data)}”`, ip);
    return this.dto(doc.toObject());
  }

  async update(tenantId: Types.ObjectId, actor: AuthContext, kind: LibraryKind, id: string, body: unknown, ip: string | null) {
    const data = await this.validate(tenantId, kind, body);
    const doc = await this.models[kind].findOneAndUpdate({ tenantId, _id: this.oid(id) }, { $set: data }, { new: true }).lean<any>();
    if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    await this.log(tenantId, actor, `library.${kind}.updated`, `Edited ${LIBRARY[kind].label} “${LIBRARY[kind].title(data)}”`, ip);
    return this.dto(doc);
  }

  /** Blocks deleting things that listings or logins still point at. */
  async remove(tenantId: Types.ObjectId, actor: AuthContext, kind: LibraryKind, id: string, ip: string | null) {
    const _id = this.oid(id);
    const doc = await this.models[kind].findOne({ tenantId, _id }).lean<any>();
    if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    if (kind === 'agents') {
      const [listings, logins] = await Promise.all([this.properties.countDocuments({ tenantId, agentId: _id }), this.memberships.countDocuments({ tenantId, agentId: _id })]);
      if (listings || logins) {
        throw new ConflictException({ code: 'IN_USE', message: `${doc.name} is assigned to ${listings} listing${listings === 1 ? '' : 's'}${logins ? ' and linked to a login' : ''}. Reassign those first, or mark the profile inactive.` });
      }
    }
    if (kind === 'projects') {
      const listings = await this.properties.countDocuments({ tenantId, projectId: _id });
      if (listings) throw new ConflictException({ code: 'IN_USE', message: `${listings} listing${listings === 1 ? ' is' : 's are'} part of this project. Remove them from the project first.` });
    }
    await this.models[kind].deleteOne({ tenantId, _id });
    await this.log(tenantId, actor, `library.${kind}.deleted`, `Deleted ${LIBRARY[kind].label} “${LIBRARY[kind].title(doc)}”`, ip);
  }

  async reorder(tenantId: Types.ObjectId, kind: LibraryKind, ids: string[]) {
    const owned = await this.models[kind].countDocuments({ tenantId, _id: { $in: ids.map((i) => this.oid(i)) } });
    if (owned !== ids.length) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'The list changed. Reload and try again.' });
    await Promise.all(ids.map((id, order) => this.models[kind].updateOne({ tenantId, _id: this.oid(id) }, { $set: { order } })));
    return this.list(tenantId, kind);
  }

  private async validate(tenantId: Types.ObjectId, kind: LibraryKind, body: unknown) {
    const parsed = LIBRARY[kind].schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Some fields need attention.', fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (!(await this.media.ownsAll(tenantId, LIBRARY[kind].images(parsed.data).filter(Boolean)))) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose an image from your media library.', fields: [{ path: 'image', message: 'Choose an image from your media library' }] });
    }
    return parsed.data;
  }

  private async uniqueSlug(tenantId: Types.ObjectId, name: string, kind: 'projects' | 'locations' = 'projects') {
    const base = slugify(name) || kind.slice(0, -1);
    for (let n = 0; n < 50; n++) {
      const slug = n ? `${base}-${n + 1}` : base;
      if (!(await this.models[kind].exists({ tenantId, slug }))) return slug;
    }
    return `${base}-${Date.now()}`;
  }

  private oid(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    return new Types.ObjectId(id);
  }

  private dto(d: any) {
    const { _id, tenantId, __v, ...rest } = d;
    void tenantId; void __v;
    return { id: _id.toString(), ...rest, createdAt: rest.createdAt ? new Date(rest.createdAt).toISOString() : null, updatedAt: rest.updatedAt ? new Date(rest.updatedAt).toISOString() : null };
  }

  private log(tenantId: Types.ObjectId, actor: AuthContext, action: string, summary: string, ip: string | null) {
    return this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action, summary, ip });
  }
}
