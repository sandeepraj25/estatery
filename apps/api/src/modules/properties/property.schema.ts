import { Schema, type Types } from 'mongoose';
import { LISTING_TYPES, PROPERTY_CATEGORIES, PROPERTY_STATUSES, PROPERTY_TYPES } from '@estatery/shared';
import { tenantScopePlugin } from '../../common/tenancy/tenant-scope.plugin.js';

const ImageSchema = new Schema({ url: { type: String, required: true }, alt: { type: String, default: '' } }, { _id: false });

export const PropertySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    slug: { type: String, required: true, lowercase: true, trim: true, match: /^[a-z0-9-]{3,120}$/ },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    summary: { type: String, default: '', maxlength: 240 },
    description: { type: String, default: '', maxlength: 8000 },
    listingType: { type: String, enum: LISTING_TYPES, required: true },
    category: { type: String, enum: PROPERTY_CATEGORIES, required: true },
    type: { type: String, enum: PROPERTY_TYPES, required: true },
    status: { type: String, enum: PROPERTY_STATUSES, default: 'draft' },
    price: { type: Number, required: true, min: 0 },
    priceUnit: { type: String, enum: ['total', 'month'], default: 'total' },
    currency: { type: String, default: 'INR' },
    bhk: { type: Number, default: null, min: 0, max: 20 },
    bathrooms: { type: Number, default: null, min: 0, max: 20 },
    areaSqft: { type: Number, required: true, min: 1 },
    location: {
      locality: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, default: '' },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    amenities: { type: [String], default: [] },
    images: { type: [ImageSchema], default: [] },
    featured: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', default: null },
    publishedAt: { type: Date, default: null },
    /** Old URLs keep working: requests for a previous slug redirect to the current one. */
    previousSlugs: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

PropertySchema.plugin(tenantScopePlugin);
// Slugs are unique per tenant, not globally: two agencies can both have "sea-view-apartment".
PropertySchema.index({ tenantId: 1, slug: 1 }, { unique: true });
// Serves the default public listing (visible statuses, featured first, newest first).
PropertySchema.index({ tenantId: 1, status: 1, featured: -1, publishedAt: -1 });
// Serves the most common filter combination from the hero search.
PropertySchema.index({ tenantId: 1, 'location.city': 1, listingType: 1, price: 1 });
PropertySchema.index({ tenantId: 1, projectId: 1 });
PropertySchema.index({ tenantId: 1, previousSlugs: 1 });

/** Explicit document type (InferSchemaType is very expensive for the type checker on large schemas). */
export interface PropertyDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  slug: string;
  title: string;
  summary: string;
  description: string;
  listingType: string;
  category: string;
  type: string;
  status: string;
  price: number;
  priceUnit: string;
  currency: string;
  bhk: number | null;
  bathrooms: number | null;
  areaSqft: number;
  location: { locality: string; city: string; state: string; lat: number | null; lng: number | null };
  amenities: string[];
  images: Array<{ url: string; alt: string }>;
  featured: boolean;
  verified: boolean;
  projectId: Types.ObjectId | null;
  agentId: Types.ObjectId | null;
  publishedAt: Date | null;
  previousSlugs: string[];
  createdAt: Date;
  updatedAt: Date;
}
