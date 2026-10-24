import type { LeadStatus } from '@estatery/shared';

export interface LeadRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  intent: string;
  status: LeadStatus;
  source: string;
  budget: string | null;
  preferredDate: string | null;
  property: { title: string; slug: string } | null;
  agentId: string | null;
  agent: string | null;
  nextReminderAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface LeadDetail {
  lead: LeadRow & { lostReason: string | null; firstContactedAt: string | null; closedAt: string | null };
  activity: Array<{ id: string; type: string; actorName: string; body: string; meta: Record<string, unknown>; createdAt: string }>;
  reminders: Array<{ id: string; note: string; dueAt: string; doneAt: string | null; assigneeId: string; assignee: string; overdue: boolean }>;
  assignableAgents: Array<{ id: string; name: string; title: string }>;
  teammates: Array<{ id: string; name: string }>;
}

export interface BoardData {
  columns: Array<{ status: LeadStatus; label: string; total: number; items: LeadRow[] }>;
  closed30d: { won: number; lost: number };
}

export const INTENT_LABELS: Record<string, string> = { enquiry: 'Question', callback: 'Call back', 'site-visit': 'Site visit', general: 'Home search' };
