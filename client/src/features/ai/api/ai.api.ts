import { api } from '@/lib/axios';

import type { ApiSuccess } from '@/types/api';

export type AiJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface AiJob {
  jobId: string;
  status: AiJobStatus;
  type: 'summarize' | 'draft_reply' | 'classify';
  result: { summary?: string; draft?: string; category?: string } | null;
  error: string | null;
}

async function enqueue(path: string, threadId: string): Promise<{ jobId: string }> {
  const { data } = await api.post<ApiSuccess<{ jobId: string }>>(path, { threadId });
  return data.data;
}

export const enqueueSummarize = (threadId: string) => enqueue('/ai/summarize', threadId);
export const enqueueDraftReply = (threadId: string) => enqueue('/ai/draft-reply', threadId);
export const enqueueClassify = (threadId: string) => enqueue('/ai/classify', threadId);

export async function getAiJob(jobId: string): Promise<AiJob> {
  const { data } = await api.get<ApiSuccess<AiJob>>(`/ai/jobs/${jobId}`);
  return data.data;
}
