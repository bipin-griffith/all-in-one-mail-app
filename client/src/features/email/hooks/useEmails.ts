import { useQuery } from '@tanstack/react-query';

import { listEmails, type ListEmailsParams } from '../api/email.api';

/**
 * Generic filtered-email-list hook — reused by the Unread and Priority
 * dashboards (and anywhere else that just needs "emails matching some
 * filter") instead of each needing its own query/endpoint. See
 * docs/RAG_AND_DASHBOARDS.md §9.
 */
export function useEmails(params: ListEmailsParams) {
  return useQuery({
    queryKey: ['emails', params],
    queryFn: () => listEmails(params),
    placeholderData: (prev) => prev,
  });
}
