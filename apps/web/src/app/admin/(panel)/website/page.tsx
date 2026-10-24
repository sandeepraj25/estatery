import type { Homepage, SitePages, ThemeTokens } from '@estatery/shared';
import { adminData, requireUser } from '@/lib/admin-api';
import type { DraftState } from '@/components/admin/site/draft-api';
import type { VersionRow } from '@/components/admin/site/version-history';
import { WebsiteEditor } from '@/components/admin/site/website-editor';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Website' };

export default async function WebsitePage() {
  const user = await requireUser();
  if (!user.permissions.includes('content:write') && !user.permissions.includes('branding:write')) {
    return <Forbidden message="Your role can’t edit the website." />;
  }
  const [draft, versions, defaults] = await Promise.all([
    adminData<DraftState>('admin/site/draft'),
    adminData<{ items: VersionRow[] }>('admin/site/versions'),
    adminData<{ homepage: Homepage; pages: SitePages; themePresets: Array<{ id: string; label: string; tokens: ThemeTokens; isDefault: boolean }> }>('admin/site/defaults'),
  ]);
  if (!draft.ok) return <Forbidden message={draft.message} />;
  if (!versions.ok || !defaults.ok) return <Forbidden message={!versions.ok ? versions.message : (defaults as { message: string }).message} />;
  const key = `${draft.data.version}-${Object.values(draft.data.revisions).join('.')}`;
  return (
    <>
      <PageHeader title="Website" description="Edit your homepage, pages, theme and business details. Changes stay in a private draft until you publish." />
      <WebsiteEditor key={key} initial={draft.data} versions={versions.data.items} defaults={defaults.data} user={user} />
    </>
  );
}
