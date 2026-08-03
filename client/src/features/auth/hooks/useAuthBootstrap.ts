import { useEffect, useState } from 'react';

import { api } from '@/lib/axios';
import { useAuthStore } from '@/store/authStore';

import { fetchCurrentUser } from '../api/auth.api';

import type { ApiSuccess } from '@/types/api';

/**
 * Runs once on app mount. The access token lives only in memory (see
 * authStore), so a hard refresh loses it — this silently attempts to
 * recover a session from the httpOnly refresh cookie before the app
 * decides whether to render the authenticated or public shell.
 */
export function useAuthBootstrap(): { isLoading: boolean } {
  const [isLoading, setIsLoading] = useState(true);
  const setAuth = useAuthStore((state) => state.setAuth);
  const clear = useAuthStore((state) => state.clear);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      try {
        const { data } = await api.post<ApiSuccess<{ accessToken: string }>>('/auth/refresh');
        useAuthStore.getState().setAccessToken(data.data.accessToken);
        const user = await fetchCurrentUser();
        if (!cancelled) setAuth(user, data.data.accessToken);
      } catch {
        if (!cancelled) clear();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setAuth, clear]);

  return { isLoading };
}
