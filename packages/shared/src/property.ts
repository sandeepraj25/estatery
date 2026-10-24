import { z } from 'zod';

/**
 * Property domain contracts shared by the API (validation) and the web app (types + URL parsing).
 * Keep enums here so the admin panel, public filters and database schema can never drift apart.
 */

export const LISTING_TYPES = ['sale', 'rent'] as const;
export const PROPERTY_CATEGORIES = ['residential', 'commercial'] as const;
export const PROPERTY_TYPES = [
  'apartment',
  'villa',
  'penthouse',
  'independent-house',
  'plot',
  'office',
  'retail',
] as const;
/** Lifecycle of a listing. Only `published`, `sold` and `rented` are ever visible publicly. */
export const PROPERTY_STATUSES = ['draft', 'published', 'sold', 'rented', 'archived'] as const;
export const PUBLIC_PROPERTY_STATUSES = ['published', 'sold', 'rented'] as const;
export const PROPERTY_SORTS = ['relevance', 'newest', 'price-asc', 'price-desc', 'area-desc'] as const;

export type ListingType = (typeof LISTING_TYPES)[number];
export type PropertyCategory = (typeof PROPERTY_CATEGORIES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type PropertySort = (typeof PROPERTY_SORTS)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  penthouse: 'Penthouse',
  'independent-house': 'Independent House',
  plot: 'Plot',
  office: 'Office',
  retail: 'Retail',
};

/** Coerces "" and missing query values to undefined so empty form fields don't fail validation. */
const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().finite().nonnegative().optional(),
);
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(values).optional());

/**
 * Public search query. Used by GET /v1/properties and by the web app to parse URL search params.
 * Every field is optional and bounded so the endpoint can't be abused with huge page sizes.
 */
export const propertyQuerySchema = z
  .object({
    q: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(80).optional()),
    city: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(60).optional()),
    listingType: optionalEnum(LISTING_TYPES),
    category: optionalEnum(PROPERTY_CATEGORIES),
    type: optionalEnum(PROPERTY_TYPES),
    minPrice: optionalNumber,
    maxPrice: optionalNumber,
    bhk: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z.number().int().min(1).max(10).optional(),
    ),
    featured: z.preprocess((v) => (v === 'true' || v === true ? true : undefined), z.boolean().optional()),
    project: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(80).optional()),
    /** Comma-separated listing ids (saved homes / compare). */
    ids: z.preprocess(
      (v) => (typeof v === 'string' && v !== '' ? v.split(',') : undefined),
      z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(48).optional(),
    ),
    sort: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PROPERTY_SORTS).default('relevance')),
    page: z.preprocess((v) => (v === undefined || v === '' ? 1 : Number(v)), z.number().int().min(1).max(500)),
    limit: z.preprocess((v) => (v === undefined || v === '' ? 12 : Number(v)), z.number().int().min(1).max(48)),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice must be less than or equal to maxPrice',
    path: ['minPrice'],
  });

export type PropertyQuery = z.infer<typeof propertyQuerySchema>;

export interface PropertyImage {
  url: string;
  alt: string;
}

export interface PropertyAgentSummary {
  id: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  photoUrl: string;
}

/** Shape returned by the public API. Never includes internal-only fields (notes, owner contact, etc.). */
export interface PublicProperty {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  listingType: ListingType;
  category: PropertyCategory;
  type: PropertyType;
  status: PropertyStatus;
  price: number;
  /** For rentals, price is per month. */
  priceUnit: 'total' | 'month';
  currency: string;
  bhk: number | null;
  bathrooms: number | null;
  areaSqft: number;
  location: {
    locality: string;
    city: string;
    state: string;
    lat: number | null;
    lng: number | null;
  };
  amenities: string[];
  images: PropertyImage[];
  badges: { featured: boolean; verified: boolean; isNew: boolean };
  project: { name: string; slug: string } | null;
  agent: PropertyAgentSummary | null;
  publishedAt: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
