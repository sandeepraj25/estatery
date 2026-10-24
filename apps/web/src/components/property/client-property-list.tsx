'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Paginated, PublicProperty } from '@estatery/shared';
import { useFavourites } from '@/lib/favourites';
import { readRecent } from '@/lib/recently-viewed';
import { PropertyCardClient } from './property-card-client';

/**
 * Lists stored in this browser: saved homes and recently viewed. Ids are resolved through the
 * API, so removed or unpublished listings simply drop out.
 */
export function ClientPropertyList({ source, excludeId, title }: { source: 'saved' | 'recent'; excludeId?: string; title?: string }) {
  const { ids: savedIds } = useFavourites();
  const [items, setItems] = useState<PublicProperty[] | null>(null);
  const [error, setError] = useState(false);

  const ids = source === 'saved' ? savedIds : null;
  const key = source === 'saved' ? savedIds.join(',') : 'recent';

  useEffect(() => {
    const list = (source === 'saved' ? ids ?? [] : readRecent()).filter((x) => x !== excludeId).slice(0, 48);
    if (list.length === 0) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/properties?ids=${list.join(',')}&limit=48`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Paginated<PublicProperty>) => {
        const order = new Map(list.map((id, i) => [id, i]));
        setItems([...d.items].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
      })
      .catch((e) => e.name !== 'AbortError' && setError(true));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, excludeId]);

  if (source === 'recent' && (!items || items.length === 0)) return null;

  return (
    <div>
      {title && <h2 className="font-heading text-2xl font-semibold">{title}</h2>}
      {error && <p className="mt-6 text-[var(--color-error)]">We couldn’t load these homes. Refresh the page to try again.</p>}
      {!items && !error && (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-96 animate-pulse rounded-[var(--radius-card)] bg-line/60" />)}
        </div>
      )}
      {items && items.length === 0 && source === 'saved' && (
        <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-line bg-white p-12 text-center">
          <p className="font-heading text-lg font-semibold">No saved homes yet</p>
          <p className="mt-2 text-muted">Tap the heart on any property to keep it here.</p>
          <Link href="/properties" className="btn btn-primary mt-6">Browse properties</Link>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => <li key={p.id}><PropertyCardClient property={p} /></li>)}
        </ul>
      )}
    </div>
  );
}
