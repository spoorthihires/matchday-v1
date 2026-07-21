import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { SupportListResponse, SupportRequestItem } from '../../../types/employer.js';

// Mirrors useEmployerNotifications.ts's shape (apiFetch + useAuth().token + useQuery, gated on
// `enabled: !!token`). Hits GET /api/me/employer/support (Task 1's supportListController) --
// this task's EmployerSupport page's "My requests" list.
export function useEmployerSupport() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-support'],
    queryFn: () => apiFetch<SupportListResponse>('/me/employer/support', { token }),
    enabled: !!token,
  });
}

// Hits POST /api/me/employer/support (Task 1's createSupportController) -- the request form's
// submit action. Invalidates the support list so the new ticket appears immediately, same
// convention as useEmployerOffers.ts's useUpsertOffer / useEmployerNotifications.ts's
// useMarkNotificationsRead.
export interface CreateSupportBody { category: string; subject: string; message: string; priority: string; }
export function useCreateSupportRequest() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSupportBody) => apiFetch<SupportRequestItem>('/me/employer/support', { method: 'POST', body, token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employer-support'] }); },
  });
}
