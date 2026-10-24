'use client';

import { useState } from 'react';
import type { CrmSettings } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { Notice, TagsField, Toggle, useUnsavedGuard } from '../fields';

export function CrmSettingsForm({ initial, emailConfigured }: { initial: CrmSettings; emailConfigured: boolean }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  useUnsavedGuard(dirty);

  async function save() {
    const bad = s.notifyEmails.find((e) => !/^\S+@\S+\.\S+$/.test(e));
    if (bad) return setNotice({ tone: 'error', text: `“${bad}” isn’t a valid email address.` });
    setBusy(true);
    try {
      const r = await adminRequest<CrmSettings>('admin/crm/settings', { method: 'PUT', body: s });
      setS(r);
      setSaved(r);
      setNotice({ tone: 'success', text: 'Saved. New enquiries will follow these rules.' });
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'Settings didn’t save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {!emailConfigured && <Notice tone="info">Outgoing email isn’t configured on this server yet (SMTP), so notifications are recorded but not delivered. Your platform administrator can set it up.</Notice>}
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
      <section className="space-y-5 rounded-[14px] border border-line bg-white p-5">
        <h2 className="font-heading font-semibold">Who hears about new enquiries</h2>
        <Toggle label="Email the assigned advisor" hint="The advisor on the listing (or the one chosen by round-robin) gets every enquiry straight away." checked={s.notifyAssignedAgent} onChange={(v) => setS({ ...s, notifyAssignedAgent: v })} />
        <TagsField label="Also email these addresses" hint="e.g. a shared sales inbox. Press Enter after each address." value={s.notifyEmails} onChange={(v) => setS({ ...s, notifyEmails: v.map((x) => x.toLowerCase()) })} max={10} />
      </section>
      <section className="space-y-5 rounded-[14px] border border-line bg-white p-5">
        <h2 className="font-heading font-semibold">Assignment</h2>
        <Toggle label="Share unassigned enquiries in turn" hint="Enquiries that don’t come from a listing with an advisor are given to active advisors one after another." checked={s.roundRobin} onChange={(v) => setS({ ...s, roundRobin: v })} />
      </section>
      <button type="button" onClick={save} disabled={!dirty || busy} className="btn btn-primary min-h-10 disabled:opacity-50">{busy ? 'Saving…' : dirty ? 'Save settings' : 'Saved'}</button>
    </div>
  );
}
