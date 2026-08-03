import { useQuery } from '@tanstack/react-query';

import { getThread } from '../api/email.api';

export function useThread(id: string | undefined) {
  return useQuery({
    queryKey: ['threads', id],
    queryFn: () => getThread(id as string),
    enabled: Boolean(id),
  });
}
