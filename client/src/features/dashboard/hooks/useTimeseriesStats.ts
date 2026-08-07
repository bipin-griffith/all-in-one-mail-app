import { useQuery } from '@tanstack/react-query';

import { getTimeseriesStats } from '../api/dashboard.api';

export function useTimeseriesStats(granularity: 'day' | 'month', range: number) {
  return useQuery({
    queryKey: ['dashboard', 'stats', granularity, range],
    queryFn: () => getTimeseriesStats(granularity, range),
    staleTime: 60_000,
  });
}
