import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types, type Model, type SortOrder } from 'mongoose';
import {
  PUBLIC_PROPERTY_STATUSES,
  type Paginated,
  type PropertyAgentSummary,
  type PropertyQuery,
  type PublicProperty,
} from '@estatery/shared';
import type { PropertyDoc } from './property.schema.js';

/** Listings published within this window get the "New" badge. */
const NEW_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

const SORTS: Record<PropertyQuery['sort'], Record<string, SortOrder>> = {
  relevance: { featured: -1, publishedAt: -1, _id: -1 },
  newest: { publishedAt: -1, _id: -1 },
  'price-asc': { price: 1, _id: 1 },
  'price-desc': { price: -1, _id: -1 },
  'area-desc': { areaSqft: -1, _id: -1 },
};

/** Thrown when a listing was renamed; the controller turns it into a redirect hint. */
export class MovedError extends Error {
  constructor(public readonly slug: string) {
    super('moved');
  }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type LeanProperty = PropertyDoc & { _id: Types.ObjectId };

@Injectable()
export class PropertiesService {
  constructor(
    @InjectModel('Property') private readonly properties: Model<PropertyDoc>,
    @InjectModel('Agent') private readonly agents: Model<any>,
    @InjectModel('Project') private readonly projects: Model<any>,
  ) {}

