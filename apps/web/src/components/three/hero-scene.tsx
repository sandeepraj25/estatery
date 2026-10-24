'use client';

import { ContactShadows, MeshReflectorMaterial } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Procedural modern residence at dusk. Built from simple geometry (no model downloads), so the
 * whole scene ships in the JS bundle, renders in ~1–2 draw-call batches per material and needs no
 * external assets. The orchestrated moment: the interior lights fade up as the camera settles.
 *
 * Variants are art-directed presets the admin panel can choose between (no arbitrary code).
 */
export type SceneVariant = 'pavilion' | 'cantilever';

interface Props {
  variant: SceneVariant;
  /** 0 = static camera, 0.5 = subtle, 1 = full drift/parallax. */
  motionScale: number;
  /** Lower-cost rendering for weaker GPUs: no reflections, smaller shadow maps, DPR 1. */
  lowPower: boolean;
  onReady?: () => void;
  colors: { primary: string; accent: string };
}

const STONE = '#d8d0c0';
const CONCRETE = '#b9b3a7';
const TIMBER = '#7b5233';
const WARM = '#ffcf8a';

/** Warm interior light that "switches on" over ~2.4s after the first frame. */
function useLightsOn(delay = 0.5, duration = 2.4) {
  const t = useRef(0);
  const value = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const p = THREE.MathUtils.clamp((t.current - delay) / duration, 0, 1);
    value.current = 1 - Math.pow(1 - p, 3);
  });
  return value;
}

function GlowPanel({ position, size, intensity }: { position: [number, number, number]; size: [number, number]; intensity: React.RefObject<number> }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (mat.current) mat.current.emissiveIntensity = 0.15 + (intensity.current ?? 0) * 1.9;
  });
  return (
    <mesh position={position}>
      <planeGeometry args={size} />
      <meshStandardMaterial ref={mat} color="#2a2318" emissive={WARM} emissiveIntensity={0.15} toneMapped={false} />
    </mesh>
  );
}

/** Open-fronted warm room: what you see through the glass once the lights come on. */
function InteriorVolume({ position, size, intensity }: { position: [number, number, number]; size: [number, number, number]; intensity: React.RefObject<number> }) {
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  useFrame(() => {
    const v = intensity.current ?? 0;
    mats.current.forEach((m, i) => (m.emissiveIntensity = (i === 0 ? 0.25 : 0.08) + v * (i === 0 ? 1.5 : 0.55)));
  });
  const [w, h, d] = size;
  const mat = (i: number, color: string) => (
    <meshStandardMaterial ref={(m) => { if (m) mats.current[i] = m; }} color={color} emissive={WARM} emissiveIntensity={0.1} roughness={0.9} toneMapped={false} />
  );
  return (
    <group position={position}>
      <mesh position={[0, 0, -d / 2]}>{/* back wall */}<planeGeometry args={[w, h]} />{mat(0, '#3a2f22')}</mesh>
      <mesh position={[0, h / 2 - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[w, d]} />{mat(1, '#2d261d')}</mesh>
      <mesh position={[0, -h / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[w, d]} />{mat(2, '#4a3a28')}</mesh>
      <mesh position={[-w / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[d, h]} />{mat(3, '#33291e')}</mesh>
      {/* A long sofa and a dining table as silhouettes against the light */}
      <mesh position={[-1.8, -h / 2 + 0.35, -0.6]}><boxGeometry args={[2.6, 0.6, 0.9]} /><meshStandardMaterial color="#1e1a15" roughness={1} /></mesh>
      <mesh position={[2.2, -h / 2 + 0.75, -0.4]}><boxGeometry args={[2, 0.08, 1]} /><meshStandardMaterial color="#1e1a15" roughness={1} /></mesh>
      <mesh position={[0.4, h / 2 - 0.5, -0.2]}><sphereGeometry args={[0.22, 16, 16]} /><meshStandardMaterial color={WARM} emissive={WARM} emissiveIntensity={3} toneMapped={false} /></mesh>
    </group>
  );
}

function InteriorLight({ position, intensity }: { position: [number, number, number]; intensity: React.RefObject<number> }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (light.current) light.current.intensity = (intensity.current ?? 0) * 32;
  });
  return <pointLight ref={light} position={position} color={WARM} distance={11} decay={1.8} intensity={0} />;
}

function Tree({ position, scale = 1, tone = '#1c3a2c' }: { position: [number, number, number]; scale?: number; tone?: string }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 2.2, 6]} />
        <meshStandardMaterial color="#2b2118" roughness={1} />
      </mesh>
      <mesh position={[0, 2.7, 0]} castShadow>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial color={tone} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.45, 2.2, 0.2]} castShadow>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial color={tone} roughness={0.95} flatShading />
      </mesh>
    </group>
  );
}

