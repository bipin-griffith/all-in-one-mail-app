import { useMutation } from '@tanstack/react-query';

import { useAuthStore } from '@/store/authStore';

import { login, type LoginPayload } from '../api/auth.api';

export function useLogin() {
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: (result) => {
      setAuth(result.user, result.accessToken);
    },
  });
}
