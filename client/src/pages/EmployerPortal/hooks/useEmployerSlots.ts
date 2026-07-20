import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerSlot, EmployerSlotsResponse, SlotInput } from '../../../types/employer.js';

// GET /api/me/employer/drives/:id/slots — the employer's own slots for the drive.
export function useEmployerSlots(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-slots', driveId],
    queryFn: () => apiFetch<EmployerSlotsResponse>(`/me/employer/drives/${driveId}/slots`, { token }),
    enabled: !!token && !!driveId,
  });
}

// create/update/delete. Each invalidates the drive's slot list AND the employer-portal
// aggregate (the dashboard calendar/KPIs read Slot). Mirrors useBookingMutations' fan-out.
export function useSlotMutations(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['employer-slots', driveId] });
    qc.invalidateQueries({ queryKey: ['employer-portal'] });
  };
  const create = useMutation({
    mutationFn: (input: SlotInput) => apiFetch<EmployerSlot>(`/me/employer/drives/${driveId}/slots`, { method: 'POST', body: input, token }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ slotId, patch }: { slotId: string; patch: Partial<SlotInput> }) =>
      apiFetch<EmployerSlot>(`/me/employer/drives/${driveId}/slots/${slotId}`, { method: 'PATCH', body: patch, token }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (slotId: string) => apiFetch<{ ok: true }>(`/me/employer/drives/${driveId}/slots/${slotId}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