function Residence({ variant, lowPower }: { variant: SceneVariant; lowPower: boolean }) {
  const lights = useLightsOn();
  const cantilever = variant === 'cantilever';
  const fins = useMemo(() => Array.from({ length: 13 }, (_, i) => i), []);

  // Massing differs per variant; everything else is shared.
  const upper = cantilever
    ? { w: 10.5, h: 2.7, d: 5.6, x: 2.6, y: 4.35 }
    : { w: 11.5, h: 2.5, d: 6.2, x: 1.8, y: 4.15 };

  return (
    <group position={[0, 0, 0]}>
      {/* Plinth */}
      <mesh position={[0.5, 0.2, 0]} receiveShadow castShadow>
        <boxGeometry args={[15, 0.4, 8.5]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.9} />
      </mesh>

      {/* Ground floor: recessed glass volume with warm interior */}
      <InteriorVolume position={[-0.6, 1.8, -0.2]} size={[8.8, 2.75, 5]} intensity={lights} />
      <mesh position={[-0.6, 1.8, 2.71]}>
        <planeGeometry args={[9, 2.8]} />
        <meshStandardMaterial color="#9fc3c0" roughness={0.05} metalness={0.9} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      {/* Mullions */}
      {[-4.2, -1.8, 0.6, 3].map((x) => (
        <mesh key={x} position={[x, 1.8, 2.72]}>
          <boxGeometry args={[0.06, 2.8, 0.06]} />
          <meshStandardMaterial color="#1b1f1c" roughness={0.6} />
        </mesh>
      ))}
      <InteriorLight position={[-2.5, 2.3, 0.5]} intensity={lights} />
      <InteriorLight position={[2, 2.3, 0.5]} intensity={lights} />

      {/* Solid stone wing anchoring the glass box */}
      <mesh position={[5.4, 1.8, -0.4]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 2.8, 4.6]} />
        <meshStandardMaterial color={STONE} roughness={0.85} />
      </mesh>

      {/* Timber screen across part of the glass */}
      {fins.map((i) => (
        <mesh key={i} position={[-4.6 + i * 0.32, 1.8, 2.78]} castShadow>
          <boxGeometry args={[0.07, 2.8, 0.14]} />
          <meshStandardMaterial color={TIMBER} roughness={0.7} />
        </mesh>
      ))}

      {/* First-floor slab */}
      <mesh position={[upper.x - 0.3, 3.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[upper.w + 1.4, 0.3, upper.d + 0.8]} />
        <meshStandardMaterial color={STONE} roughness={0.8} />
      </mesh>

      {/* Upper cantilevered volume */}
      <mesh position={[upper.x, upper.y, 0]} castShadow receiveShadow>
        <boxGeometry args={[upper.w, upper.h, upper.d]} />
        <meshStandardMaterial color={STONE} roughness={0.8} />
      </mesh>
      {/* Ribbon window on the upper volume */}
      <GlowPanel position={[upper.x - 0.4, upper.y + 0.05, upper.d / 2 + 0.01]} size={[upper.w - 2.4, 1.2]} intensity={lights} />
      <mesh position={[upper.x - 0.4, upper.y + 0.05, upper.d / 2 + 0.03]}>
        <planeGeometry args={[upper.w - 2.4, 1.2]} />
        <meshStandardMaterial color="#9fc3c0" roughness={0.05} metalness={0.9} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <InteriorLight position={[upper.x, upper.y, 1]} intensity={lights} />

      {cantilever && (
        <mesh position={[upper.x + 1.2, upper.y + 2.4, -0.6]} castShadow>
          <boxGeometry args={[6, 2.1, 4.4]} />
          <meshStandardMaterial color={CONCRETE} roughness={0.85} />
        </mesh>
      )}

      {/* Roof plane with deep overhang */}
      <mesh position={[upper.x - 0.2, upper.y + upper.h / 2 + 0.14, 0.2]} castShadow>
        <boxGeometry args={[upper.w + 1.8, 0.22, upper.d + 1.4]} />
        <meshStandardMaterial color="#e6dfd1" roughness={0.75} />
      </mesh>

      {/* Pool */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, 0.41, 6.3]}>
        <planeGeometry args={[12, 3.4]} />
        {lowPower ? (
          <meshStandardMaterial color="#1f5a57" roughness={0.1} metalness={0.4} emissive="#0f3b3a" emissiveIntensity={0.6} />
        ) : (
          <MeshReflectorMaterial
            color="#1f5a57"
            roughness={0.15}
            metalness={0.3}
            mirror={0.6}
            blur={[200, 60]}
            mixBlur={1.2}
            mixStrength={1.4}
            resolution={512}
            depthScale={0.4}
          />
        )}
      </mesh>
      {/* Pool coping */}
      <mesh position={[0.5, 0.3, 6.3]} receiveShadow>
        <boxGeometry args={[12.8, 0.2, 4.2]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.9} />
      </mesh>

      <Tree position={[-9.5, 0, -2]} scale={1.25} />
      <Tree position={[-8, 0, 3.5]} scale={0.9} tone="#22412f" />
      <Tree position={[10.5, 0, -3]} scale={1.4} tone="#183326" />
      <Tree position={[11.5, 0, 3]} scale={0.85} />
    </group>
  );
}

