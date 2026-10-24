'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminRequestError, adminRequest, uploadImage, type MediaItem } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { SafeImage as Image } from '@/components/ui/safe-image';

interface PickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  multiple?: boolean;
  onSelect: (items: MediaItem[]) => void;
  title?: string;
}

/**
 * Media library dialog: upload new images (drag & drop or browse) or choose existing ones.
 * Uploads go straight into the library, so they can be reused on other listings and sections.
 */
export function MediaPickerDialog({ open, onOpenChange, multiple = false, onSelect, title = 'Choose an image' }: PickerProps) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async (p: number) => {
    try {
      const r = await adminRequest<{ items: MediaItem[]; totalPages: number }>(`admin/media?page=${p}`);
      setItems((prev) => (p === 1 ? r.items : [...(prev ?? []), ...r.items]));
      setTotalPages(r.totalPages);
      setPage(p);
    } catch (e) {
      setError(e instanceof AdminRequestError ? e.message : 'Couldn’t load your images.');
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSelected([]);
      setError(null);
      void load(1);
    }
  }, [open, load]);

  async function handleFiles(files: FileList | File[]) {
    const list = [...files].slice(0, 20);
    setError(null);
    for (const f of list) {
      setUploading((u) => [...u, f.name]);
      try {
        const item = await uploadImage(f);
        setItems((prev) => [item, ...(prev ?? [])]);
        setSelected((s) => (multiple ? [...s, item.id] : [item.id]));
      } catch (e) {
        setError(e instanceof AdminRequestError ? e.message : `“${f.name}” didn’t upload. Please try again.`);
      } finally {
        setUploading((u) => u.filter((n) => n !== f.name));
      }
    }
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : multiple ? [...s, id] : [id]));
  const confirm = () => {
    const byId = new Map((items ?? []).map((i) => [i.id, i]));
    onSelect(selected.map((id) => byId.get(id)!).filter(Boolean));
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-primary/50" />
        <Dialog.Content className="fixed inset-4 z-[81] mx-auto flex max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-lift outline-none sm:inset-8">
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="font-heading text-lg font-semibold">{title}</Dialog.Title>
              <Dialog.Description className="text-sm text-muted">JPG, PNG, WebP or AVIF, up to 12 MB. Photos are resized and location data is removed automatically.</Dialog.Description>
            </div>
            <Dialog.Close className="grid size-9 place-items-center rounded-lg hover:bg-ivory" aria-label="Close"><X className="size-5" /></Dialog.Close>
          </div>

          <div
            className={cn('m-5 mb-0 rounded-xl border-2 border-dashed p-5 text-center transition-colors', dragging ? 'border-accent bg-accent/10' : 'border-line')}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
          >
            <Upload className="mx-auto size-6 text-muted" aria-hidden="true" />
            <p className="mt-2 text-sm">Drop images here, or <button type="button" onClick={() => input.current?.click()} className="font-semibold underline decoration-accent underline-offset-4">browse your device</button></p>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple={multiple} className="sr-only" onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = ''; }} aria-label="Upload images" />
            {uploading.length > 0 && <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Uploading {uploading.length}…</p>}
          </div>
          {error && <p className="mx-5 mt-3 rounded-lg bg-[var(--color-error)]/8 px-4 py-2 text-sm text-[var(--color-error)]" role="alert">{error}</p>}

          <div className="flex-1 overflow-y-auto p-5">
            {items === null ? (
              <p className="text-sm text-muted" role="status">Loading images…</p>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Your media library is empty. Upload your first photo above.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5" aria-label="Media library">
                {items.map((m) => {
                  const on = selected.includes(m.id);
                  return (
                    <li key={m.id}>
                      <button type="button" onClick={() => toggle(m.id)} aria-pressed={on} className={cn('media-fallback relative block aspect-[4/3] w-full overflow-hidden rounded-lg ring-2 ring-offset-2 transition', on ? 'ring-primary' : 'ring-transparent hover:ring-line')}>
                        <Image src={m.url} alt={m.alt || m.originalName || 'Uploaded image'} fill sizes="200px" className="object-cover" />
                        {on && <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-white"><Check className="size-4" aria-hidden="true" /></span>}
                      </button>
                      <p className="mt-1 truncate text-xs text-muted">{m.width}×{m.height}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            {page < totalPages && <button type="button" onClick={() => load(page + 1)} className="btn btn-ghost mx-auto mt-5 flex min-h-10">Load more</button>}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
            <p className="text-sm text-muted">{selected.length ? `${selected.length} selected` : multiple ? 'Select one or more images' : 'Select an image'}</p>
            <div className="flex gap-2">
              <Dialog.Close className="btn btn-ghost min-h-10">Cancel</Dialog.Close>
              <button type="button" disabled={!selected.length || uploading.length > 0} onClick={confirm} className="btn btn-primary min-h-10 disabled:opacity-50">
                {multiple ? 'Add selected' : 'Use image'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A single image field (hero background, logo, section image). */
export function ImageField({ label, value, onChange, hint, aspect = 'aspect-[16/9]', allowClear = false }: {
  label: string; value: string | null; onChange: (url: string | null) => void; hint?: string; aspect?: string; allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className="flex items-start gap-4">
        <div className={cn('media-fallback relative w-40 shrink-0 overflow-hidden rounded-lg border border-line', aspect)}>
          {value && <Image src={value} alt="" fill sizes="160px" className="object-cover" />}
        </div>
        <div className="space-y-2">
          <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost min-h-9 px-3 text-sm"><ImagePlus className="size-4" aria-hidden="true" />{value ? 'Replace' : 'Choose image'}</button>
          {allowClear && value && <button type="button" onClick={() => onChange(null)} className="block text-sm text-muted underline-offset-4 hover:text-ink hover:underline">Remove</button>}
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
      </div>
      <MediaPickerDialog open={open} onOpenChange={setOpen} title={label} onSelect={(items) => items[0] && onChange(items[0].url)} />
    </div>
  );
}
