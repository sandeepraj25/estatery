import type { Homepage, SiteSettings } from '@estatery/shared';

/**
 * Development seed content. Two independent agencies on one platform demonstrate white-labelling
 * and isolation: Aurelia (luxury, forest/champagne) and Banyan (mid-market, midnight/terracotta).
 * Image URLs point at Unsplash; production tenants upload their own media.
 */
export const img = (id: string, w = 1600) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const IMG = {
  villaGlass: '1600596542815-ffad4c1539a9',
  villaDusk: '1600585154340-be6161a56a0c',
  villaPool: '1613490493576-7fde63acd811',
  villaPool2: '1512917774080-9991f1c4c750',
  modernHouse: '1580587771525-78b9dba3b914',
  classicHouse: '1564013799919-ab600027ffc6',
  whiteHouse: '1600047509807-ba8f99d2cdde',
  hillHouse: '1605276374104-dee2a0ed3cd6',
  suburban: '1570129477492-45c003edd2be',
  resortVilla: '1613977257363-707ba9348227',
  livingWarm: '1600607687939-ce8a6c25118c',
  livingLight: '1600566753190-17f0baa2a6c3',
  apartmentInterior: '1502672260266-1c1ef2d93688',
  livingOpen: '1600210492486-724fe5c67fb0',
  bedroom: '1616594039964-ae9021a400a0',
  kitchen: '1600573472550-8090b5e0745e',
  tower: '1545324418-cc1a3fa10c00',
  officeTower: '1486406146926-c627a92ad1ab',
  glassBuilding: '1582268611958-ebfd161ef9cf',
  apartments: '1460317442991-0ec209397118',
  officeInterior: '1497366216548-37526070297c',
  mumbai: '1529253355930-ddbe423a2ac7',
  bengaluru: '1596176530529-78163a4f7af2',
  goa: '1512343879784-a960bf40e7f2',
  delhi: '1587474260584-136574528ed5',
} as const;

export const PORTRAITS = [
  '1507003211169-0a1dd7228f2d',
  '1494790108377-be9c29b29330',
  '1500648767791-00dcc994a43e',
  '1438761681033-6461ffad8d80',
  '1472099645785-5658abf4ff4e',
];

export const CR = 10_000_000; // 1 crore
export const L = 100_000; // 1 lakh

export interface SeedProperty {
  slug: string;
  title: string;
  summary: string;
  description: string;
  listingType: 'sale' | 'rent';
  category: 'residential' | 'commercial';
  type: 'apartment' | 'villa' | 'penthouse' | 'independent-house' | 'plot' | 'office' | 'retail';
  status: 'draft' | 'published' | 'sold' | 'rented' | 'archived';
  price: number;
  priceUnit?: 'total' | 'month';
  bhk: number | null;
  bathrooms: number | null;
  areaSqft: number;
  locality: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  amenities: string[];
  images: Array<keyof typeof IMG>;
  featured?: boolean;
  verified?: boolean;
  project?: string;
  agent: number;
  daysAgo: number;
}

const LUX_AMENITIES = ['Private pool', 'Home automation', 'Concierge', 'Clubhouse', 'Gym', 'EV charging', 'Power backup', '24×7 security'];

