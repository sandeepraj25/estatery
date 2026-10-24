import type { Homepage, SitePages, SiteSettings } from '@estatery/shared';
import { IMG, img } from '../../scripts/seed-data.js';

/**
 * The starting homepage for a new agency, and the "Reset to default" target in the editor.
 * Uses neutral platform stock imagery that each agency replaces with their own photos.
 */
export function defaultHomepage(businessName: string): Homepage {
  return {
    sections: [
      { id: 'hero', type: 'hero', enabled: true, data: {
        eyebrow: businessName, headline: 'Find a Place Beyond Ordinary.', accentWords: 'Beyond Ordinary.',
        subheadline: 'Discover exceptional homes, remarkable architecture, and properties designed around the way you want to live.',
        primaryCta: { label: 'Explore Properties', href: '/properties' }, secondaryCta: { label: 'Discover Our Projects', href: '/#projects' },
        backgroundImage: img(IMG.villaDusk, 2400), scene: { enabled: true, variant: 'pavilion', fallbackImage: img(IMG.villaDusk, 2000) }, showFloatingCards: true,
      } },
      { id: 'search', type: 'search', enabled: true, data: { title: 'Every listing visited and verified', popularSearches: [
        { label: 'Homes for sale', href: '/properties?listingType=sale' }, { label: 'Homes for rent', href: '/properties?listingType=rent' },
      ] } },
      { id: 'featured', type: 'featured', enabled: true, data: { eyebrow: 'Featured residences', title: 'Homes we’d move into ourselves.', subtitle: '', limit: 6, cta: { label: 'View all properties', href: '/properties' } } },
      { id: 'locations', type: 'locations', enabled: true, data: { eyebrow: 'Destinations', title: 'Explore by destination', subtitle: '' } },
      { id: 'projects', type: 'projects', enabled: true, data: { eyebrow: 'New projects', title: 'Launches worth knowing about.', subtitle: '' } },
      { id: 'categories', type: 'categories', enabled: true, data: { eyebrow: 'Find your space', title: 'However you want to live, start here.', subtitle: '', items: [
        { label: 'Villas', description: 'Private land, gardens and pools.', href: '/properties?type=villa', image: img(IMG.villaPool, 1200) },
        { label: 'Apartments', description: 'Walkable, connected, effortless.', href: '/properties?type=apartment', image: img(IMG.apartmentInterior, 1200) },
        { label: 'Rentals', description: 'Furnished homes on flexible leases.', href: '/properties?listingType=rent', image: img(IMG.livingLight, 1200) },
        { label: 'Commercial', description: 'Offices and retail.', href: '/properties?category=commercial', image: img(IMG.officeInterior, 1200) },
      ] } },
      { id: 'about', type: 'about', enabled: true, data: { eyebrow: `About ${businessName}`, title: 'Honest advice for important decisions.', subtitle: '',
        body: `${businessName} helps families and investors buy, sell and rent with clear advice, verified listings and support from first visit to handover.`,
        image: img(IMG.livingWarm, 1400), secondaryImage: img(IMG.hillHouse, 900), metrics: [], cta: { label: 'Talk to us', href: '/#contact' } } },
      { id: 'collections', type: 'collections', enabled: false, data: { eyebrow: 'Collections', title: 'Curated for a particular kind of life.', subtitle: '', items: [
        { title: 'Garden homes', description: 'Independent houses with room to breathe.', image: img(IMG.whiteHouse, 1200), href: '/properties?type=independent-house' },
      ] } },
      { id: 'agents', type: 'agents', enabled: true, data: { eyebrow: 'Our team', title: 'People who know every street.', subtitle: '' } },
      { id: 'testimonials', type: 'testimonials', enabled: true, data: { eyebrow: 'Client stories', title: 'Trusted with big moves.', subtitle: '', trust: [] } },
      { id: 'insights', type: 'insights', enabled: false, data: { eyebrow: 'Insights', title: 'Read the market before you move.', subtitle: '' } },
      { id: 'lead', type: 'lead', enabled: true, data: { eyebrow: 'Get in touch', title: 'Tell us what you’re looking for.', subtitle: '',
        body: 'Share a few details and an advisor will call you within one working day.', image: img(IMG.villaPool2, 1600) } },
    ],
  };
}

/**
 * Starting content for About, Contact, FAQ and the legal pages. The legal pages are a sensible
 * general template for an Indian real estate agency; the editor tells agencies to have them reviewed.
 */
