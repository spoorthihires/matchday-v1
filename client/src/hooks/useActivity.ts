import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { InterviewsData, OffersData } from '../types/portal.js';

export function useInterviews() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['interviews'], queryFn: () => apiFetch<InterviewsData>('/me/portal/interviews', { token }), enabled: !!token });
}
export function useOffers() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['offers'], queryFn: () => apiFetch<OffersData>('/me/portal/offers', { token }), enabled: !!token });
}
export function useRespondOffer() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { applicationId: string; response: 'Accepted' | 'Declined'; declineReason?: string }) =>
      apiFetch<{ status: string }>(`/me/portal/offers/${v.applicationId}/respond`, {
        method: 'POST',
        body: v.declineReason ? { response: v.response, declineReason: v.declineReason } : { response: v.response },
        token,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['offers'] }); qc.invalidateQueries({ queryKey: ['portal'] }); },
  });
}
