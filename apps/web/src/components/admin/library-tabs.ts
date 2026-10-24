/** Content library tabs. Plain module so server pages can import it. */
export type Kind = 'agents' | 'testimonials' | 'locations' | 'projects';
export const LIBRARY_TABS: Array<{ kind: Kind; label: string }> = [
  { kind: 'agents', label: 'Advisors' },
  { kind: 'testimonials', label: 'Testimonials' },
  { kind: 'locations', label: 'Destinations' },
  { kind: 'projects', label: 'Projects' },
];
