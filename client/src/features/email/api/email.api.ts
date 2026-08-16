import { api } from '@/lib/axios';

import type { ApiSuccess } from '@/types/api';

export interface EmailAccount {
  _id: string;
  emailAddress: string;
  provider: 'google';
  syncStatus: 'idle' | 'syncing' | 'error';
  /** When the current 'syncing' status began — see AppShell's staleness check. */
  syncStartedAt: string | null;
  lastSyncedAt: string | null;
}

export interface Thread {
  _id: string;
  subject: string;
  participants: string[];
  lastMessageAt: string;
  labels: string[];
  aiCategory: string | null;
  isRead: boolean;
}

export interface Email {
  _id: string;
  from: string;
  to: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  receivedAt: string;
}

export interface ListThreadsParams {
  page?: number;
  limit?: number;
  category?: string;
  q?: string;
}

export type EmailAiCategory =
  | 'jobs'
  | 'shopping'
  | 'finance'
  | 'bills'
  | 'marketing'
  | 'personal'
  | 'government'
  | 'travel'
  | 'university'
  | 'spam';

export type EmailAiPriority = 'high' | 'medium' | 'low';
export type EmailAiAction = 'reply' | 'ignore' | 'archive' | 'reminder' | 'follow_up';

/** Flat, per-message shape returned by GET /emails — see docs/API.md. */
export interface EmailListItem {
  _id: string;
  thread: string;
  subject: string;
  from: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
  category: 'inbox' | 'sent' | 'drafts' | 'promotions' | 'social' | 'other';
  aiCategory: EmailAiCategory | null;
  aiPriority: EmailAiPriority | null;
  aiAction: EmailAiAction | null;
  aiSummary: string | null;
}

export interface ListEmailsParams {
  page?: number;
  limit?: number;
  category?: string;
  aiCategory?: EmailAiCategory;
  aiPriority?: EmailAiPriority;
  aiAction?: EmailAiAction;
  isRead?: boolean;
  threadId?: string;
  q?: string;
}

export async function listEmailAccounts(): Promise<EmailAccount[]> {
  const { data } = await api.get<ApiSuccess<EmailAccount[]>>('/email-accounts');
  return data.data;
}

export async function syncEmailAccount(id: string): Promise<{ jobId: string }> {
  const { data } = await api.post<ApiSuccess<{ jobId: string }>>(`/email-accounts/${id}/sync`);
  return data.data;
}

export async function listThreads(
  params: ListThreadsParams,
): Promise<{ items: Thread[]; total: number; page: number; limit: number }> {
  const { data } = await api.get<ApiSuccess<Thread[]>>('/threads', { params });
  return {
    items: data.data,
    total: data.meta?.total ?? 0,
    page: data.meta?.page ?? 1,
    limit: data.meta?.limit ?? 20,
  };
}

export async function getThread(id: string): Promise<{ thread: Thread; emails: Email[] }> {
  const { data } = await api.get<ApiSuccess<{ thread: Thread; emails: Email[] }>>(`/threads/${id}`);
  return data.data;
}

export async function updateThread(id: string, patch: Partial<Pick<Thread, 'isRead' | 'labels'>>) {
  const { data } = await api.patch<ApiSuccess<Thread>>(`/threads/${id}`, patch);
  return data.data;
}

export async function listEmails(
  params: ListEmailsParams,
): Promise<{ items: EmailListItem[]; total: number; page: number; limit: number }> {
  const { data } = await api.get<ApiSuccess<EmailListItem[]>>('/emails', { params });
  return {
    items: data.data,
    total: data.meta?.total ?? 0,
    page: data.meta?.page ?? 1,
    limit: data.meta?.limit ?? 20,
  };
}
