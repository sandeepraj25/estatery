'use client';

import { useEffect } from 'react';

/** Sends an error-screen event to the server once (no personal data: message, digest, path). */
export function useReportError(error: Error & { digest?: string }, area: 'site' | 'admin') {
  useEffect(() => {
    const payload = JSON.stringify({ message: error.message.slice(0, 500), digest: error.digest, path: window.location.pathname, area });
    try {
      if (!navigator.sendBeacon?.('/api/client-errors', new Blob([payload], { type: 'application/json' }))) {
        void fetch('/api/client-errors', { method: 'POST', body: payload, headers: { 'content-type': 'application/json' }, keepalive: true });
      }
    } catch {
      /* reporting must never break the error screen */
    }
  }, [error, area]);
}
