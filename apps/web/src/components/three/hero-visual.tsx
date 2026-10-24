'use client';

import dynamic from 'next/dynamic';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { useEffect, useState } from 'react';
import type { SceneVariant } from './hero-scene';
import { useMotionScale } from '@/lib/motion';

// Three.js (~600 KB) is only downloaded on devices that will actually render the scene.
const HeroScene = dynamic(() => import('./hero-scene'), { ssr: false });

interface Props {
  sceneEnabled: boolean;
  variant: SceneVariant;
  fallbackImage: string;
  alt: string;
}

type Mode = 'pending' | 'static' | 'webgl';

/** Decides once, on the client, whether this device should get the 3D scene. */
function decideMode(motionScale: number): { mode: Mode; lowPower: boolean } {
  if (motionScale === 0) return { mode: 'static', lowPower: true };
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return { mode: 'static', lowPower: true };
  if (window.innerWidth < 768) return { mode: 'static', lowPower: true }; // phones: photo + CSS depth only
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { mode: 'static', lowPower: true };
  } catch {
    return { mode: 'static', lowPower: true };
  }
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  return { mode: 'webgl', lowPower: cores < 6 || memory < 6 };
}

export function HeroVisual({ sceneEnabled, variant, fallbackImage, alt }: Props) {
  const motionScale = useMotionScale();
  const [{ mode, lowPower }, setMode] = useState<{ mode: Mode; lowPower: boolean }>({ mode: 'pending', lowPower: true });
  const [sceneReady, setSceneReady] = useState(false);
  const [colors, setColors] = useState({ primary: '#10251D', accent: '#C6A66B' });

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    setColors({
      primary: css.getPropertyValue('--color-primary').trim() || '#10251D',
      accent: css.getPropertyValue('--color-accent').trim() || '#C6A66B',
    });
    setMode(sceneEnabled ? decideMode(motionScale) : { mode: 'static', lowPower: true });
  }, [sceneEnabled, motionScale]);

  return (
    <div className="absolute inset-0" aria-hidden={mode === 'webgl' ? true : undefined}>
      {/* Static layer: always rendered first (LCP), kept for low-power devices and reduced motion. */}
      <div
        className="media-fallback absolute inset-0 transition-opacity duration-[1400ms]"
        style={{ opacity: sceneReady ? 0 : 1 }}
      >
        <Image src={fallbackImage} alt={alt} fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,var(--color-primary)_8%,color-mix(in_oklab,var(--color-primary)_70%,transparent)_45%,transparent_80%)]" />
      </div>

      {mode === 'webgl' && (
        <div className="absolute inset-0 transition-opacity duration-[1400ms]" style={{ opacity: sceneReady ? 1 : 0 }}>
          {/* Dusk sky: CSS gradient behind a transparent canvas costs nothing on the GPU. */}
          <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_72%_62%,color-mix(in_oklab,var(--color-accent)_32%,var(--color-primary))_0%,var(--color-primary)_70%)]" />
          <div className="absolute inset-0">
            <HeroScene variant={variant} motionScale={motionScale} lowPower={lowPower} onReady={() => setSceneReady(true)} colors={colors} />
          </div>
          {/* Keeps the headline legible over the scene. */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(95deg,var(--color-primary)_0%,color-mix(in_oklab,var(--color-primary)_55%,transparent)_38%,transparent_62%)]" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary to-transparent" />
    </div>
  );
}
