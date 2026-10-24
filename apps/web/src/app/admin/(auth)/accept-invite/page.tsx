import Link from 'next/link';
import { ApiError, apiFetch } from '@/lib/api';
import { AcceptInviteForm } from '@/components/admin/auth-forms';

export const metadata = { title: 'Accept invitation' };

interface Preview { email: string; roleLabel: string; agency: string; hasAccount: boolean }

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let preview: Preview | null = null;
  let error = 'This invitation link isn’t complete. Open it from your email again.';
  if (token && /^[\w-]{32,128}$/.test(token)) {
    try {
      preview = await apiFetch<Preview>(`/v1/auth/invites/${token}`);
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'We couldn’t check this invitation. Try again shortly.';
    }
  }
  if (!preview || !token) {
    return (
      <>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Invitation unavailable</h1>
        <p className="mt-2 mb-8 text-muted">{error}</p>
        <Link href="/admin/login" className="btn btn-ghost w-full">Go to sign in</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="font-heading text-2xl font-bold tracking-tight">Join {preview.agency}</h1>
      <p className="mt-2 mb-8 text-muted">
        You’ve been invited as <strong className="text-ink">{preview.roleLabel}</strong> with <strong className="text-ink">{preview.email}</strong>.
      </p>
      <AcceptInviteForm token={token} hasAccount={preview.hasAccount} />
    </>
  );
}
