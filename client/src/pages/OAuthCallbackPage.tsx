import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchCurrentUser } from '@/features/auth/api/auth.api';
import { useAuthStore } from '@/store/authStore';

/**
 * Landing target for the Google OAuth redirect (see server auth.controller.ts
 * `googleCallback`). The access token arrives in the URL fragment, not a
 * query string, so it never hits server access logs.
 */
export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('accessToken');

    if (!accessToken) {
      navigate('/login', { replace: true });
      return;
    }

    useAuthStore.getState().setAccessToken(accessToken);
    fetchCurrentUser()
      .then((user) => {
        setAuth(user, accessToken);
        navigate('/inbox', { replace: true });
      })
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate, setAuth]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Signing you in…
    </div>
  );
}
