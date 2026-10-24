import { ForgotForm } from '@/components/admin/auth-forms';

export const metadata = { title: 'Reset password' };

export default function ForgotPage() {
  return (
    <>
      <h1 className="font-heading text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-2 mb-8 text-muted">Enter the email you sign in with and we’ll send you a link to choose a new password.</p>
      <ForgotForm />
    </>
  );
}
