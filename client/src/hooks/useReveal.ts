import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { RevealRequestsData } from '../types/portal.js';

export function useRevealRequests() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['reveal-requests'], queryFn: () => apiFetch<RevealRequestsData>('/me/portal/reveal-requests', { token }), enabled: !!token });
}
export function useRespondReveal() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { applicationId: string; decision: 'grant' | 'deny' }) =>
      apiFetch<{ status: string }>(`/me/portal/reveal-requests/${v.applicationId}/respond`, { method: 'POST', body: { decision: v.decision }, token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reveal-requests'] }); qc.invalidateQueries({ queryKey: ['portal'] }); },
  });
}
