import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@estatery/shared';
import { requireUser } from '@/lib/admin-api';
import { ChangePasswordForm, SignOutEverywhere } from '@/components/admin/account-forms';
import { PageHeader, Panel } from '@/components/admin/ui';

export const metadata = { title: 'Your account' };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Your account" />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Panel title="Profile">
          <dl className="divide-y divide-line text-sm">
            {[
              ['Name', user.name],
              ['Email', user.email],
              ['Site', user.tenant.name],
              ['Role', ROLE_LABELS[user.role]],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3.5"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
          <p className="border-t border-line px-5 py-4 text-sm text-muted">{ROLE_DESCRIPTIONS[user.role]} To change your role, ask an administrator.</p>
        </Panel>
        <Panel title="Password">
          <div className="p-5"><ChangePasswordForm /></div>
        </Panel>
        <Panel title="Sessions" className="xl:col-span-2">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm text-muted">Lost a phone or signed in on a shared computer? Signing out everywhere ends every session for your account on this site.</p>
            <SignOutEverywhere />
          </div>
        </Panel>
      </div>
    </>
  );
}
