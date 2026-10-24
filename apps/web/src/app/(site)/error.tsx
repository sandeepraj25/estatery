'use client';

import Link from 'next/link';
import { useReportError } from '@/components/errors/use-report-error';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportError(error, 'site');
  return (
    <div className="container-site grid min-h-[70vh] place-items-center pt-32 pb-24 text-center">
      <div className="max-w-md">
        <h1 className="type-display type-section">This page didn’t load.</h1>
        <p className="mt-4 text-muted">Something went wrong on our side. Try again in a moment — or go back to the homepage.</p>
        <div className="mt-8 flex justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">Try again</button>
          <Link href="/" className="btn btn-ghost">Homepage</Link>
        </div>
        {error.digest && <p className="mt-6 text-xs text-muted">Reference {error.digest}</p>}
      </div>
    </div>
  );
}
