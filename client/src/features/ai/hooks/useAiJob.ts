import { useQuery } from '@tanstack/react-query';

import { getAiJob } from '../api/ai.api';

const TERMINAL_STATUSES = new Set(['completed', 'failed']);

/** Polls a queued AI job until it reaches a terminal state. See docs/ARCHITECTURE.md (AI job lifecycle). */
export function useAiJob(jobId: string | null) {
  return useQuery({
    queryKey: ['ai-job', jobId],
    queryFn: () => getAiJob(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => (TERMINAL_STATUSES.has(query.state.data?.status ?? '') ? false : 1500),
  });
}
