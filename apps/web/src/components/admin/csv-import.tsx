'use client';

import { FileUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { Notice } from './fields';
import { Panel } from './ui';

interface Report { created: number; updated: number; errors: Array<{ row: number; messages: string[] }>; dryRun: boolean }

/** Two steps: check the file (nothing is saved), then import. Imports are all-or-nothing. */
export function CsvImport() {
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Report | null>(null);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminRequest<Report>('admin/properties/import', { method: 'POST', body: { csv: file.text, dryRun } });
      if (dryRun) setReport(r);
      else {
        setDone(r);
        setReport(null);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof AdminRequestError ? e.message : 'The import didn’t run. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Panel>
        <div className="p-6">
          <Notice tone="success">Imported {done.created} new {done.created === 1 ? 'draft' : 'drafts'} and updated {done.updated} {done.updated === 1 ? 'listing' : 'listings'}.</Notice>
          <div className="mt-5 flex gap-2">
            <Link href="/admin/properties?status=draft" className="btn btn-primary min-h-10">Review new drafts</Link>
            <button type="button" className="btn btn-ghost min-h-10" onClick={() => { setDone(null); setFile(null); }}>Import another file</button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel title="1. Choose a CSV file">
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted">
            Use the same columns as the export. Rows whose <code className="rounded bg-ivory px-1">slug</code> matches an existing listing update it; other rows become new drafts.
            Separate multiple amenities or image URLs with <code className="rounded bg-ivory px-1">|</code>. Up to 500 rows.
          </p>
          <a href="/api/admin/admin/properties/export.csv" className="inline-block text-sm font-semibold underline decoration-accent underline-offset-4">Download your current listings as a template</a>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line p-5 hover:border-ink/40">
            <FileUp className="size-5 text-muted" aria-hidden="true" />
            <span className="text-sm">{file ? <><strong>{file.name}</strong> — choose a different file</> : 'Choose a .csv file'}</span>
            <input
              type="file" accept=".csv,text/csv" className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setReport(null);
                setError(null);
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) return setError('Files must be under 2 MB. Split large files into several imports.');
                setFile({ name: f.name, text: await f.text() });
              }}
            />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <button type="button" disabled={!file || busy} onClick={() => run(true)} className="btn btn-primary min-h-10 disabled:opacity-50">{busy && !report ? 'Checking…' : 'Check file'}</button>
        </div>
      </Panel>

      {report && (
        <Panel title="2. Review and import">
          <div className="space-y-4 p-5">
            {report.errors.length ? (
              <>
                <Notice tone="error">{report.errors.length} {report.errors.length === 1 ? 'row needs' : 'rows need'} fixing. Nothing will be imported until every row is valid.</Notice>
                <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
                  {report.errors.map((e) => (
                    <li key={e.row} className="px-4 py-2.5"><span className="font-semibold">Row {e.row}:</span> {e.messages.join('; ')}</li>
                  ))}
                </ul>
              </>
            ) : (
              <Notice tone="success">The file looks good: {report.created} new {report.created === 1 ? 'draft' : 'drafts'} and {report.updated} {report.updated === 1 ? 'update' : 'updates'}.</Notice>
            )}
            <button type="button" disabled={busy || report.errors.length > 0} onClick={() => run(false)} className="btn btn-accent min-h-10 disabled:opacity-50">{busy ? 'Importing…' : `Import ${report.created + report.updated} rows`}</button>
          </div>
        </Panel>
      )}
    </div>
  );
}
