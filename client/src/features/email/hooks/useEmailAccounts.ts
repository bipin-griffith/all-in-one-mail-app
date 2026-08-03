import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listEmailAccounts, syncEmailAccount } from '../api/email.api';

export function useEmailAccounts() {
  return useQuery({
    queryKey: ['email-accounts'],
    queryFn: listEmailAccounts,
  });
}

export function useSyncEmailAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => syncEmailAccount(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}
