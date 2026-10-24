'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Undo/redo for an editing session. Rapid changes to the same field are grouped (typing a word
 * is one undo step, not one per keystroke). Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z or Ctrl+Y redoes.
 */
export function useHistory<T>(initial: T, limit = 60) {
  const [state, setState] = useState(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastPush = useRef(0);
  const [, force] = useState(0);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      if (Object.is(value, prev)) return prev;
      const now = Date.now();
      if (now - lastPush.current > 800) {
        past.current = [...past.current, prev].slice(-limit);
        future.current = [];
      }
      lastPush.current = now;
      return value;
    });
    force((n) => n + 1);
  }, [limit]);

  const undo = useCallback(() => {
    setState((prev) => {
      const p = past.current;
      if (!p.length) return prev;
      future.current = [prev, ...future.current];
      past.current = p.slice(0, -1);
      lastPush.current = 0;
      return p[p.length - 1]!;
    });
    force((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      const [next, ...rest] = future.current;
      if (next === undefined) return prev;
      past.current = [...past.current, prev];
      future.current = rest;
      lastPush.current = 0;
      return next;
    });
    force((n) => n + 1);
  }, []);

  /** Replace without recording history (after loading or saving from the server). */
  const reset = useCallback((value: T) => {
    past.current = [];
    future.current = [];
    setState(value);
    force((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      // Let text inputs keep their native undo.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { state, set, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
