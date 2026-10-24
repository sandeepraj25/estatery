'use client';

import type { Homepage, SitePages, SiteSettings, ThemeTokens } from '@estatery/shared';
import { adminRequest } from '@/lib/admin-client';

export type Part = 'settings' | 'theme' | 'homepage' | 'pages';
export interface DraftState {
  draft: { settings: SiteSettings; theme: ThemeTokens; homepage: Homepage; pages: SitePages };
  revisions: Record<Part, number>;
  changed: Part[];
  version: number;
  lastPublished: { at: string; by: string } | null;
}

export const PART_LABEL: Record<Part, string> = { homepage: 'Homepage', pages: 'Pages', theme: 'Theme', settings: 'Business details' };

export function saveDraft(part: Part, value: unknown, baseRevision: number) {
  return adminRequest<{ revision: number }>(`admin/site/draft/${part}`, { method: 'PUT', body: { value, baseRevision } });
}

export const fieldErrors = (fields: Array<{ path: string; message: string }>) => Object.fromEntries(fields.map((f) => [f.path, f.message]));
