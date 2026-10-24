'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { PropertyImage } from '@estatery/shared';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { cn } from '@/lib/format';

/** Editorial gallery grid with a keyboard-navigable full-screen viewer. */
export function Gallery({ images, title }: { images: PropertyImage[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const go = useCallback((d: number) => setIndex((i) => (i + d + images.length) % images.length), [images.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go]);

  if (images.length === 0) return <div className="media-fallback aspect-[16/9] rounded-[var(--radius-card)]" />;
  const show = (i: number) => {
    setIndex(i);
    setOpen(true);
  };
  const [first, ...rest] = images;

  return (
    <>
      <div className={cn('grid gap-2 overflow-hidden rounded-[var(--radius-card)]', rest.length >= 2 ? 'md:grid-cols-[2fr_1fr] md:grid-rows-2' : rest.length === 1 ? 'md:grid-cols-[2fr_1fr]' : '')}>
        <button type="button" onClick={() => show(0)} className="media-fallback group relative aspect-[4/3] md:row-span-2 md:aspect-auto md:min-h-[32rem]" aria-label={`View photo 1 of ${images.length}`}>
          <Image src={first!.url} alt={first!.alt || title} fill priority sizes="(min-width:768px) 66vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
        </button>
        {rest.slice(0, 2).map((img, i) => (
           <button key={img.url} type="button" onClick={() => show(i + 1)} className={cn('media-fallback group relative hidden md:block', rest.length === 1 && 'md:min-h-[32rem]')} aria-label={`View photo ${i + 2} of ${images.length}`}>
            <Image src={img.url} alt={img.alt || title} fill sizes="33vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
            {i === 1 && images.length > 3 && (
              <span className="absolute inset-0 grid place-items-center bg-primary/50 font-heading text-lg font-semibold text-white">+{images.length - 3} {images.length - 3 === 1 ? "photo" : "photos"}</span>
            )}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => show(0)} className="btn btn-ghost mt-3 min-h-10 bg-white text-sm">
        <Expand className="size-4" aria-hidden="true" /> View all {images.length} photos
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/92" />
          <Dialog.Content className="fixed inset-0 z-[71] flex flex-col outline-none" aria-describedby={undefined}>
            <div className="flex items-center justify-between p-4 text-white">
              <Dialog.Title className="text-sm text-white/80">{title} — {index + 1} / {images.length}</Dialog.Title>
              <Dialog.Close className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Close gallery"><X className="size-5" /></Dialog.Close>
            </div>
            <div className="relative flex-1">
              <div className="media-fallback absolute inset-4 md:inset-x-20">
                <Image key={images[index]!.url} src={images[index]!.url} alt={images[index]!.alt || title} fill sizes="100vw" className="object-contain" />
              </div>
              {images.length > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} className="absolute left-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Previous photo"><ChevronLeft className="size-6" /></button>
                  <button type="button" onClick={() => go(1)} className="absolute right-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Next photo"><ChevronRight className="size-6" /></button>
                </>
              )}
            </div>
            <div className="hide-scrollbar flex justify-center gap-2 overflow-x-auto p-4">
              {images.map((img, i) => (
                <button key={img.url} type="button" onClick={() => setIndex(i)} aria-label={`Photo ${i + 1}`} aria-current={i === index} className={cn('media-fallback relative h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2', i === index ? 'ring-accent' : 'ring-transparent opacity-60 hover:opacity-100')}>
                  <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
                </button>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
