'use client';

import { useSyncExternalStore } from 'react';

/**
 * Favourites for anonymous visitors, stored in this browser only. When visitor accounts arrive
 * (auth phase), these ids are merged into the account on sign-in.
 */
const KEY = 'estatery:favourites';
const listeners = new Set<() => void>();
let snapshot: string[] | null = null;

function read(): string[] {
  if (snapshot) return snapshot;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    snapshot = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
  } catch {
    snapshot = [];
  }
  return snapshot;
}

function write(next: string[]) {
  snapshot = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode): keep in memory for this visit */
  }
  listeners.forEach((l) => l());
}

const EMPTY: string[] = [];

export function useFavourites() {
  const ids = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          snapshot = null;
          cb();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', onStorage);
      };
    },
    read,
    () => EMPTY,
  );
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle: (id: string) => write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
  };
}
