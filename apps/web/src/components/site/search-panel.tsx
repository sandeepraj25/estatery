'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import type { ListingType } from '@estatery/shared';
import { BUDGETS, budgetKey, TYPE_OPTIONS } from '@/lib/search-options';
import { cn } from '@/lib/format';

interface Props {
  cities: string[];
  popular?: Array<{ label: string; href: string }>;
  title?: string;
}

/**
 * Hero property search. Submits to /properties with validated query params; all filtering
 * happens server-side in the API.
 */
export function SearchPanel({ cities, popular = [], title }: Props) {
  const router = useRouter();
  const id = useId();
  const [listingType, setListingType] = useState<ListingType>('sale');
  const [city, setCity] = useState('');
  const [type, setType] = useState('');
  const [budget, setBudget] = useState('');
  const [pending, setPending] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ listingType });
    if (city) params.set('city', city);
    if (type) params.set('type', type);
    const b = BUDGETS[listingType].find((x) => budgetKey(x) === budget);
    if (b?.min !== undefined) params.set('minPrice', String(b.min));
    if (b?.max !== undefined) params.set('maxPrice', String(b.max));
    setPending(true);
    router.push(`/properties?${params.toString()}`);
  }

  const selectCls =
    'w-full appearance-none bg-transparent pr-6 font-heading text-[1rem] font-semibold text-ink outline-none cursor-pointer bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%23737970%27%20stroke-width=%272.5%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[right_center] bg-no-repeat';

  return (
    <div className="rounded-[calc(var(--radius-card)+6px)] bg-white p-2 shadow-lift ring-1 ring-black/5 sm:p-2.5">
      <form onSubmit={submit} aria-label={title ?? 'Property search'}>
        <div className="flex items-center justify-between gap-4 px-3 pt-2 pb-3 sm:px-4">
          <div role="radiogroup" aria-label="Looking to" className="inline-flex rounded-full bg-ivory p-1">
            {(['sale', 'rent'] as const).map((lt) => (
              <button
                key={lt}
                type="button"
                role="radio"
                aria-checked={listingType === lt}
                onClick={() => {
                  setListingType(lt);
                  setBudget('');
                }}
                className={cn(
                  'rounded-full px-5 py-2 font-heading text-sm font-semibold transition-colors',
                  listingType === lt ? 'bg-primary text-inverse' : 'text-muted hover:text-ink',
                )}
              >
                {lt === 'sale' ? 'Buy' : 'Rent'}
              </button>
            ))}
          </div>
          {title && <p className="hidden text-sm text-muted md:block">{title}</p>}
        </div>

        <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-line sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
          <label className="block bg-ivory/60 px-4 py-3 transition-colors focus-within:bg-ivory hover:bg-ivory" htmlFor={`${id}-city`}>
            <span className="field-label block">Location</span>
            <select id={`${id}-city`} value={city} onChange={(e) => setCity(e.target.value)} className={selectCls}>
              <option value="">All cities</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block bg-ivory/60 px-4 py-3 transition-colors focus-within:bg-ivory hover:bg-ivory" htmlFor={`${id}-type`}>
            <span className="field-label block">Property type</span>
            <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
              <option value="">Any type</option>
              {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block bg-ivory/60 px-4 py-3 transition-colors focus-within:bg-ivory hover:bg-ivory" htmlFor={`${id}-budget`}>
            <span className="field-label block">Budget</span>
            <select id={`${id}-budget`} value={budget} onChange={(e) => setBudget(e.target.value)} className={selectCls}>
              <option value="">Any budget</option>
              {BUDGETS[listingType].map((b) => <option key={budgetKey(b)} value={budgetKey(b)}>{b.label}</option>)}
            </select>
          </label>
          <div className="bg-white p-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" disabled={pending} className="btn btn-primary h-full min-h-14 w-full px-7 disabled:opacity-70">
              <Search className="size-4" aria-hidden="true" />
              {pending ? 'Searching…' : 'Search homes'}
            </button>
          </div>
        </div>
      </form>

      {popular.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-1.5 sm:px-4">
          <span className="text-sm text-muted">Popular:</span>
          {popular.map((p) => (
            <Link key={p.href} href={p.href} className="rounded-full border border-line px-3 py-1 text-sm text-ink/80 transition-colors hover:border-ink hover:text-ink">
              {p.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
