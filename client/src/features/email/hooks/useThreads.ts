import { useQuery } from '@tanstack/react-query';

import { listThreads, type ListThreadsParams } from '../api/email.api';

export function useThreads(params: ListThreadsParams) {
  return useQuery({
    queryKey: ['threads', params],
    queryFn: () => listThreads(params),
    placeholderData: (prev) => prev,
  });
}
