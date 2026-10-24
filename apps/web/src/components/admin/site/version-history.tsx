'use client';

import { useState } from 'react';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { Notice } from '../fields';
import { PART_LABEL, type Part } from './draft-api';

export interface VersionRow { version: number; note: string; publishedBy: string; changed: Part[]; at: string }

const fmt = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export function VersionHistory({ versions, current, canRestore, onRestored }: { versions: VersionRow[]; current: number; canRestore: boolean; onRestored: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  async function restore(v: number) {
    if (!window.confirm(`Load version ${v} into your draft? This replaces any unpublished changes. The live site doesn’t change until you publish.`)) return;
    setBusy(v);
    try {
      await adminRequest(`admin/site/versions/${v}/restore`, { method: 'POST' });
      setNotice({ tone: 'success', text: `Version ${v} is now in your draft. Review it in the preview, then publish to make it live.` });
      onRestored();
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'That version couldn’t be restored.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Every publish is kept, so you can go back to any earlier version of your site.</p>
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
      <ol className="divide-y divide-line rounded-[14px] border border-line bg-white">
        {versions.map((v) => (
          <li key={v.version} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ivory font-heading text-sm font-bold">v{v.version}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{v.note || `Updated ${v.changed.map((c) => PART_LABEL[c].toLowerCase()).join(', ')}`}{v.version === current && <span className="ml-2 rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-xs font-semibold text-[var(--color-success)]">Live</span>}</p>
              <p className="text-sm text-muted">{v.publishedBy || 'System'} · {fmt.format(new Date(v.at))} · {v.changed.map((c) => PART_LABEL[c]).join(', ')}</p>
            </div>
            {canRestore && v.version !== current && (
              <button type="button" onClick={() => restore(v.version)} disabled={busy !== null} className="btn btn-ghost min-h-9 px-3 text-sm">{busy === v.version ? 'Loading…' : 'Restore to draft'}</button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
