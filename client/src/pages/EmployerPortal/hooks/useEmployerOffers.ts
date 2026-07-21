import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerOffer, EmployerOffersResponse, OfferInput } from '../../../types/employer.js';

// Mirrors useEmployerBoard.ts's shape (apiFetch + useAuth().token + useQuery, gated on
// `enabled: !!token && !!driveId`). Hits GET /api/me/employer/drives/:id/offers (Task 2's
// offersController) -- the offer rows + KPI counts this task's EmployerOffers page renders.
export function useEmployerOffers(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-offers', driveId],
    queryFn: () => apiFetch<EmployerOffersResponse>(`/me/employer/drives/${driveId}/offers`, { token }),
    enabled: !!token && !!driveId,
  });
}

// Hits PUT /api/me/employer/drives/:id/candidates/:jobseekerId/offer (Task 1's offerController)
// -- used both to send a brand-new offer (New-offer picker) and to update an existing offer row
// (per-row Update button). Invalidates the offers list, the pipeline board (offer stage is
// derived from Application.offer.status), the candidates list, and the employer-portal aggregate
// -- same convention as useEmployerBoard.ts's useMoveStage.
export function useUpsertOffer(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobseekerId, ...offer }: OfferInput & { jobseekerId: string }) =>
      apiFetch<EmployerOffer>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}/offer`, { method: 'PUT', body: offer, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-offers', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-board', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}
