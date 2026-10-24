import type { HomeSection } from '@estatery/shared';
import { getHomeBundle, type HomeBundle } from '@/lib/api';
import { AboutSection } from '@/components/sections/about-section';
import { AgentsSection } from '@/components/sections/agents-section';
import { CategoriesSection } from '@/components/sections/categories-section';
import { CollectionsSection } from '@/components/sections/collections-section';
import { FeaturedSection } from '@/components/sections/featured-section';
import { HeroSection } from '@/components/sections/hero-section';
import { InsightsSection } from '@/components/sections/insights-section';
import { LeadSection } from '@/components/sections/lead-section';
import { LocationsSection } from '@/components/sections/locations-section';
import { ProjectsSection } from '@/components/sections/projects-section';
import { SearchSection } from '@/components/sections/search-section';
import { TestimonialsSection } from '@/components/sections/testimonials-section';

export const dynamic = 'force-dynamic';

/**
 * The homepage is data-driven: the tenant's published page document decides which sections
 * appear and in what order. Each section type maps to one reusable component.
 */
function renderSection(section: HomeSection, bundle: HomeBundle, prev: HomeSection | undefined) {
  const { settings } = bundle.config;
  switch (section.type) {
    case 'hero':
      // Only the two annotation cards' fields are sent to the client component.
      return <HeroSection data={section.data} highlights={bundle.featured.slice(0, 2).map((p) => ({ ...p, description: '', summary: '', amenities: [], images: [], agent: null }))} />;
    case 'search':
      return <SearchSection data={section.data} cities={bundle.cities} docked={prev?.type === 'hero'} />;
    case 'featured':
      return <FeaturedSection data={section.data} properties={bundle.featured} />;
    case 'locations':
      return <LocationsSection data={section.data} locations={bundle.locations} />;
    case 'projects':
      return <ProjectsSection data={section.data} projects={bundle.projects} />;
    case 'categories':
      return <CategoriesSection data={section.data} />;
    case 'about':
      return <AboutSection data={section.data} />;
    case 'collections':
      return <CollectionsSection data={section.data} />;
    case 'agents':
      return <AgentsSection data={section.data} agents={bundle.agents} />;
    case 'testimonials':
      return <TestimonialsSection data={section.data} testimonials={bundle.testimonials} />;
    case 'insights':
      return <InsightsSection data={section.data} articles={bundle.articles} />;
    case 'lead':
      return <LeadSection data={section.data} settings={settings} />;
  }
}

export default async function HomePage() {
  const bundle = await getHomeBundle();
  const sections = bundle.config.homepage.sections.filter((s) => s.enabled);
  const { settings } = bundle.config;

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: settings.businessName,
    description: settings.tagline,
    telephone: settings.contact.phone,
    email: settings.contact.email,
    address: settings.contact.address,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd).replace(/</g, '\\u003c') }} />
      {sections.map((s, i) => (
        <div key={s.id} data-section={s.type}>{renderSection(s, bundle, sections[i - 1])}</div>
      ))}
    </>
  );
}
