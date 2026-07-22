import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { AccountData } from '../types/portal.js';

export function useAccount() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['account'], queryFn: () => apiFetch<AccountData>('/me/portal/account', { token }), enabled: !!token });
}

export function useUpdateAccount() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name?: string; branch?: string; source?: string }) =>
      apiFetch<AccountData>('/me/portal/account', { method: 'PATCH', body: v, token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['account'] }); qc.invalidateQueries({ queryKey: ['portal'] }); },
  });
}

export function useChangePassword() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (v: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ ok: boolean }>('/me/portal/account/password', { method: 'POST', body: v, token }),
  });
}
