import { adminData, requireUser } from '@/lib/admin-api';
import { TeamManager, type TeamData } from '@/components/admin/team-manager';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Team & roles' };

export default async function TeamPage() {
  const [user, res] = await Promise.all([requireUser(), adminData<TeamData>('admin/team')]);
  if (!res.ok) return <Forbidden message={res.message} />;
  return (
    <>
      <PageHeader title="Team & roles" description="Everyone with access to this site’s Admin Panel. Changes take effect immediately, including for people who are signed in." />
      <TeamManager data={res.data} actor={user} />
    </>
  );
}
