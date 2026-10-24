import { Suspense } from 'react';
import { LoginForm } from '@/components/admin/auth-forms';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <>
      <h1 className="font-heading text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-2 mb-8 text-muted">Manage listings, enquiries and your website.</p>
      <Suspense><LoginForm /></Suspense>
    </>
  );
}
