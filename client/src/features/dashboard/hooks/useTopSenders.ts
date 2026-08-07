import { useQuery } from '@tanstack/react-query';

import { getTopSenders } from '../api/dashboard.api';

export function useTopSenders(limit = 10) {
  return useQuery({
    queryKey: ['dashboard', 'top-senders', limit],
    queryFn: () => getTopSenders(limit),
    staleTime: 60_000,
  });
}
