import { useMutation } from '@tanstack/react-query';

import { useAuthStore } from '@/store/authStore';

import { register, type RegisterPayload } from '../api/auth.api';

export function useRegister() {
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: (payload: RegisterPayload) => register(payload),
    onSuccess: (result) => {
      setAuth(result.user, result.accessToken);
    },
  });
}
