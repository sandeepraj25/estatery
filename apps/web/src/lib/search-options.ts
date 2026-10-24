import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES, type ListingType } from '@estatery/shared';

export const BUDGETS: Record<ListingType, Array<{ label: string; min?: number; max?: number }>> = {
  sale: [
    { label: 'Up to ₹2 Cr', max: 2e7 },
    { label: '₹2 – 5 Cr', min: 2e7, max: 5e7 },
    { label: '₹5 – 10 Cr', min: 5e7, max: 1e8 },
    { label: '₹10 – 25 Cr', min: 1e8, max: 2.5e8 },
    { label: '₹25 Cr +', min: 2.5e8 },
  ],
  rent: [
    { label: 'Up to ₹50K/mo', max: 5e4 },
    { label: '₹50K – 1L/mo', min: 5e4, max: 1e5 },
    { label: '₹1 – 3L/mo', min: 1e5, max: 3e5 },
    { label: '₹3L+/mo', min: 3e5 },
  ],
};

export const budgetKey = (b: { min?: number; max?: number }) => `${b.min ?? ''}-${b.max ?? ''}`;

export const TYPE_OPTIONS = PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABELS[t] }));
