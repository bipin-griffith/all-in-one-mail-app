import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/store/authStore';

import { fetchCurrentUser } from '../api/auth.api';

export function useCurrentUser() {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
    enabled: Boolean(accessToken),
    staleTime: 5 * 60_000,
  });
}
