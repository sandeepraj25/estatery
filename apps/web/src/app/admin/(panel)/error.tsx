'use client';

import Link from 'next/link';
import { useReportError } from '@/components/errors/use-report-error';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportError(error, 'admin');
  return (
    <div className="rounded-[14px] border border-line bg-white px-6 py-14 text-center">
      <h1 className="font-heading text-lg font-semibold">This section didn’t load</h1>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">The error has been reported. Try again; if it keeps happening, contact support and quote the reference below.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary min-h-10">Try again</button>
        <Link href="/admin" className="btn btn-ghost min-h-10">Dashboard</Link>
      </div>
      {error.digest && <p className="mt-5 text-xs text-muted">Reference {error.digest}</p>}
    </div>
  );
}
