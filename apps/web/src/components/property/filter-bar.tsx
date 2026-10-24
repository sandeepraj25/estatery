'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { SlidersHorizontal, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState, useTransition, type FormEvent } from 'react';
import { PROPERTY_SORTS, type ListingType } from '@estatery/shared';
import { BUDGETS, budgetKey, TYPE_OPTIONS } from '@/lib/search-options';
import { cn } from '@/lib/format';

const SORT_LABELS: Record<(typeof PROPERTY_SORTS)[number], string> = {
  relevance: 'Recommended',
  newest: 'Newest first',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  'area-desc': 'Largest first',
};

/**
 * Listing filters. State lives in the URL (shareable, back-button friendly); every change
 * triggers a server-side search. On phones the filters open in a bottom sheet.
 */
export function FilterBar({ cities, total }: { cities: string[]; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [sheet, setSheet] = useState(false);
  const id = useId();

  const listingType = (params.get('listingType') as ListingType | null) ?? '';
  const budgetValue = `${params.get('minPrice') ?? ''}-${params.get('maxPrice') ?? ''}`;
  const [q, setQ] = useState(params.get('q') ?? '');
  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    next.delete('saved');
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  function setBudget(value: string) {
    const [min, max] = value.split('-');
    update({ minPrice: min || null, maxPrice: max || null });
  }

  const budgets = listingType ? BUDGETS[listingType] : [...BUDGETS.sale];
  const activeCount = ['city', 'type', 'minPrice', 'maxPrice', 'bhk', 'q', 'category', 'project'].filter((k) => params.get(k)).length;

  const field = 'field h-11 min-h-11 cursor-pointer pr-8';

  const controls = (inSheet: boolean) => (
    <div className={cn('grid gap-3', inSheet ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-4 lg:flex lg:flex-wrap lg:items-center')}>
      <label className="sr-only" htmlFor={`${id}-${inSheet}-city`}>City</label>
      <select id={`${id}-${inSheet}-city`} className={cn(field, 'lg:w-44')} value={params.get('city') ?? ''} onChange={(e) => update({ city: e.target.value })}>
        <option value="">All cities</option>
        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label className="sr-only" htmlFor={`${id}-${inSheet}-type`}>Property type</label>
      <select id={`${id}-${inSheet}-type`} className={cn(field, 'lg:w-48')} value={params.get('type') ?? ''} onChange={(e) => update({ type: e.target.value })}>
        <option value="">Any type</option>
        {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <label className="sr-only" htmlFor={`${id}-${inSheet}-budget`}>Budget</label>
      <select id={`${id}-${inSheet}-budget`} className={cn(field, 'lg:w-44')} value={budgets.some((b) => budgetKey(b) === budgetValue) ? budgetValue : ''} onChange={(e) => setBudget(e.target.value)}>
        <option value="">Any budget</option>
        {budgets.map((b) => <option key={budgetKey(b)} value={budgetKey(b)}>{b.label}</option>)}
      </select>
      <div role="group" aria-label="Bedrooms" className="flex items-center gap-1.5">
        <span className="mr-1 text-sm text-muted" aria-hidden="true">BHK</span>
        {['1', '2', '3', '4', '5'].map((n) => {
          const on = params.get('bhk') === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => update({ bhk: on ? null : n })}
              className={cn('h-11 min-w-11 rounded-[10px] border px-2 text-sm font-semibold transition-colors', on ? 'border-primary bg-primary text-inverse' : 'border-line bg-white hover:border-ink')}
            >
              {n === '5' ? '5+' : n}
              <span className="sr-only"> BHK</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    update({ q: q.trim() || null });
  }

  return (
    <div className="sticky top-[4.5rem] z-30 border-b border-line bg-ivory/95 backdrop-blur-md">
      <div className="container-site flex flex-col gap-3 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Listing type" className="inline-flex rounded-full border border-line bg-white p-1">
            {[['', 'All'], ['sale', 'Buy'], ['rent', 'Rent']].map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={listingType === v}
                onClick={() => update({ listingType: v || null, minPrice: null, maxPrice: null })}
                className={cn('rounded-full px-4 py-1.5 font-heading text-sm font-semibold transition-colors', listingType === v ? 'bg-primary text-inverse' : 'text-muted hover:text-ink')}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submitSearch} role="search" className="min-w-0 flex-1 basis-56">
            <label htmlFor={`${id}-q`} className="sr-only">Search by name or locality</label>
            <input id={`${id}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by locality or name, e.g. Worli" className="field h-11 min-h-11" />
          </form>

          <Dialog.Root open={sheet} onOpenChange={setSheet}>
            <Dialog.Trigger className="btn btn-ghost min-h-11 bg-white lg:hidden">
              <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters{activeCount > 0 && ` (${activeCount})`}
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
              <Dialog.Content className="fixed inset-x-0 bottom-0 z-[61] max-h-[85dvh] overflow-y-auto rounded-t-[1.5rem] bg-ivory p-6 outline-none motion-safe:animate-[sheet-up_.35s_var(--ease-out)]">
                <div className="flex items-center justify-between">
                  <Dialog.Title className="font-heading text-lg font-semibold">Filters</Dialog.Title>
                  <Dialog.Close className="grid size-11 place-items-center rounded-full hover:bg-line/60" aria-label="Close filters"><X className="size-5" /></Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">Narrow down the property list</Dialog.Description>
                <div className="mt-5">{controls(true)}</div>
                <Dialog.Close className="btn btn-primary mt-6 w-full">Show {total} {total === 1 ? 'home' : 'homes'}</Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <label className="sr-only" htmlFor={`${id}-sort`}>Sort by</label>
          <select id={`${id}-sort`} className="field h-11 min-h-11 w-auto cursor-pointer pr-8" value={params.get('sort') ?? 'relevance'} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })}>
            {PROPERTY_SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="hidden lg:block">{controls(false)}</div>
      </div>
      <div className={cn('h-0.5 origin-left bg-accent transition-transform duration-700', pending ? 'scale-x-75' : 'scale-x-0')} aria-hidden="true" />
      {pending && <span className="sr-only" role="status">Updating results</span>}
    </div>
  );
}