export const AURELIA_PROPERTIES: SeedProperty[] = [
  {
    slug: 'the-glasshouse-alibaug',
    title: 'The Glasshouse, Alibaug',
    summary: 'A cantilevered glass villa on two acres of mango orchard, minutes from the jetty.',
    description:
      'Designed around a central courtyard, The Glasshouse opens entirely to the landscape. Floor-to-ceiling glazing, a 25-metre infinity pool and a pavilion-style living room give the home a calm, resort-like rhythm. Five en-suite bedrooms, a home theatre, staff quarters and a separate guest cottage complete the estate.',
    listingType: 'sale', category: 'residential', type: 'villa', status: 'published',
    price: 24.5 * CR, bhk: 5, bathrooms: 6, areaSqft: 9200,
    locality: 'Awas', city: 'Alibaug', state: 'Maharashtra', lat: 18.7128, lng: 72.8667,
    amenities: [...LUX_AMENITIES, 'Orchard', 'Guest cottage'],
    images: ['villaGlass', 'livingWarm', 'villaPool', 'bedroom'], featured: true, verified: true, agent: 0, daysAgo: 4,
  },
  {
    slug: 'sky-residence-worli',
    title: 'Sky Residence at Worli Sea Face',
    summary: 'Full-floor penthouse with 270° views of the Arabian Sea and the Sea Link.',
    description:
      'Occupying the entire 52nd floor, this penthouse pairs sweeping sea views with a private elevator lobby, a double-height living room and a wraparound deck. Interiors by a celebrated Mumbai studio feature Italian marble, oak joinery and a chef’s kitchen.',
    listingType: 'sale', category: 'residential', type: 'penthouse', status: 'published',
    price: 68 * CR, bhk: 4, bathrooms: 5, areaSqft: 7400,
    locality: 'Worli', city: 'Mumbai', state: 'Maharashtra', lat: 19.0176, lng: 72.8175,
    amenities: ['Private lift', 'Sea view', 'Concierge', 'Spa', 'Gym', 'Valet parking'],
    images: ['tower', 'livingOpen', 'kitchen', 'bedroom'], featured: true, verified: true, project: 'aurelia-sea-crest', agent: 1, daysAgo: 9,
  },
  {
    slug: 'palm-court-villa-assagao',
    title: 'Palm Court Villa, Assagao',
    summary: 'Portuguese-inspired villa with a courtyard pool, ten minutes from Vagator.',
    description:
      'Laterite stone walls, terracotta roofs and deep verandahs frame a shaded central pool. Four bedrooms open onto private gardens, and a rooftop deck looks over the paddy fields towards the hills.',
    listingType: 'sale', category: 'residential', type: 'villa', status: 'published',
    price: 9.75 * CR, bhk: 4, bathrooms: 4, areaSqft: 4800,
    locality: 'Assagao', city: 'Goa', state: 'Goa', lat: 15.5937, lng: 73.7676,
    amenities: ['Private pool', 'Garden', 'Rooftop deck', 'Staff room', 'Power backup'],
    images: ['resortVilla', 'livingLight', 'villaPool2'], featured: true, verified: true, agent: 2, daysAgo: 2,
  },
  {
    slug: 'linden-house-sadashivnagar',
    title: 'Linden House, Sadashivnagar',
    summary: 'A quiet, tree-lined independent home with a private library and garden.',
    description:
      'Set on a 6,000 sq ft plot in one of Bengaluru’s most established neighbourhoods, Linden House balances heritage calm with modern comfort: a double-height library, a sunken courtyard and a landscaped rear garden.',
    listingType: 'sale', category: 'residential', type: 'independent-house', status: 'published',
    price: 32 * CR, bhk: 5, bathrooms: 5, areaSqft: 8100,
    locality: 'Sadashivnagar', city: 'Bengaluru', state: 'Karnataka', lat: 13.0068, lng: 77.5813,
    amenities: ['Garden', 'Library', 'Home automation', 'Solar', 'Power backup', 'Staff quarters'],
    images: ['whiteHouse', 'livingWarm', 'kitchen'], featured: true, verified: true, agent: 3, daysAgo: 30,
  },
  {
    slug: 'aralias-golf-view-residence',
    title: 'Golf View Residence, DLF Phase 5',
    summary: 'Four-bedroom residence overlooking the 18th fairway of the Golf Links.',
    description:
      'A generously planned residence in a low-density tower with uninterrupted golf course views, a private deck and club membership options.',
    listingType: 'sale', category: 'residential', type: 'apartment', status: 'published',
    price: 18.2 * CR, bhk: 4, bathrooms: 5, areaSqft: 6200,
    locality: 'DLF Phase 5', city: 'Gurugram', state: 'Haryana', lat: 28.4472, lng: 77.1004,
    amenities: ['Golf view', 'Clubhouse', 'Spa', 'Concierge', 'Gym', '24×7 security'],
    images: ['glassBuilding', 'livingOpen', 'bedroom'], featured: true, verified: true, agent: 4, daysAgo: 12,
  },
  {
    slug: 'koregaon-park-garden-duplex',
    title: 'Garden Duplex, Koregaon Park',
    summary: 'A light-filled duplex with a private garden in a boutique building of eight homes.',
    description:
      'Two levels of open-plan living wrap around a private lawn. The duplex includes a study, a family lounge and two covered parking bays.',
    listingType: 'sale', category: 'residential', type: 'apartment', status: 'published',
    price: 6.4 * CR, bhk: 3, bathrooms: 4, areaSqft: 3400,
    locality: 'Koregaon Park', city: 'Pune', state: 'Maharashtra', lat: 18.5362, lng: 73.8939,
    amenities: ['Private garden', 'Gym', 'Power backup', 'EV charging'],
    images: ['modernHouse', 'livingLight', 'apartmentInterior'], featured: true, agent: 2, daysAgo: 6,
  },
  {
    slug: 'bandra-sea-breeze-apartment',
    title: 'Sea Breeze Apartment, Bandstand',
    summary: 'Furnished three-bedroom home a short walk from the Bandstand promenade.',
    description: 'A refined rental with sea glimpses, designer furniture, and a dedicated workspace. Available for a minimum 11-month lease.',
    listingType: 'rent', category: 'residential', type: 'apartment', status: 'published',
    price: 3.2 * L, priceUnit: 'month', bhk: 3, bathrooms: 3, areaSqft: 1850,
    locality: 'Bandra West', city: 'Mumbai', state: 'Maharashtra', lat: 19.0544, lng: 72.8237,
    amenities: ['Furnished', 'Sea view', 'Gym', 'Power backup'],
    images: ['apartmentInterior', 'livingOpen', 'bedroom'], verified: true, agent: 1, daysAgo: 3,
  },
  {
    slug: 'indiranagar-designer-flat',
    title: 'Designer Flat, Indiranagar',
    summary: 'Two-bedroom apartment off 100 Feet Road with a wraparound balcony.',
    description: 'A bright, well-located rental with modular kitchen, wardrobes and two covered parking slots.',
    listingType: 'rent', category: 'residential', type: 'apartment', status: 'published',
    price: 95_000, priceUnit: 'month', bhk: 2, bathrooms: 2, areaSqft: 1350,
    locality: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', lat: 12.9784, lng: 77.6408,
    amenities: ['Semi-furnished', 'Balcony', 'Power backup', 'Lift'],
    images: ['livingLight', 'kitchen'], agent: 3, daysAgo: 1,
  },
  {
    slug: 'bkc-grade-a-office-floor',
    title: 'Grade-A Office Floor, BKC',
    summary: 'Plug-and-play 12,000 sq ft floor plate with 60 workstations and boardrooms.',
    description: 'LEED Platinum building with excellent connectivity to the Western Express Highway and the upcoming metro line.',
    listingType: 'rent', category: 'commercial', type: 'office', status: 'published',
    price: 32 * L, priceUnit: 'month', bhk: null, bathrooms: 4, areaSqft: 12000,
    locality: 'Bandra Kurla Complex', city: 'Mumbai', state: 'Maharashtra', lat: 19.0662, lng: 72.8679,
    amenities: ['Furnished', 'Cafeteria', 'Parking', 'Power backup', 'LEED Platinum'],
    images: ['officeTower', 'officeInterior'], verified: true, agent: 0, daysAgo: 14,
  },
  {
    slug: 'golf-course-road-retail',
    title: 'High-Street Retail, Golf Course Road',
    summary: 'Double-height corner retail frontage in a premium mixed-use development.',
    description: 'Ideal for flagship retail or F&B, with 40 ft of glazed frontage and dedicated service access.',
    listingType: 'sale', category: 'commercial', type: 'retail', status: 'published',
    price: 14 * CR, bhk: null, bathrooms: 2, areaSqft: 3100,
    locality: 'Golf Course Road', city: 'Gurugram', state: 'Haryana', lat: 28.4525, lng: 77.0965,
    amenities: ['Corner unit', 'Double height', 'Parking', 'Power backup'],
    images: ['glassBuilding', 'officeInterior'], agent: 4, daysAgo: 40,
  },
  {
    slug: 'sunset-villa-candolim',
    title: 'Sunset Villa, Candolim',
    summary: 'Recently sold: three-bedroom villa moments from the beach.',
    description: 'A charming villa with a plunge pool and sunset deck.',
    listingType: 'sale', category: 'residential', type: 'villa', status: 'sold',
    price: 5.9 * CR, bhk: 3, bathrooms: 3, areaSqft: 2900,
    locality: 'Candolim', city: 'Goa', state: 'Goa', lat: 15.5185, lng: 73.7623,
    amenities: ['Plunge pool', 'Garden'],
    images: ['villaPool2', 'livingWarm'], agent: 2, daysAgo: 60,
  },
  {
    slug: 'sea-crest-3bhk-residence',
    title: 'Sea Crest 3 BHK Residence',
    summary: 'Pre-launch pricing on 3-bedroom residences at Aurelia Sea Crest.',
    description: 'Contemporary three-bedroom homes with a deck, in a 58-storey tower designed with generous floor-to-ceiling heights.',
    listingType: 'sale', category: 'residential', type: 'apartment', status: 'published',
    price: 11.5 * CR, bhk: 3, bathrooms: 3, areaSqft: 2650,
    locality: 'Worli', city: 'Mumbai', state: 'Maharashtra', lat: 19.0145, lng: 72.8162,
    amenities: ['Sea view', 'Clubhouse', 'Spa', 'Gym', 'Concierge'],
    images: ['tower', 'livingLight'], project: 'aurelia-sea-crest', agent: 1, daysAgo: 5,
  },
  {
    slug: 'whitefield-family-villa',
    title: 'Family Villa, Whitefield',
    summary: 'Four-bedroom villa in a gated community with a clubhouse and schools nearby.',
    description: 'A practical, well-built home with a private garden and access to a 30,000 sq ft clubhouse.',
    listingType: 'sale', category: 'residential', type: 'villa', status: 'published',
    price: 4.25 * CR, bhk: 4, bathrooms: 4, areaSqft: 3600,
    locality: 'Whitefield', city: 'Bengaluru', state: 'Karnataka', lat: 12.9698, lng: 77.75,
    amenities: ['Clubhouse', 'Garden', 'Gym', 'Power backup', '24×7 security'],
    images: ['suburban', 'livingWarm'], project: 'aurelia-the-groves', agent: 3, daysAgo: 18,
  },
  {
    slug: 'draft-coastal-plot-kashid',
    title: 'Coastal Plot, Kashid (Draft)',
    summary: 'Unpublished draft listing. Must never appear on the public site.',
    description: 'Draft.',
    listingType: 'sale', category: 'residential', type: 'plot', status: 'draft',
    price: 3 * CR, bhk: null, bathrooms: null, areaSqft: 21780,
    locality: 'Kashid', city: 'Alibaug', state: 'Maharashtra', lat: 18.43, lng: 72.9,
    amenities: [], images: ['hillHouse'], agent: 0, daysAgo: 1,
  },
];

