import { useMutation } from '@tanstack/react-query';

import { enqueueSummarize } from '../api/ai.api';

export function useSummarizeThread() {
  return useMutation({
    mutationFn: (threadId: string) => enqueueSummarize(threadId),
  });
}
