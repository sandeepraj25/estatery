'use client';

import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/format';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: 1440, icon: Monitor },
  { id: 'tablet', label: 'Tablet', width: 834, icon: Tablet },
  { id: 'mobile', label: 'Phone', width: 390, icon: Smartphone },
] as const;

/** Live preview of the saved draft, scaled to fit, with device widths. */
export function PreviewPane({ reloadKey, path = '/' }: { reloadKey: number; path?: string }) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop');
  const [manual, setManual] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const width = DEVICES.find((d) => d.id === device)!.width;

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  // The pane is hidden (zero width) below the 2xl breakpoint; keep the maths finite.
  const scale = size.w > 0 ? Math.min(1, size.w / width) : 1;

  return (
    <div className="flex h-full flex-col rounded-[14px] border border-line bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div role="radiogroup" aria-label="Preview size" className="flex gap-1">
          {DEVICES.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={device === d.id} onClick={() => setDevice(d.id)} className={cn('grid size-9 place-items-center rounded-lg', device === d.id ? 'bg-primary text-inverse' : 'text-muted hover:bg-ivory')} aria-label={d.label} title={d.label}>
              <d.icon className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Saved draft · {width}px</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => setManual((n) => n + 1)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ivory" aria-label="Reload preview" title="Reload preview"><RefreshCw className="size-4" /></button>
          <a href={`${path}?preview=draft`} target="_blank" rel="noopener" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ivory" aria-label="Open preview in a new tab" title="Open in new tab"><ExternalLink className="size-4" /></a>
        </div>
      </div>
      <div ref={box} className="relative flex-1 overflow-hidden bg-ivory">
        <iframe
          key={`${path}-${reloadKey}-${manual}`}
          title="Website preview (unpublished changes)"
          src={`${path}?preview=draft&v=${reloadKey}-${manual}`}
          className="absolute left-1/2 top-0 origin-top border-0 bg-white"
          style={{ width, height: size.h / scale, transform: `translateX(-50%) scale(${scale})` }}
        />
      </div>
    </div>
  );
}