export const BANYAN_PROPERTIES: SeedProperty[] = [
  {
    slug: 'banyan-greens-2bhk',
    title: 'Banyan Greens 2 BHK',
    summary: 'Efficient two-bedroom homes near the metro in Noida Sector 150.',
    description: 'Ready-to-move apartments with a large central park.',
    listingType: 'sale', category: 'residential', type: 'apartment', status: 'published',
    price: 1.15 * CR, bhk: 2, bathrooms: 2, areaSqft: 1150,
    locality: 'Sector 150', city: 'Noida', state: 'Uttar Pradesh', lat: 28.4089, lng: 77.4818,
    amenities: ['Park', 'Gym', 'Lift'], images: ['apartments', 'apartmentInterior'], featured: true, verified: true, agent: 0, daysAgo: 3,
  },
  {
    slug: 'dwarka-family-flat',
    title: 'Family Flat, Dwarka Sector 12',
    summary: 'Three-bedroom DDA flat close to schools and the Blue Line.',
    description: 'Well maintained, east-facing home.',
    listingType: 'sale', category: 'residential', type: 'apartment', status: 'published',
    price: 1.65 * CR, bhk: 3, bathrooms: 2, areaSqft: 1450,
    locality: 'Dwarka', city: 'New Delhi', state: 'Delhi', lat: 28.5921, lng: 77.046,
    amenities: ['Parking', 'Lift'], images: ['suburban', 'livingLight'], featured: true, agent: 1, daysAgo: 8,
  },
  {
    slug: 'greater-kailash-rental',
    title: 'Builder Floor, Greater Kailash II',
    summary: 'Spacious builder floor available on lease.',
    description: 'Three bedrooms, terrace access, two parking spaces.',
    listingType: 'rent', category: 'residential', type: 'independent-house', status: 'published',
    price: 1.1 * L, priceUnit: 'month', bhk: 3, bathrooms: 3, areaSqft: 2100,
    locality: 'Greater Kailash II', city: 'New Delhi', state: 'Delhi', lat: 28.5355, lng: 77.2425,
    amenities: ['Terrace', 'Parking'], images: ['classicHouse', 'kitchen'], featured: true, agent: 0, daysAgo: 2,
  },
];

