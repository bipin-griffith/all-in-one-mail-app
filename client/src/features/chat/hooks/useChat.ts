import { useMutation } from '@tanstack/react-query';

import { askQuestion } from '../api/chat.api';

/**
 * POST /chat is stateless per request on the server (no conversation
 * persistence — see docs/RAG_AND_DASHBOARDS.md §8), so this is a mutation,
 * not a query: each question is an independent action, not cacheable
 * server state to read.
 */
export function useChat() {
  return useMutation({
    mutationFn: askQuestion,
  });
}
