'use client';

import { Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { AdminRequestError, adminRequest, uploadImage, type MediaItem } from '@/lib/admin-client';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { Notice } from './fields';
import { EmptyState, Panel } from './ui';

export function MediaLibrary({ initial, totalPages }: { initial: MediaItem[]; totalPages: number }) {
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(totalPages);
  const [uploading, setUploading] = useState(0);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList) {
    setNotice(null);
    for (const f of [...files].slice(0, 20)) {
      setUploading((n) => n + 1);
      try {
        const item = await uploadImage(f);
        setItems((x) => [item, ...x]);
      } catch (e) {
        setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : `“${f.name}” didn’t upload.` });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function saveAlt(m: MediaItem, alt: string) {
    if (alt === m.alt) return;
    try {
      const u = await adminRequest<MediaItem>(`admin/media/${m.id}`, { method: 'PATCH', body: { alt } });
      setItems((x) => x.map((i) => (i.id === u.id ? u : i)));
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'The description didn’t save.' });
    }
  }

  async function remove(m: MediaItem) {
    if (!window.confirm('Delete this image? This can’t be undone.')) return;
    try {
      await adminRequest(`admin/media/${m.id}`, { method: 'DELETE' });
      setItems((x) => x.filter((i) => i.id !== m.id));
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'The image couldn’t be deleted.' });
    }
  }

  async function more() {
    const r = await adminRequest<{ items: MediaItem[]; totalPages: number }>(`admin/media?page=${page + 1}`);
    setItems((x) => [...x, ...r.items]);
    setPage(page + 1);
    setPages(r.totalPages);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Images are converted to WebP, resized to at most 2560px and stripped of location data when uploaded.</p>
        <button type="button" onClick={() => input.current?.click()} className="btn btn-primary min-h-10"><Upload className="size-4" aria-hidden="true" />{uploading ? `Uploading ${uploading}…` : 'Upload images'}</button>
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" aria-label="Upload images" onChange={(e) => { if (e.target.files) void onFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {notice && <div className="mb-4"><Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice></div>}
      {items.length === 0 ? (
        <Panel><EmptyState title="No images yet" body="Upload photos once and reuse them across listings and website sections." /></Panel>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((m) => (
            <li key={m.id} className="rounded-xl border border-line bg-white p-2">
              <div className="media-fallback relative aspect-[4/3] overflow-hidden rounded-lg">
                <Image src={m.url} alt={m.alt || m.originalName} fill sizes="240px" className="object-cover" />
              </div>
              <label htmlFor={`m-${m.id}`} className="sr-only">Description</label>
              <input id={`m-${m.id}`} defaultValue={m.alt} maxLength={200} placeholder="Describe this image" onBlur={(e) => saveAlt(m, e.target.value)} className="mt-2 h-8 w-full rounded-md border border-line px-2 text-sm" />
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                <span>{m.width}×{m.height} · {Math.round(m.bytes / 1024)} KB</span>
                <button type="button" onClick={() => remove(m)} className="grid size-7 place-items-center rounded-md hover:bg-[var(--color-error)]/8 hover:text-[var(--color-error)]" aria-label="Delete image"><Trash2 className="size-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {page < pages && <button type="button" onClick={more} className="btn btn-ghost mx-auto mt-6 flex min-h-10 bg-white">Load more</button>}
    </>
  );
}