const nav = [
  { label: 'Buy', href: '/properties?listingType=sale' },
  { label: 'Rent', href: '/properties?listingType=rent' },
  { label: 'Projects', href: '/#projects' },
  { label: 'Commercial', href: '/properties?category=commercial' },
  { label: 'Insights', href: '/insights' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export function aureliaSettings(): SiteSettings {
  return {
    businessName: 'Aurelia Estates',
    tagline: 'Private real estate advisory for exceptional homes.',
    logoText: 'Aurelia',
    logoUrl: null,
    contact: {
      phone: '+91 22 4000 7788',
      whatsapp: '+91 98200 07788',
      email: 'concierge@aurelia.example',
      address: '14th Floor, One Lodha Place, Lower Parel, Mumbai 400013',
      hours: 'Mon–Sat, 10:00–19:00 IST',
    },
    social: [
      { network: 'instagram', href: 'https://instagram.com' },
      { network: 'linkedin', href: 'https://linkedin.com' },
      { network: 'youtube', href: 'https://youtube.com' },
    ],
    navigation: nav,
    footerColumns: [
      {
        title: 'Discover',
        links: [
          { label: 'Homes for sale', href: '/properties?listingType=sale' },
          { label: 'Homes for rent', href: '/properties?listingType=rent' },
          { label: 'Villas', href: '/properties?type=villa' },
          { label: 'Penthouses', href: '/properties?type=penthouse' },
          { label: 'Commercial', href: '/properties?category=commercial' },
        ],
      },
      {
        title: 'Cities',
        links: [
          { label: 'Mumbai', href: '/properties?city=Mumbai' },
          { label: 'Bengaluru', href: '/properties?city=Bengaluru' },
          { label: 'Goa', href: '/properties?city=Goa' },
          { label: 'Gurugram', href: '/properties?city=Gurugram' },
        ],
      },
      {
        title: 'Company',
        links: [
          { label: 'About us', href: '/about' },
          { label: 'Our advisors', href: '/about#advisors' },
          { label: 'Insights', href: '/insights' },
          { label: 'FAQ', href: '/faq' },
          { label: 'Contact', href: '/contact' },
        ],
      },
    ],
    locale: 'en-IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    seo: {
      title: 'Aurelia Estates — Luxury Homes in Mumbai, Goa & Bengaluru',
      description: 'Discover exceptional villas, penthouses and residences across India with private, discreet advisory from Aurelia Estates.',
      ogImage: img(IMG.villaGlass, 1200),
    },
    showPlatformBranding: true,
  };
}

export function aureliaHomepage(): Homepage {
  return {
    sections: [
      {
        id: 'hero', type: 'hero', enabled: true,
        data: {
          eyebrow: 'Private Real Estate Advisory',
          headline: 'Find a Place Beyond Ordinary.',
          accentWords: 'Beyond Ordinary.',
          subheadline: 'Discover exceptional homes, remarkable architecture, and properties designed around the way you want to live.',
          primaryCta: { label: 'Explore Properties', href: '/properties' },
          secondaryCta: { label: 'Discover Our Projects', href: '/#projects' },
          backgroundImage: img(IMG.villaDusk, 2400),
          scene: { enabled: true, variant: 'pavilion', fallbackImage: img(IMG.villaDusk, 2000) },
          showFloatingCards: true,
        },
      },
      {
        id: 'search', type: 'search', enabled: true,
        data: {
          title: 'Every listing visited and verified by our advisors',
          popularSearches: [
            { label: 'Sea-view penthouses', href: '/properties?type=penthouse&city=Mumbai' },
            { label: 'Villas in Goa', href: '/properties?type=villa&city=Goa' },
            { label: 'Rentals in Bengaluru', href: '/properties?listingType=rent&city=Bengaluru' },
            { label: 'Office space', href: '/properties?category=commercial' },
          ],
        },
      },
      {
        id: 'featured', type: 'featured', enabled: true,
        data: {
          eyebrow: 'Featured Residences',
          title: 'Homes chosen for how they make you feel.',
          subtitle: 'A rotating edit of the most remarkable homes on the market, each personally visited by our advisors.',
          limit: 6,
          cta: { label: 'View all properties', href: '/properties' },
        },
      },
      {
        id: 'locations', type: 'locations', enabled: true,
        data: { eyebrow: 'Destinations', title: 'Explore by destination', subtitle: 'From sea-facing towers to hillside retreats — the addresses our clients ask for most.' },
      },
      {
        id: 'projects', type: 'projects', enabled: true,
        data: { eyebrow: 'Signature Developments', title: 'New projects, shaped by architects we trust.', subtitle: 'Early access to launches before they reach the open market.' },
      },
      {
        id: 'categories', type: 'categories', enabled: true,
        data: {
          eyebrow: 'Find Your Space',
          title: 'However you want to live, start here.',
          subtitle: '',
          items: [
            { label: 'Villas & Estates', description: 'Private land, gardens and pools.', href: '/properties?type=villa', image: img(IMG.villaPool, 1200) },
            { label: 'Penthouses', description: 'Full floors with skyline views.', href: '/properties?type=penthouse', image: img(IMG.livingOpen, 1200) },
            { label: 'City Apartments', description: 'Walkable, connected, effortless.', href: '/properties?type=apartment', image: img(IMG.apartmentInterior, 1200) },
            { label: 'Rentals', description: 'Furnished homes on flexible leases.', href: '/properties?listingType=rent', image: img(IMG.livingLight, 1200) },
            { label: 'Commercial', description: 'Offices and flagship retail.', href: '/properties?category=commercial', image: img(IMG.officeInterior, 1200) },
          ],
        },
      },
      {
        id: 'about', type: 'about', enabled: true,
        data: {
          eyebrow: 'About Aurelia',
          title: 'Quiet expertise for significant decisions.',
          subtitle: '',
          body:
            'For over fifteen years, Aurelia has advised families, founders and global Indians on the homes that matter most to them. We work with a small number of clients at a time, visit every property ourselves, and handle negotiation, legal diligence and handover end to end — so the process feels as considered as the home.',
          image: img(IMG.livingWarm, 1400),
          secondaryImage: img(IMG.hillHouse, 900),
          metrics: [
            { value: '₹4,800 Cr', label: 'in transactions advised' },
            { value: '15+', label: 'years in luxury real estate' },
            { value: '1,200', label: 'families placed' },
            { value: '98%', label: 'client referral rate' },
          ],
          cta: { label: 'Meet our advisors', href: '/#advisors' },
        },
      },
      {
        id: 'collections', type: 'collections', enabled: true,
        data: {
          eyebrow: 'Curated Collections',
          title: 'Edits for a particular kind of life.',
          subtitle: '',
          items: [
            { title: 'The Coastal Edit', description: 'Beach houses and sea-facing retreats from Alibaug to Assagao.', image: img(IMG.resortVilla, 1600), href: '/properties?city=Goa' },
            { title: 'Skyline Living', description: 'Penthouses and high-floor residences in Mumbai.', image: img(IMG.tower, 1200), href: '/properties?city=Mumbai&type=penthouse' },
            { title: 'Garden Homes', description: 'Independent houses with room to breathe.', image: img(IMG.whiteHouse, 1200), href: '/properties?type=independent-house' },
          ],
        },
      },
      { id: 'agents', type: 'agents', enabled: true, data: { eyebrow: 'Our Advisors', title: 'People who know every street.', subtitle: 'Each advisor specialises in a handful of neighbourhoods — and answers their own phone.' } },
      {
        id: 'testimonials', type: 'testimonials', enabled: true,
        data: {
          eyebrow: 'Client Stories', title: 'Trusted with life’s biggest moves.', subtitle: '',
          trust: [
            { value: '4.9/5', label: 'Google rating' },
            { value: 'RERA', label: 'registered advisors' },
            { value: '0', label: 'hidden fees' },
          ],
        },
      },
      { id: 'insights', type: 'insights', enabled: true, data: { eyebrow: 'Market Insights', title: 'Read the market before you move.', subtitle: '' } },
      {
        id: 'lead', type: 'lead', enabled: true,
        data: {
          eyebrow: 'Private Consultation',
          title: 'Tell us what home means to you.',
          subtitle: '',
          body: 'Share a few details and an advisor will call you within one working day with a shortlist — including homes that are not publicly listed.',
          image: img(IMG.villaPool2, 1600),
        },
      },
    ],
  };
}

export function banyanSettings(): SiteSettings {
  return {
    ...aureliaSettings(),
    businessName: 'Banyan & Co. Realty',
    tagline: 'Honest advice for first homes in the NCR.',
    logoText: 'Banyan & Co.',
    contact: { phone: '+91 11 4100 2200', whatsapp: '+91 98110 02200', email: 'hello@banyan.example', address: 'Connaught Place, New Delhi 110001', hours: 'Mon–Sun, 09:30–20:00 IST' },
    navigation: nav.filter((n) => !['Commercial', 'Insights', 'Projects'].includes(n.label)),
    seo: { title: 'Banyan & Co. Realty — Homes in Delhi NCR', description: 'Verified apartments and builder floors across Delhi, Noida and Gurugram.', ogImage: null },
  };
}

export function banyanHomepage(): Homepage {
  const base = aureliaHomepage();
  return {
    sections: base.sections
      .filter((s) => ['hero', 'search', 'featured', 'testimonials', 'lead'].includes(s.type))
      .map((s) => {
        if (s.type === 'hero') {
          return {
            ...s,
            data: {
              ...s.data,
              eyebrow: 'Delhi NCR Specialists',
              headline: 'Your first home, without the guesswork.',
              accentWords: 'without the guesswork.',
              subheadline: 'Verified listings, transparent pricing and an advisor who stays with you until handover.',
              backgroundImage: img(IMG.apartments, 2400),
              scene: { enabled: true, variant: 'cantilever' as const, fallbackImage: img(IMG.apartments, 2000) },
            },
          };
        }
        if (s.type === 'featured') return { ...s, data: { ...s.data, title: 'Fresh listings this week', limit: 3 } };
        return s;
      }),
  };
}
