'use client';

import { useEffect, useState } from 'react';

/**
 * Combines the visitor's OS setting (prefers-reduced-motion) with the tenant's theme setting.
 * Returns a multiplier: 0 = no decorative motion, 0.5 = subtle, 1 = full.
 */
export function useMotionScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => {
      const tenant = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale')) || 0;
      setScale(mq.matches ? 0 : tenant);
    };
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return scale;
}

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
