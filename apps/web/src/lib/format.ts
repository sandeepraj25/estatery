import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { PublicProperty } from '@estatery/shared';

/** Indian price formatting: ₹24.5 Cr, ₹95 L, ₹95,000/mo. */
export function formatPrice(amount: number, unit: PublicProperty['priceUnit'] = 'total', currency = 'INR'): string {
  if (currency !== 'INR') {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount) + (unit === 'month' ? '/mo' : '');
  }
  let text: string;
  if (amount >= 1e7) text = `₹${trim(amount / 1e7)} Cr`;
  else if (amount >= 1e5 && unit !== 'month') text = `₹${trim(amount / 1e5)} L`;
  else if (amount >= 1e5) text = `₹${trim(amount / 1e5)} L`;
  else text = `₹${new Intl.NumberFormat('en-IN').format(amount)}`;
  return unit === 'month' ? `${text}/mo` : text;
}

function trim(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function formatArea(sqft: number) {
  return `${new Intl.NumberFormat('en-IN').format(sqft)} sq ft`;
}

export function formatDate(iso: string, locale = 'en-IN') {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

/** Joins class names and resolves Tailwind conflicts (later classes win). */
export function cn(...parts: ClassValue[]) {
  return twMerge(clsx(parts));
}
