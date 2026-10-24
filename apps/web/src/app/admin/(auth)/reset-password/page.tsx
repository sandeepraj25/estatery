import Link from 'next/link';
import { ResetForm } from '@/components/admin/auth-forms';

export const metadata = { title: 'Choose a new password' };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || token.length < 32) {
    return (
      <>
        <h1 className="font-heading text-2xl font-bold tracking-tight">This link isn’t complete</h1>
        <p className="mt-2 mb-8 text-muted">Open the link from your email again, or request a new one.</p>
        <Link href="/admin/forgot-password" className="btn btn-primary w-full">Request a new link</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="font-heading text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 mb-8 text-muted">You’ll be signed out on all other devices.</p>
      <ResetForm token={token} />
    </>
  );
}