  /** Builds the Mongo filter for public search. Everything is scoped to the tenant and to public statuses. */
  buildPublicFilter(tenantId: Types.ObjectId, q: PropertyQuery) {
    const filter: Record<string, unknown> = { tenantId, status: { $in: PUBLIC_PROPERTY_STATUSES } };
    if (q.city) filter['location.city'] = new RegExp(`^${escapeRegex(q.city)}$`, 'i');
    if (q.listingType) filter.listingType = q.listingType;
    if (q.category) filter.category = q.category;
    if (q.type) filter.type = q.type;
    if (q.featured) filter.featured = true;
    if (q.ids) filter._id = { $in: q.ids.map((id) => new Types.ObjectId(id)) };
    if (q.bhk) filter.bhk = q.bhk >= 5 ? { $gte: 5 } : q.bhk;
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      filter.price = {
        ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}),
        ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}),
      };
    }
    if (q.q) {
      // Keyword search over title and locality. Escaped to prevent regex injection / ReDoS.
      // Upgrade path: Atlas Search index for typo tolerance and ranking.
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ title: rx }, { 'location.locality': rx }, { 'location.city': rx }];
    }
    return filter;
  }

  async search(tenantId: Types.ObjectId, q: PropertyQuery): Promise<Paginated<PublicProperty>> {
    const filter = this.buildPublicFilter(tenantId, q);
    if (q.project) {
      const project = await this.projects.findOne({ tenantId, slug: q.project }, { _id: 1 }).lean<{ _id: Types.ObjectId }>();
      filter.projectId = project?._id ?? new Types.ObjectId(); // unknown project → no results
    }
    const [docs, total] = await Promise.all([
      this.properties
        .find(filter)
        .sort(SORTS[q.sort])
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean<LeanProperty[]>(),
      this.properties.countDocuments(filter),
    ]);
    return {
      items: await this.toPublic(tenantId, docs),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    };
  }

  async findBySlug(tenantId: Types.ObjectId, slug: string): Promise<PublicProperty> {
    const doc = await this.properties
      .findOne({ tenantId, slug: slug.toLowerCase(), status: { $in: PUBLIC_PROPERTY_STATUSES } })
      .lean<LeanProperty>();
    if (!doc) {
      // Renamed listing: point the old URL at the new one instead of a 404.
      const moved = await this.properties
        .findOne({ tenantId, previousSlugs: slug.toLowerCase(), status: { $in: PUBLIC_PROPERTY_STATUSES } }, { slug: 1 })
        .lean<{ slug: string }>();
      if (moved) throw new MovedError(moved.slug);
      throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'This property is not available.' });
    }
    const [item] = await this.toPublic(tenantId, [doc]);
    return item!;
  }

  /** Same city, similar price band; falls back to same city only. */
  async similar(tenantId: Types.ObjectId, slug: string, limit = 3): Promise<PublicProperty[]> {
    const base = await this.properties.findOne({ tenantId, slug, status: { $in: PUBLIC_PROPERTY_STATUSES } }).lean<LeanProperty>();
    if (!base) return [];
    const docs = await this.properties
      .find({
        tenantId,
        _id: { $ne: base._id },
        status: 'published',
        listingType: base.listingType,
        'location.city': base.location!.city,
      })
      .sort({ featured: -1, publishedAt: -1 })
      .limit(limit * 3)
      .lean<LeanProperty[]>();
    docs.sort((a, b) => Math.abs(a.price - base.price) - Math.abs(b.price - base.price));
    return this.toPublic(tenantId, docs.slice(0, limit));
  }

  async existsPublic(tenantId: Types.ObjectId, id: string) {
    if (!isValidObjectId(id)) return null;
    return this.properties
      .findOne({ tenantId, _id: id, status: { $in: PUBLIC_PROPERTY_STATUSES } }, { _id: 1, agentId: 1 })
      .lean<{ _id: Types.ObjectId; agentId: Types.ObjectId | null }>();
  }

  /** Maps DB documents to the public contract, joining agents/projects with tenant-scoped queries. */
  private async toPublic(tenantId: Types.ObjectId, docs: LeanProperty[]): Promise<PublicProperty[]> {
    const agentIds = [...new Set(docs.map((d) => d.agentId?.toString()).filter(Boolean))] as string[];
    const projectIds = [...new Set(docs.map((d) => d.projectId?.toString()).filter(Boolean))] as string[];
    const [agents, projects] = await Promise.all([
      agentIds.length ? this.agents.find({ tenantId, _id: { $in: agentIds } }).lean<any[]>() : [],
      projectIds.length ? this.projects.find({ tenantId, _id: { $in: projectIds } }, { name: 1, slug: 1 }).lean<any[]>() : [],
    ]);
    const agentMap = new Map<string, PropertyAgentSummary>(
      agents.map((a) => [
        a._id.toString(),
        { id: a._id.toString(), name: a.name, title: a.title, phone: a.phone, email: a.email, photoUrl: a.photoUrl },
      ]),
    );
    const projectMap = new Map(projects.map((p) => [p._id.toString(), { name: p.name as string, slug: p.slug as string }]));
    const now = Date.now();

    return docs.map((d) => ({
      id: d._id.toString(),
      slug: d.slug,
      title: d.title,
      summary: d.summary ?? '',
      description: d.description ?? '',
      listingType: d.listingType as PublicProperty['listingType'],
      category: d.category as PublicProperty['category'],
      type: d.type as PublicProperty['type'],
      status: d.status as PublicProperty['status'],
      price: d.price,
      priceUnit: (d.priceUnit ?? 'total') as PublicProperty['priceUnit'],
      currency: d.currency ?? 'INR',
      bhk: d.bhk ?? null,
      bathrooms: d.bathrooms ?? null,
      areaSqft: d.areaSqft,
      location: {
        locality: d.location!.locality,
        city: d.location!.city,
        state: d.location!.state ?? '',
        lat: d.location!.lat ?? null,
        lng: d.location!.lng ?? null,
      },
      amenities: d.amenities ?? [],
      images: (d.images ?? []).map((i) => ({ url: i.url, alt: i.alt ?? d.title })),
      badges: {
        featured: !!d.featured,
        verified: !!d.verified,
        isNew: !!d.publishedAt && now - new Date(d.publishedAt).getTime() < NEW_WINDOW_MS,
      },
      project: d.projectId ? (projectMap.get(d.projectId.toString()) ?? null) : null,
      agent: d.agentId ? (agentMap.get(d.agentId.toString()) ?? null) : null,
      publishedAt: d.publishedAt ? new Date(d.publishedAt).toISOString() : null,
    }));
  }
}
