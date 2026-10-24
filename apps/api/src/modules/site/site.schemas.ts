import { Schema } from 'mongoose';
import { tenantScopePlugin } from '../../common/tenancy/tenant-scope.plugin.js';

const tenantRef = { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true };

function scoped(schema: Schema) {
  schema.plugin(tenantScopePlugin);
  return schema;
}

/**
 * Theme and page documents keep a `draft` (what the admin panel edits) and a `published`
 * snapshot (what the public site renders). Publishing copies draft → published and bumps version.
 */
export const ThemeSchema = scoped(
  new Schema(
    {
      tenantId: { ...tenantRef, unique: true },
      draft: { type: Schema.Types.Mixed, required: true },
      published: { type: Schema.Types.Mixed, required: true },
      version: { type: Number, default: 1 },
      publishedAt: { type: Date, default: Date.now },
      /** Bumped on every draft save; editors send it back to detect concurrent edits. */
      draftRevision: { type: Number, default: 0 },
    },
    { timestamps: true, minimize: false },
  ),
);

export const PageSchema = scoped(
  new Schema(
    {
      tenantId: tenantRef,
      key: { type: String, required: true, match: /^[a-z0-9-]{2,60}$/ },
      draft: { type: Schema.Types.Mixed, required: true },
      published: { type: Schema.Types.Mixed, required: true },
      version: { type: Number, default: 1 },
      publishedAt: { type: Date, default: Date.now },
      draftRevision: { type: Number, default: 0 },
    },
    { timestamps: true, minimize: false },
  ),
);
PageSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const AgentSchema = scoped(
  new Schema(
    {
      tenantId: tenantRef,
      name: { type: String, required: true },
      title: { type: String, default: '' },
      photoUrl: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      specialities: { type: [String], default: [] },
      languages: { type: [String], default: [] },
      yearsExperience: { type: Number, default: 0 },
      order: { type: Number, default: 0 },
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);

export const ProjectSchema = scoped(
  new Schema(
    {
      tenantId: tenantRef,
      name: { type: String, required: true },
      slug: { type: String, required: true },
      developer: { type: String, default: '' },
      city: { type: String, required: true },
      locality: { type: String, default: '' },
      status: { type: String, enum: ['pre-launch', 'under-construction', 'ready-to-move'], required: true },
      possession: { type: String, default: '' },
      startingPrice: { type: Number, required: true },
      configurations: { type: String, default: '' },
      image: { type: String, required: true },
      summary: { type: String, default: '' },
      featured: { type: Boolean, default: false },
      order: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
);
ProjectSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

export const LocationSchema = scoped(
  new Schema(
    {
      tenantId: tenantRef,
      name: { type: String, required: true },
      city: { type: String, required: true },
      slug: { type: String, required: true },
      image: { type: String, required: true },
      blurb: { type: String, default: '' },
      order: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
);
LocationSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

export const TestimonialSchema = scoped(
  new Schema(
    {
      tenantId: tenantRef,
      quote: { type: String, required: true, maxlength: 600 },
      author: { type: String, required: true },
      context: { type: String, default: '' },
      rating: { type: Number, min: 1, max: 5, default: 5 },
      published: { type: Boolean, default: true },
      order: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
);

export const ArticleSchema = scoped(
  new Schema(
    {
      tenantId: tenantRef,
      title: { type: String, required: true },
      slug: { type: String, required: true },
      excerpt: { type: String, default: '' },
      body: { type: String, default: '' },
      category: { type: String, default: 'Guide' },
      image: { type: String, default: '' },
      imageAlt: { type: String, default: '' },
      readMinutes: { type: Number, default: 5 },
      status: { type: String, enum: ['draft', 'published'], default: 'draft' },
      publishedAt: { type: Date, default: null },
      /** Advisor profile shown as the byline. */
      authorId: { type: Schema.Types.ObjectId, default: null },
      seoTitle: { type: String, default: '' },
      seoDescription: { type: String, default: '' },
      createdBy: { type: Schema.Types.ObjectId, default: null },
      updatedBy: { type: Schema.Types.ObjectId, default: null },
    },
    { timestamps: true },
  ),
);
ArticleSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
ArticleSchema.index({ tenantId: 1, status: 1, publishedAt: -1 });

/** Every publish stores a full snapshot, so any earlier version can be restored into the draft. */
export const SiteVersionSchema = scoped(
  new Schema(
    {
      tenantId: tenantRef,
      version: { type: Number, required: true },
      snapshot: { type: Schema.Types.Mixed, required: true }, // { settings, theme, homepage }
      note: { type: String, default: '', maxlength: 200 },
      publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      publishedByName: { type: String, default: '' },
      changed: { type: [String], default: [] },
    },
    { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
  ),
);
SiteVersionSchema.index({ tenantId: 1, version: -1 }, { unique: true });
