import { z } from 'zod';

/**
 * Roles and permissions.
 *
 * The API enforces these on every endpoint; the admin UI reads the same map only to decide what
 * to show. Hiding a button is never the security boundary.
 */
export const TENANT_ROLES = ['owner', 'admin', 'manager', 'agent', 'editor', 'support'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const ROLE_LABELS: Record<TenantRole, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  manager: 'Sales manager',
  agent: 'Agent',
  editor: 'Content editor',
  support: 'Support',
};

export const ROLE_DESCRIPTIONS: Record<TenantRole, string> = {
  owner: 'Full control, including billing and transferring ownership.',
  admin: 'Manages the website, team and settings. Cannot change billing or the owner.',
  manager: 'Manages listings and all leads, and assigns leads to agents.',
  agent: 'Sees listings and only the leads assigned to them.',
  editor: 'Edits website content and listings. No access to leads.',
  support: 'Reads listings and leads to help customers. Cannot change anything.',
};

export const PERMISSIONS = [
  'dashboard:view',
  'properties:read',
  'properties:write',
  'leads:read:all',
  'leads:read:own',
  'leads:write',
  'leads:assign',
  'leads:export',
  'leads:delete',
  'content:write',
  'branding:write',
  'team:read',
  'team:manage',
  'audit:read',
  'domains:manage',
  'billing:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'billing:manage'),
  manager: ['dashboard:view', 'properties:read', 'properties:write', 'leads:read:all', 'leads:write', 'leads:assign', 'leads:export', 'team:read'],
  agent: ['dashboard:view', 'properties:read', 'leads:read:own', 'leads:write'],
  editor: ['dashboard:view', 'properties:read', 'properties:write', 'content:write'],
  support: ['dashboard:view', 'properties:read', 'leads:read:all', 'team:read'],
};

export function can(role: TenantRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Which roles a given role may assign. Only an owner can create or demote another owner. */
export function assignableRoles(actor: TenantRole): TenantRole[] {
  if (actor === 'owner') return [...TENANT_ROLES];
  if (actor === 'admin') return TENANT_ROLES.filter((r) => r !== 'owner');
  return [];
}

/** At least 10 characters with a letter and a number. Length matters more than symbols. */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number');

const email = z.string().trim().toLowerCase().email('Enter a valid email').max(120);

export const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password').max(128) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(32).max(128), password: passwordSchema });
export const acceptInviteSchema = z.object({
  token: z.string().min(32).max(128),
  name: z.string().trim().min(2, 'Enter your name').max(80),
  password: passwordSchema,
});
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export const inviteSchema = z.object({ email, role: z.enum(TENANT_ROLES) });
export const updateMemberSchema = z
  .object({ role: z.enum(TENANT_ROLES).optional(), status: z.enum(['active', 'deactivated']).optional() })
  .refine((v) => v.role !== undefined || v.status !== undefined, 'Nothing to update');

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: TenantRole;
  permissions: Permission[];
  /** Platform operator (sees the "All agencies" section). Never granted by a tenant. */
  platformOwner: boolean;
  membershipId: string;
  agentId: string | null;
  tenant: { id: string; slug: string; name: string };
}
