import { useQuery } from '@tanstack/react-query';

import type { EmailAiCategory } from '@/features/email/api/email.api';

import { getCategoryDashboard } from '../api/dashboard.api';

export function useCategoryDashboard(category: EmailAiCategory) {
  return useQuery({
    queryKey: ['dashboard', 'category', category],
    queryFn: () => getCategoryDashboard(category),
    // Dashboard aggregates don't need to be second-fresh; cut down on
    // redundant requests when a user flips between dashboard tabs.
    staleTime: 60_000,
  });
}
