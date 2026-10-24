import { notFound } from 'next/navigation';

/** Renders unknown public URLs inside the site layout (with header and footer). */
export default function Missing() {
  notFound();
}
