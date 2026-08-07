import { api } from '@/lib/axios';

import type { ApiSuccess } from '@/types/api';

export interface ChatSource {
  emailId: string;
  subject: string;
  from: string;
  receivedAt: string;
  score: number;
}

export interface ChatResult {
  answer: string;
  sources: ChatSource[];
  tokensUsed: number;
}

export async function askQuestion(message: string): Promise<ChatResult> {
  const { data } = await api.post<ApiSuccess<ChatResult>>('/chat', { message });
  return data.data;
}
