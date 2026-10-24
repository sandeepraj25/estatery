import { Activity, BookUser, Building2, CreditCard, Globe, Globe2, Images, Inbox, LayoutDashboard, Newspaper, Signpost, MonitorSmartphone, UserCog, Users, type LucideIcon } from 'lucide-react';
import type { Permission, SessionUser } from '@estatery/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown if the user has any of these permissions. */
  anyOf?: Permission[];
  platformOnly?: boolean;
}

/** Sections that exist today. New sections are added here as each phase ships. */
export const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, anyOf: ['dashboard:view'] },
  { href: '/admin/properties', label: 'Properties', icon: Building2, anyOf: ['properties:read'] },
  { href: '/admin/leads', label: 'Leads', icon: Inbox, anyOf: ['leads:read:all', 'leads:read:own'] },
  { href: '/admin/website', label: 'Website', icon: MonitorSmartphone, anyOf: ['content:write', 'branding:write'] },
  { href: '/admin/articles', label: 'Articles', icon: Newspaper, anyOf: ['content:write'] },
  { href: '/admin/library', label: 'Content library', icon: BookUser, anyOf: ['content:write'] },
  { href: '/admin/media', label: 'Media', icon: Images, anyOf: ['properties:write', 'content:write'] },
  { href: '/admin/redirects', label: 'Redirects', icon: Signpost, anyOf: ['content:write'] },
  { href: '/admin/domains', label: 'Domains', icon: Globe, anyOf: ['domains:manage'] },
  { href: '/admin/team', label: 'Team & roles', icon: Users, anyOf: ['team:read'] },
  { href: '/admin/activity', label: 'Activity log', icon: Activity, anyOf: ['audit:read'] },
  { href: '/admin/billing', label: 'Plan & billing', icon: CreditCard, anyOf: ['billing:manage'] },
  { href: '/admin/account', label: 'Your account', icon: UserCog },
];

export const PLATFORM_NAV: NavItem[] = [{ href: '/admin/platform', label: 'All agencies', icon: Globe2, platformOnly: true }];

export function visibleNav(user: SessionUser) {
  const allowed = (i: NavItem) => (!i.anyOf || i.anyOf.some((p) => user.permissions.includes(p))) && (!i.platformOnly || user.platformOwner);
  return { main: NAV.filter(allowed), platform: PLATFORM_NAV.filter(allowed) };
}
