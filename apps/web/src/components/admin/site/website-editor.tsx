'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Eye, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Homepage, SessionUser, SitePages, ThemeTokens } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { Notice } from '../fields';
import { PART_LABEL, type DraftState, type Part } from './draft-api';
import { HomepageEditor } from './homepage-editor';
import { PagesEditor } from './pages-editor';
import { PreviewPane } from './preview-pane';
import { SettingsEditor } from './settings-editor';
import { ThemeEditor } from './theme-editor';
import { VersionHistory, type VersionRow } from './version-history';

type Tab = 'homepage' | 'pages' | 'theme' | 'settings' | 'history';

export function WebsiteEditor({ initial, versions, defaults, user }: {
  initial: DraftState;
  versions: VersionRow[];
  defaults: { homepage: Homepage; pages: SitePages; themePresets: Array<{ id: string; label: string; tokens: ThemeTokens; isDefault: boolean }> };
  user: SessionUser;
}) {
  const router = useRouter();
  const canContent = user.permissions.includes('content:write');
  const canBrand = user.permissions.includes('branding:write');
  const [tab, setTab] = useState<Tab>(canContent ? 'homepage' : 'theme');
  const [changed, setChanged] = useState<Part[]>(initial.changed);
  const [previewKey, setPreviewKey] = useState(0);
  const [pagePath, setPagePath] = useState('/about');
  const [showPreview, setShowPreview] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'publish' | 'discard' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const canPublish = changed.every((p) => (p === 'homepage' || p === 'pages' ? canContent : canBrand));

  async function refreshSummary() {
    try {
      const d = await adminRequest<DraftState>('admin/site/draft');
      setChanged(d.changed);
    } catch {
      /* the next save will surface any problem */
    }
    setPreviewKey((k) => k + 1);
  }

  async function publish() {
    setBusy('publish');
    setNotice(null);
    try {
      const r = await adminRequest<{ version: number }>('admin/site/publish', { method: 'POST', body: { note } });
      setPublishOpen(false);
      setNote('');
      setNotice({ tone: 'success', text: `Published version ${r.version}. Your website now shows these changes.` });
      router.refresh();
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'Publishing didn’t complete. Nothing changed on your live site.' });
      setPublishOpen(false);
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!window.confirm('Discard every unpublished change? Your draft goes back to what’s live now. This can’t be undone.')) return;
    setBusy('discard');
    try {
      await adminRequest('admin/site/discard', { method: 'POST' });
      router.refresh();
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'Changes weren’t discarded. Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: 'homepage', label: 'Homepage', show: true },
    { id: 'pages', label: 'Pages', show: true },
    { id: 'theme', label: 'Theme', show: true },
    { id: 'settings', label: 'Business details', show: true },
    { id: 'history', label: 'Version history', show: true },
  ];

  return (
    <div>
      {/* Publish bar */}
      <div className={cn('mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-5 py-3.5', changed.length ? 'border-accent/60 bg-accent/10' : 'border-line bg-white')}>
        <div>
          <p className="font-medium">{changed.length ? `Unpublished changes: ${changed.map((p) => PART_LABEL[p]).join(', ')}` : 'Everything is published'}</p>
          <p className="text-sm text-muted">
            Live: version {initial.version}{initial.lastPublished ? ` · published by ${initial.lastPublished.by} on ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(initial.lastPublished.at))}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/?preview=draft" target="_blank" rel="noopener" className="btn btn-ghost min-h-10 bg-white"><Eye className="size-4" aria-hidden="true" />Preview</a>
          {changed.length > 0 && <button type="button" onClick={discard} disabled={!!busy || !canPublish} className="btn btn-ghost min-h-10 bg-white">{busy === 'discard' ? 'Discarding…' : 'Discard changes'}</button>}
          <button type="button" onClick={() => setPublishOpen(true)} disabled={!changed.length || !!busy || !canPublish} className="btn btn-accent min-h-10 disabled:opacity-50" title={!canPublish ? 'Your role can’t publish changes to the theme or business details' : undefined}>
            Publish
          </button>
        </div>
      </div>
      {!canPublish && changed.length > 0 && <div className="mb-4"><Notice tone="info">The draft includes theme or business-detail changes, which only owners and administrators can publish.</Notice></div>}
      {notice && <div className="mb-4"><Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice></div>}

      <div className="mb-5 flex items-center justify-between gap-3 border-b border-line">
        <div role="tablist" aria-label="Website editor" className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}
              className={cn('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors', tab === t.id ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink')}>
              {t.label}{t.id !== 'history' && changed.includes(t.id as Part) && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" aria-label="(unpublished changes)" />}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setShowPreview((v) => !v)} className="hidden items-center gap-2 pb-2 text-sm text-muted hover:text-ink 2xl:flex" aria-pressed={showPreview}>
          {showPreview ? <PanelRightClose className="size-4" aria-hidden="true" /> : <PanelRightOpen className="size-4" aria-hidden="true" />}{showPreview ? 'Hide preview' : 'Show preview'}
        </button>
      </div>

      <div className={cn('grid gap-6', showPreview && tab !== 'history' && '2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-w-0">
          {tab === 'homepage' && <HomepageEditor initial={initial.draft.homepage} revision={initial.revisions.homepage} defaults={defaults.homepage} canEdit={canContent} onSaved={refreshSummary} />}
          {tab === 'pages' && <PagesEditor initial={initial.draft.pages} revision={initial.revisions.pages} defaults={defaults.pages} canEdit={canContent} onSaved={refreshSummary} onSelect={setPagePath} />}
          {tab === 'theme' && <ThemeEditor initial={initial.draft.theme} revision={initial.revisions.theme} presets={defaults.themePresets} canEdit={canBrand} onSaved={refreshSummary} />}
          {tab === 'settings' && <SettingsEditor initial={initial.draft.settings} revision={initial.revisions.settings} canEdit={canBrand} onSaved={refreshSummary} />}
          {tab === 'history' && <VersionHistory versions={versions} current={initial.version} canRestore={canContent && canBrand} onRestored={() => router.refresh()} />}
        </div>
        {showPreview && tab !== 'history' && (
          <div className="hidden h-[calc(100dvh-9rem)] 2xl:sticky 2xl:top-20 2xl:block">
            <PreviewPane reloadKey={previewKey} path={tab === 'pages' ? pagePath : '/'} />
          </div>
        )}
      </div>

      <Dialog.Root open={publishOpen} onOpenChange={setPublishOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-lift outline-none">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="font-heading text-xl font-semibold">Publish to your website?</Dialog.Title>
              <Dialog.Close className="grid size-9 place-items-center rounded-lg hover:bg-ivory" aria-label="Close"><X className="size-5" /></Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-sm text-muted">
              Visitors will see your changes to the {changed.map((p) => PART_LABEL[p].toLowerCase()).join(', ')} straight away. The current live version is kept in your history if you need to go back.
            </Dialog.Description>
            <label htmlFor="publish-note" className="mt-5 block text-sm font-medium">What changed? <span className="font-normal text-muted">(optional)</span></label>
            <input id="publish-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. New hero photo for the monsoon campaign" className="field mt-1.5" />
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close className="btn btn-ghost min-h-10">Cancel</Dialog.Close>
              <button type="button" onClick={publish} disabled={busy === 'publish'} className="btn btn-accent min-h-10">{busy === 'publish' ? 'Publishing…' : 'Publish now'}</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