export function defaultPages(s: Pick<SiteSettings, 'businessName' | 'contact'>): SitePages {
  const name = s.businessName;
  const today = new Date().toISOString().slice(0, 10);
  return {
    about: {
      enabled: true,
      title: `About ${name}`,
      intro: 'We help families and investors buy, sell and rent with clear advice and listings we have visited ourselves.',
      seoDescription: `Who we are at ${name}, how we work and the advisors you’ll meet.`,
      image: img(IMG.livingLight, 1800),
      body: [
        '## How we work',
        `${name} was founded on a simple idea: fewer, better options and honest advice. Every home we list has been visited by our team, and every price is checked against recent sales nearby.`,
        'We’d rather show you six homes that genuinely fit than sixty that almost do.',
        '## What you can expect',
        '- A single advisor from first call to handover',
        '- Documents checked before you commit, not after',
        '- Straight answers on price, timelines and charges',
        '## Talk to us',
        `Tell us what you’re looking for and we’ll come back within one working day. [Contact our team](/contact) or [browse current listings](/properties).`,
      ].join('\n\n'),
      highlights: [
        { value: '1:1', label: 'One advisor from search to handover' },
        { value: '100%', label: 'Listings visited by our team' },
      ],
      showAdvisors: true,
      showTestimonials: true,
    },
    contact: {
      enabled: true,
      title: 'Contact us',
      intro: 'Call, message or send an enquiry. An advisor replies within one working day.',
      seoDescription: `Phone, WhatsApp, email and office address for ${name}.`,
      showForm: true,
      body: 'Visits to our office are by appointment, so we can have the right advisor and documents ready for you.',
      mapUrl: '',
    },
    faq: {
      enabled: true,
      title: 'Frequently asked questions',
      intro: 'Short answers to what buyers, sellers and tenants ask us most.',
      seoDescription: `Answers to common questions about buying, selling and renting with ${name}.`,
      items: [
        { question: 'Do you charge buyers a fee?', answer: 'Our fee depends on the property and the service. We tell you the exact amount in writing before you visit any home, and there are no other charges.' },
        { question: 'Are the listings on your website verified?', answer: 'Yes. Our team visits every home before it is listed and checks ownership documents with the seller. Listings marked **Verified** have also passed a title check.' },
        { question: 'Can I book a site visit online?', answer: 'Yes. Open any listing and choose **Book a site visit**. Pick a preferred date and an advisor will confirm a time with you.' },
        { question: 'I live abroad. Can you help me buy?', answer: 'Yes. We regularly work with NRI buyers on video viewings, document checks, home loans and registration through a power of attorney.' },
        { question: 'How do I list my property with you?', answer: 'Send us a few details through the [contact page](/contact). An advisor will visit, suggest a realistic price and handle photos and viewings.' },
      ],
    },
    privacy: {
      enabled: true,
      title: 'Privacy policy',
      intro: `How ${name} collects and uses your personal data.`,
      seoDescription: `How ${name} handles personal data under India’s Digital Personal Data Protection Act, 2023.`,
      lastUpdated: today,
      body: [
        '## Who we are',
        `${name} (“we”) is responsible for the personal data described here. Contact us at ${s.contact.email || 'our office'} with any question about it.`,
        '## What we collect',
        '- Details you send us in an enquiry: your name, phone number, email address and message',
        '- Viewing preferences, such as a preferred visit date or budget',
        '- Basic technical information needed to run and secure this website',
        '## Why we use it',
        'We use your details only to respond to your enquiry, arrange viewings and help with your property search, sale or rental. We ask for your consent when you send an enquiry and you can withdraw it at any time.',
        '## Sharing',
        'We do not sell your data. We share it only with people who help us serve you — for example a property owner when you ask to view their home — or when the law requires it.',
        '## How long we keep it',
        'We keep enquiry details while we are helping you and for a reasonable period afterwards, then delete them unless the law requires us to keep them longer.',
        '## Your rights',
        `Under India’s Digital Personal Data Protection Act, 2023 you can ask to see, correct or erase your personal data, and to withdraw consent. Email ${s.contact.email || 'us'} and we will respond promptly.`,
      ].join('\n\n'),
    },
    terms: {
      enabled: true,
      title: 'Terms of use',
      intro: 'The rules for using this website.',
      seoDescription: `Terms for using the ${name} website.`,
      lastUpdated: today,
      body: [
        '## Information on this website',
        'We take care to keep listings accurate, but prices, availability and details can change and are confirmed only in a written agreement. Images may be representative. Please verify all details before making a decision.',
        '## No offer',
        'Nothing on this website is an offer or a contract. Any transaction is governed by the documents signed between the parties.',
        '## RERA',
        'Where a project must be registered under the Real Estate (Regulation and Development) Act, 2016, its registration number is shown on the listing or available on request.',
        '## Acceptable use',
        'Please don’t copy our listings or photographs for commercial use, try to disrupt the website, or submit false enquiries.',
        '## Contact',
        `Questions about these terms: ${s.contact.email || 'contact us through this website'}.`,
      ].join('\n\n'),
    },
  };
}
