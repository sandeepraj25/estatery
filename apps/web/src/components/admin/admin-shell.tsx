'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ROLE_LABELS, type SessionUser } from '@estatery/shared';
import { adminRequest } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { visibleNav, type NavItem } from './nav';

function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.9375rem] font-medium transition-colors',
                active ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/6 hover:text-white',
              )}
            >
              <item.icon className={cn('size-[1.1rem]', active ? 'text-accent' : '')} aria-hidden="true" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminShell({ user, businessName, banner, children }: { user: SessionUser; businessName: string; banner?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const nav = visibleNav(user);
  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    setSigningOut(true);
    await adminRequest('auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/admin/login');
    router.refresh();
  }

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-5">
        <Link href="/admin" className="block" onClick={onNavigate}>
          <span className="block font-heading text-lg font-bold tracking-tight text-white">{businessName}</span>
          <span className="text-xs text-muted-inverse">Admin Panel</span>
        </Link>
      </div>
      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3">
        <NavList items={nav.main} pathname={pathname} onNavigate={onNavigate} />
        {nav.platform.length > 0 && (
          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="px-3 pb-2 text-xs font-medium text-muted-inverse">Platform operator</p>
            <NavList items={nav.platform} pathname={pathname} onNavigate={onNavigate} />
          </div>
        )}
      </nav>
      <div className="border-t border-white/10 p-3">
        <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/65 hover:bg-white/6 hover:text-white">
          <ExternalLink className="size-4" aria-hidden="true" /> View website
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[color-mix(in_oklab,var(--color-background)_60%,white)] lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="surface-dark sticky top-0 hidden h-dvh lg:block">{sidebar()}</aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger className="grid size-10 place-items-center rounded-lg hover:bg-ivory lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
                <Dialog.Content className="surface-dark fixed inset-y-0 left-0 z-[61] w-72 outline-none">
                  <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                  <Dialog.Description className="sr-only">Admin sections</Dialog.Description>
                  <Dialog.Close className="absolute right-3 top-5 grid size-10 place-items-center rounded-lg text-white hover:bg-white/10" aria-label="Close navigation">
                    <X className="size-5" />
                  </Dialog.Close>
                  {sidebar(() => setOpen(false))}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <span className="font-heading text-sm font-semibold text-muted lg:hidden">{businessName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{user.name}</p>
              <p className="text-xs text-muted">{ROLE_LABELS[user.role]}{user.platformOwner ? ' · Platform operator' : ''}</p>
            </div>
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-primary font-heading text-sm font-semibold text-inverse">
              {user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </span>
            <button type="button" onClick={signOut} disabled={signingOut} className="btn btn-ghost min-h-9 px-3 text-sm" aria-label="Sign out">
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </header>
        <main id="main" className="px-4 py-8 sm:px-6 lg:px-10">{banner}{children}</main>
      </div>
    </div>
  );
}
