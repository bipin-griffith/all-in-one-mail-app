import { api } from '@/lib/axios';

import type { EmailAiAction, EmailAiCategory, EmailAiPriority } from '@/features/email/api/email.api';
import type { ApiSuccess } from '@/types/api';

export interface CategoryDashboardEmail {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  aiSummary: string | null;
  aiPriority: EmailAiPriority | null;
  aiAction: EmailAiAction | null;
}

export interface CategoryDashboard {
  category: EmailAiCategory;
  total: number;
  byPriority: Record<string, number>;
  byAction: Record<string, number>;
  recent: CategoryDashboardEmail[];
}

export async function getCategoryDashboard(category: EmailAiCategory): Promise<CategoryDashboard> {
  const { data } = await api.get<ApiSuccess<CategoryDashboard>>(`/dashboard/category/${category}`);
  return data.data;
}

export interface TimeseriesBucket {
  date: string;
  total: number;
  unread: number;
}

export async function getTimeseriesStats(
  granularity: 'day' | 'month',
  range: number,
): Promise<TimeseriesBucket[]> {
  const { data } = await api.get<ApiSuccess<TimeseriesBucket[]>>('/dashboard/stats', {
    params: { granularity, range },
  });
  return data.data;
}

export interface TopSender {
  from: string;
  count: number;
  lastReceivedAt: string;
}

export async function getTopSenders(limit = 10): Promise<TopSender[]> {
  const { data } = await api.get<ApiSuccess<TopSender[]>>('/dashboard/top-senders', { params: { limit } });
  return data.data;
}
