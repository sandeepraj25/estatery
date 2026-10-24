import type { HomeSectionType } from '@estatery/shared';

/**
 * Field descriptions for each homepage section. The editor renders forms from these; the API
 * validates the result with the shared homepage schema, so specs only shape the UI.
 */
export type FieldSpec =
  | { k: string; label: string; kind: 'text' | 'textarea' | 'href'; hint?: string; max?: number; optional?: boolean }
  | { k: string; label: string; kind: 'number'; min: number; max: number; hint?: string }
  | { k: string; label: string; kind: 'image'; hint?: string }
  | { k: string; label: string; kind: 'toggle'; hint?: string }
  | { k: string; label: string; kind: 'richtext'; max: number; rows?: number; hint?: string }
  | { k: string; label: string; kind: 'date'; hint?: string }
  | { k: string; label: string; kind: 'select'; options: Array<{ value: string; label: string }>; hint?: string }
  | { k: string; label: string; kind: 'cta'; hint?: string }
  | { k: string; label: string; kind: 'group'; fields: FieldSpec[] }
  | { k: string; label: string; kind: 'list'; item: FieldSpec[]; min: number; max: number; itemLabel: string; blank: Record<string, unknown>; titleKey: string };

const heading: FieldSpec[] = [
  { k: 'eyebrow', label: 'Small line above the heading', kind: 'text', max: 60, optional: true },
  { k: 'title', label: 'Heading', kind: 'text', max: 120 },
  { k: 'subtitle', label: 'Supporting text', kind: 'textarea', max: 300, optional: true },
];
const LINK_HINT = 'A page on your site (e.g. /properties?city=Goa or /#contact) or a full https:// address.';

export const SECTION_META: Record<HomeSectionType, { label: string; description: string; fields: FieldSpec[] }> = {
  hero: {
    label: 'Hero',
    description: 'The first screen visitors see.',
    fields: [
      { k: 'eyebrow', label: 'Small line above the headline', kind: 'text', max: 60 },
      { k: 'headline', label: 'Headline', kind: 'text', max: 90 },
      { k: 'accentWords', label: 'Second line', kind: 'text', max: 40, optional: true, hint: 'If the headline ends with these words, they move onto their own softer line.' },
      { k: 'subheadline', label: 'Supporting text', kind: 'textarea', max: 240 },
      { k: 'primaryCta', label: 'Main button', kind: 'cta' },
      { k: 'secondaryCta', label: 'Second button', kind: 'cta' },
      { k: 'backgroundImage', label: 'Hero photo', kind: 'image', hint: 'Shown on phones and while the 3D scene loads. Use a wide photo, at least 2000px.' },
      {
        k: 'scene', label: '3D scene', kind: 'group', fields: [
          { k: 'enabled', label: 'Show the 3D residence on capable desktops', kind: 'toggle', hint: 'Phones, low-power devices and visitors who prefer reduced motion always see the photo.' },
          { k: 'variant', label: 'Architecture', kind: 'select', options: [{ value: 'pavilion', label: 'Pavilion — low glass villa' }, { value: 'cantilever', label: 'Cantilever — stacked volumes' }] },
          { k: 'fallbackImage', label: 'Still image behind the 3D scene', kind: 'image' },
        ],
      },
      { k: 'showFloatingCards', label: 'Show two featured listings beside the 3D scene', kind: 'toggle' },
    ],
  },
  search: {
    label: 'Property search',
    description: 'The search bar under the hero.',
    fields: [
      { k: 'title', label: 'Note beside the search', kind: 'text', max: 80, optional: true },
      { k: 'popularSearches', label: 'Popular searches', kind: 'list', min: 0, max: 8, itemLabel: 'search', titleKey: 'label', blank: { label: 'Villas in Goa', href: '/properties?type=villa&city=Goa' }, item: [
        { k: 'label', label: 'Label', kind: 'text', max: 40 },
        { k: 'href', label: 'Link', kind: 'href', hint: LINK_HINT },
      ] },
    ],
  },
  featured: {
    label: 'Featured listings',
    description: 'Listings marked “Featured”, newest first.',
    fields: [...heading, { k: 'limit', label: 'Number of listings', kind: 'number', min: 3, max: 9 }, { k: 'cta', label: 'Button', kind: 'cta' }],
  },
  locations: { label: 'Destinations', description: 'Your destinations from the content library.', fields: heading },
  projects: { label: 'New projects', description: 'Projects from the content library.', fields: heading },
  categories: {
    label: 'Find your space',
    description: 'Panels linking to property types.',
    fields: [...heading, { k: 'items', label: 'Panels', kind: 'list', min: 2, max: 6, itemLabel: 'panel', titleKey: 'label', blank: { label: 'Villas', description: 'Private land and pools.', href: '/properties?type=villa', image: '' }, item: [
      { k: 'label', label: 'Name', kind: 'text', max: 40 },
      { k: 'description', label: 'Short description', kind: 'text', max: 140 },
      { k: 'href', label: 'Link', kind: 'href', hint: LINK_HINT },
      { k: 'image', label: 'Photo', kind: 'image' },
    ] }],
  },
  about: {
    label: 'About the agency',
    description: 'Your story, two photos and up to four figures.',
    fields: [
      ...heading,
      { k: 'body', label: 'Story', kind: 'textarea', max: 900 },
      { k: 'image', label: 'Main photo', kind: 'image' },
      { k: 'secondaryImage', label: 'Small overlapping photo', kind: 'image' },
      { k: 'metrics', label: 'Figures', kind: 'list', min: 0, max: 4, itemLabel: 'figure', titleKey: 'value', blank: { value: '10+', label: 'years of experience' }, item: [
        { k: 'value', label: 'Figure', kind: 'text', max: 12 },
        { k: 'label', label: 'What it means', kind: 'text', max: 40 },
      ] },
      { k: 'cta', label: 'Button', kind: 'cta' },
    ],
  },
  collections: {
    label: 'Curated collections',
    description: 'Large image tiles that link to filtered searches.',
    fields: [...heading, { k: 'items', label: 'Collections', kind: 'list', min: 1, max: 5, itemLabel: 'collection', titleKey: 'title', blank: { title: 'New collection', description: '', image: '', href: '/properties' }, item: [
      { k: 'title', label: 'Name', kind: 'text', max: 60 },
      { k: 'description', label: 'Description', kind: 'text', max: 160 },
      { k: 'href', label: 'Link', kind: 'href', hint: LINK_HINT },
      { k: 'image', label: 'Photo', kind: 'image' },
    ] }],
  },
  agents: { label: 'Advisors', description: 'Active advisor profiles from the content library.', fields: heading },
  testimonials: {
    label: 'Client stories',
    description: 'Published testimonials, plus trust figures.',
    fields: [...heading, { k: 'trust', label: 'Trust figures', kind: 'list', min: 0, max: 4, itemLabel: 'figure', titleKey: 'value', blank: { value: '4.9/5', label: 'Google rating' }, item: [
      { k: 'value', label: 'Figure', kind: 'text', max: 12 },
      { k: 'label', label: 'What it means', kind: 'text', max: 40 },
    ] }],
  },
  insights: { label: 'Market insights', description: 'Your three latest articles.', fields: heading },
  lead: {
    label: 'Consultation form',
    description: 'The enquiry form near the end of the page.',
    fields: [...heading, { k: 'body', label: 'Text above the form', kind: 'textarea', max: 400 }, { k: 'image', label: 'Photo', kind: 'image' }],
  },
};
