'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Heart, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SiteSettings } from '@estatery/shared';
import { useFavourites } from '@/lib/favourites';
import { cn } from '@/lib/format';
import { Logo } from './logo';

/**
 * Transparent over the homepage hero, then a solid ivory bar once the visitor scrolls.
 * Every other page starts solid.
 */
export function SiteHeader({ settings }: { settings: SiteSettings }) {
  const pathname = usePathname();
  const overHero = pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { ids } = useFavourites();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const transparent = overHero && !scrolled;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,color] duration-500',
        transparent ? 'text-inverse' : 'bg-ivory/90 text-ink shadow-[0_1px_0_var(--color-border)] backdrop-blur-md',
      )}
    >
      <div className="container-site flex h-[4.5rem] items-center justify-between gap-6">
        <Logo settings={settings} />

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {settings.navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'relative rounded-full px-3.5 py-2 font-heading text-[0.9375rem] font-medium transition-colors',
                    transparent ? 'text-white/80 hover:text-white' : 'text-ink/75 hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1.5">
          <Link href="/properties" className="grid size-11 place-items-center rounded-full transition-colors hover:bg-current/10" aria-label="Search properties">
            <Search className="size-[1.15rem]" />
          </Link>
          <Link href="/properties?saved=1" className="relative grid size-11 place-items-center rounded-full transition-colors hover:bg-current/10" aria-label={`Saved properties (${ids.length})`}>
            <Heart className="size-[1.15rem]" />
            {ids.length > 0 && (
              <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-bold leading-4 text-primary">
                {ids.length}
              </span>
            )}
          </Link>
          <Link href="/#contact" className={cn('btn ml-2 hidden min-h-11 sm:inline-flex', transparent ? 'btn-accent' : 'btn-primary')}>
            Book a consultation
          </Link>

          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="grid size-11 place-items-center rounded-full lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/50 backdrop-blur-sm data-[state=open]:animate-in" />
              <Dialog.Content className="surface-dark fixed inset-y-0 right-0 z-[61] flex w-[min(24rem,88vw)] flex-col p-6 shadow-2xl outline-none">
                <div className="flex items-center justify-between">
                  <Dialog.Title className="font-heading text-lg font-semibold">{settings.businessName}</Dialog.Title>
                  <Dialog.Close className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Close menu">
                    <X className="size-5" />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
                <nav aria-label="Mobile" className="mt-8">
                  <ul className="space-y-1">
                    {settings.navigation.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} onClick={() => setOpen(false)} className="type-display block py-2 text-3xl text-white/90 hover:text-white">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
                <div className="mt-auto space-y-3 border-t border-white/15 pt-6 text-sm text-muted-inverse">
                  <a href={`tel:${settings.contact.phone.replace(/\s/g, '')}`} className="block hover:text-white">{settings.contact.phone}</a>
                  <a href={`mailto:${settings.contact.email}`} className="block hover:text-white">{settings.contact.email}</a>
                  <Link href="/#contact" onClick={() => setOpen(false)} className="btn btn-accent mt-3 w-full">Book a consultation</Link>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
