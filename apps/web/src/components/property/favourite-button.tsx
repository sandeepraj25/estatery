'use client';

import { Heart } from 'lucide-react';
import { useFavourites } from '@/lib/favourites';
import { cn } from '@/lib/format';

export function FavouriteButton({ id, title, className = '' }: { id: string; title: string; className?: string }) {
  const { has, toggle } = useFavourites();
  const saved = has(id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
      className={cn(
        'grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow-soft backdrop-blur transition-transform hover:scale-105 active:scale-95',
        className,
      )}
    >
      <Heart className={cn('size-[1.1rem] transition-colors', saved && 'fill-[var(--color-error)] text-[var(--color-error)]')} aria-hidden="true" />
    </button>
  );
}
