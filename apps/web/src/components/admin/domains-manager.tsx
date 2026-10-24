'use client';

import { Check, Copy, Globe, Lock, RefreshCw, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { domainProblem, normaliseDomainInput, type DomainDto } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { Notice } from './fields';
import { relativeTime } from './ui';

const STATUS: Record<DomainDto['status'], { label: string; tone: string }> = {
  verified: { label: 'Connected', tone: 'bg-[var(--color-success)]/12 text-[var(--color-success)]' },
  pending: { label: 'Waiting for DNS', tone: 'bg-accent/25 text-[color-mix(in_oklab,var(--color-accent)_45%,black)]' },
  failed: { label: 'Not verified yet', tone: 'bg-accent/25 text-[color-mix(in_oklab,var(--color-accent)_45%,black)]' },
  lost: { label: 'Disconnected', tone: 'bg-[var(--color-error)]/10 text-[var(--color-error)]' },
};
const TLS: Record<DomainDto['tls']['status'], string> = {
  active: 'HTTPS active', pending: 'HTTPS certificate being issued', error: 'HTTPS problem', unknown: 'HTTPS not checked yet',
};

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <code className="min-w-0 truncate rounded bg-ivory px-1.5 py-0.5 font-mono text-xs" title={value}>{value}</code>
      <button
        type="button"
        onClick={async () => { await navigator.clipboard.writeText(value).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-ivory hover:text-ink"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      </button>
    </span>
  );
}

function DomainCard({ d, busy, onVerify, onPrimary, onRemove }: { d: DomainDto; busy: string | null; onVerify: () => void; onPrimary: () => void; onRemove: () => void }) {
  const custom = d.kind === 'custom';
  const canPrimary = d.verified && !d.isPrimary && (d.kind === 'platform' || d.tls.status === 'active');
  return (
    <li className="rounded-[14px] border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Globe className="size-4 text-muted" aria-hidden="true" />
            <a href={`${d.kind === 'platform' && /localhost$/.test(d.hostname) ? 'http' : 'https'}://${d.hostname}`} target="_blank" rel="noopener" className="truncate font-heading text-lg font-semibold hover:underline">{d.hostname}</a>
            {d.isPrimary && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-inverse"><Star className="size-3" aria-hidden="true" />Main address</span>}
            {!custom && <span className="rounded-full bg-ivory px-2.5 py-0.5 text-xs font-semibold text-muted">Platform address</span>}
            {custom && <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS[d.status].tone)}>{STATUS[d.status].label}</span>}
          </p>
          {custom && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {d.verified && <span className="inline-flex items-center gap-1"><Lock className={cn('size-3.5', d.tls.status === 'active' ? 'text-[var(--color-success)]' : '')} aria-hidden="true" />{TLS[d.tls.status]}{d.tls.status === 'active' && d.tls.expiresAt ? ` · renews automatically (current certificate valid to ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(d.tls.expiresAt))})` : ''}</span>}
              {d.lastCheckedAt && <span>Checked {relativeTime(d.lastCheckedAt)}</span>}
              {d.claimExpiresAt && <span>Verify by {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d.claimExpiresAt))} or the domain is released</span>}
            </p>
          )}
          {!custom && <p className="mt-1.5 text-sm text-muted">Always works, even while a custom domain is being set up.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {custom && <button type="button" onClick={onVerify} disabled={!!busy} className="btn btn-ghost min-h-9 px-3 text-sm"><RefreshCw className={cn('size-4', busy === `verify-${d.id}` && 'animate-spin')} aria-hidden="true" />{busy === `verify-${d.id}` ? 'Checking…' : 'Check now'}</button>}
          {canPrimary && <button type="button" onClick={onPrimary} disabled={!!busy} className="btn btn-primary min-h-9 px-3 text-sm">{busy === `primary-${d.id}` ? 'Saving…' : 'Make main address'}</button>}
          {custom && <button type="button" onClick={onRemove} disabled={!!busy} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-[var(--color-error)]/8 hover:text-[var(--color-error)]" aria-label={`Remove ${d.hostname}`}><Trash2 className="size-4" /></button>}
        </div>
      </div>

      {custom && (d.lastError || d.tls.error) && (
        <div className="px-5 pb-4"><Notice tone={d.status === 'lost' ? 'error' : 'info'}>{d.lastError ?? `HTTPS: ${d.tls.error}`}</Notice></div>
      )}

      {custom && (
        <details className="border-t border-line" open={!d.verified}>
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">{d.verified ? 'DNS records' : 'Add these records at your domain provider'}</summary>
          <div className="px-5 pb-5">
            {!d.verified && <p className="mb-3 text-sm text-muted">Sign in where you bought the domain (GoDaddy, Hostinger, Cloudflare, Namecheap…), open its DNS settings and add both records. Changes usually take a few minutes, occasionally up to 24 hours. Then click “Check now”.</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th scope="col" className="py-2 pr-3 font-medium">Type</th><th scope="col" className="py-2 pr-3 font-medium">Name / host</th><th scope="col" className="py-2 pr-3 font-medium">Value / points to</th><th scope="col" className="py-2 font-medium">Status</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {d.records.map((r) => {
                    const ok = r.type === 'TXT' ? d.verified || (d.lastCheckedAt !== null && !/TXT/.test(d.lastError ?? '')) : !!d.routing?.ok;
                    return (
                      <tr key={r.type + r.value}>
                        <td className="py-2.5 pr-3 font-mono text-xs font-semibold">{r.type}</td>
                        <td className="max-w-56 py-2.5 pr-3"><CopyValue value={r.name} label={`${r.type} record name`} /></td>
                        <td className="max-w-72 py-2.5 pr-3"><CopyValue value={r.value} label={`${r.type} record value`} /><span className="mt-1 block text-xs text-muted">{r.purpose}</span></td>
                        <td className="py-2.5 text-xs">{d.lastCheckedAt ? (ok ? <span className="text-[var(--color-success)]">Found</span> : <span className="text-muted">Not found yet</span>) : <span className="text-muted">Not checked</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {d.routing && !d.routing.ok && <p className="mt-2 text-xs text-muted">What we see now: {d.routing.detail}</p>}
          </div>
        </details>
      )}
    </li>
  );
}

export function DomainsManager({ initial }: { initial: DomainDto[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const replace = (d: DomainDto) => setItems((x) => x.map((i) => (i.id === d.id ? d : i)));
  const fail = (e: unknown, fallback: string) => setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : fallback });

  async function add(e: FormEvent) {
    e.preventDefault();
    const host = normaliseDomainInput(input);
    const problem = domainProblem(host);
    if (problem) return setInputError(problem);
    setInputError(null);
    setBusy('add');
    setNotice(null);
    try {
      const d = await adminRequest<DomainDto>('admin/domains', { method: 'POST', body: { hostname: host } });
      setItems((x) => [...x, d]);
      setInput('');
      setNotice({ tone: 'info', text: `Added ${d.hostname}. Add the two DNS records shown below, then click “Check now”.` });
    } catch (err) {
      if (err instanceof AdminRequestError && err.fields[0]) setInputError(err.fields[0].message);
      else fail(err, 'The domain wasn’t added. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function verify(d: DomainDto) {
    setBusy(`verify-${d.id}`);
    setNotice(null);
    try {
      const r = await adminRequest<DomainDto>(`admin/domains/${d.id}/verify`, { method: 'POST' });
      replace(r);
      if (r.verified && !d.verified) setNotice({ tone: 'success', text: `${r.hostname} is connected. ${r.tls.status === 'active' ? 'HTTPS is active, so you can make it your main address.' : 'The HTTPS certificate is being issued; check again in a few minutes.'}` });
    } catch (e) {
      fail(e, 'The check didn’t run. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function primary(d: DomainDto) {
    if (!window.confirm(`Make ${d.hostname} your main address? Visitors on your other addresses will be redirected there, and search engines will use it.`)) return;
    setBusy(`primary-${d.id}`);
    try {
      const r = await adminRequest<{ items: DomainDto[] }>(`admin/domains/${d.id}/primary`, { method: 'POST' });
      setItems(r.items);
      setNotice({ tone: 'success', text: `${d.hostname} is now your main address.` });
      router.refresh();
    } catch (e) {
      fail(e, 'That didn’t save.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(d: DomainDto) {
    if (!window.confirm(`Remove ${d.hostname}? It will stop showing your website.${d.isPrimary ? ' Your platform address becomes the main address.' : ''}`)) return;
    setBusy(`remove-${d.id}`);
    try {
      await adminRequest(`admin/domains/${d.id}`, { method: 'DELETE' });
      setItems((x) => x.filter((i) => i.id !== d.id));
      router.refresh();
      const fresh = await adminRequest<{ items: DomainDto[] }>('admin/domains');
      setItems(fresh.items);
    } catch (e) {
      fail(e, 'The domain wasn’t removed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} noValidate className="rounded-[14px] border border-line bg-white p-5">
        <label htmlFor="new-domain" className="font-heading font-semibold">Connect a domain you own</label>
        <p className="mt-1 text-sm text-muted">We recommend <strong>www.</strong>yourdomain.com. Root domains (yourdomain.com) work too if your provider supports ALIAS/ANAME records.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input id="new-domain" value={input} onChange={(e) => setInput(e.target.value)} placeholder="www.youragency.com" className="field sm:max-w-md" aria-invalid={!!inputError} aria-describedby={inputError ? 'new-domain-err' : undefined} autoComplete="off" spellCheck={false} />
          <button type="submit" disabled={busy === 'add' || !input.trim()} className="btn btn-primary min-h-12 disabled:opacity-50">{busy === 'add' ? 'Adding…' : 'Add domain'}</button>
        </div>
        {inputError && <p id="new-domain-err" className="mt-1.5 text-sm text-[var(--color-error)]" role="alert">{inputError}</p>}
      </form>
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
      <ul className="space-y-4" aria-label="Domains">
        {items.map((d) => <DomainCard key={d.id} d={d} busy={busy} onVerify={() => verify(d)} onPrimary={() => primary(d)} onRemove={() => remove(d)} />)}
      </ul>
    </div>
  );
}