/** Slow drift + gentle pointer parallax. Never fast enough to feel like a game camera. */
function CameraRig({ motionScale, onReady }: { motionScale: number; onReady?: () => void }) {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(-7, 3.6, 2), []);
  const t = useRef(0);
  const intro = useRef(0);
  const readyFired = useRef(false);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    t.current += d;
    intro.current = Math.min(1, intro.current + d / 3.2);
    const ease = 1 - Math.pow(1 - intro.current, 3);

    // Intro dolly: start further out and lower, settle into the hero framing.
    const radius = THREE.MathUtils.lerp(52, 39, ease);
    const height = THREE.MathUtils.lerp(3, 7.5, ease);
    const drift = Math.sin(t.current * 0.12) * 0.12 * motionScale;
    const angle = 0.62 + drift + pointer.x * 0.07 * motionScale;

    const desired = new THREE.Vector3(Math.sin(angle) * radius, height + pointer.y * 0.6 * motionScale, Math.cos(angle) * radius);
    camera.position.lerp(desired, motionScale === 0 ? 1 : 0.06);
    camera.lookAt(target);

    if (!readyFired.current && t.current > 0.15) {
      readyFired.current = true;
      onReady?.();
    }
  });
  return null;
}

export default function HeroScene({ variant, motionScale, lowPower, onReady, colors }: Props) {
  return (
    <Canvas
      shadows={!lowPower}
      dpr={lowPower ? 1 : [1, 1.75]}
      gl={{ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 0.5, far: 120, position: [18, 3, 24] }}
      frameloop={motionScale === 0 ? 'demand' : 'always'}
      aria-hidden="true"
    >
      <fog attach="fog" args={[colors.primary, 40, 90]} />
      <hemisphereLight args={['#b8c9d6', colors.primary, 0.75]} />
      <ambientLight intensity={0.12} />
      {/* Moonlight */}
      <directionalLight
        position={[-12, 18, 10]}
        intensity={0.9}
        color="#c7d6e8"
        castShadow={!lowPower}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={14}
        shadow-camera-bottom={-10}
      />
      {/* Last warm light of the sun, grazing from the right */}
      <directionalLight position={[22, 4, -4]} intensity={1.1} color={colors.accent} />

      <Residence variant={variant} lowPower={lowPower} />

      {/* Lawn */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[38, 48]} />
        <meshStandardMaterial color="#132c22" roughness={1} />
      </mesh>
      {!lowPower && <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={34} blur={2.4} far={8} />}

      <CameraRig motionScale={motionScale} onReady={onReady} />
    </Canvas>
  );
}
