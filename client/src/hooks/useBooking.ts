import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { PortalSlotsData } from '../types/portal.js';

export function useDriveSlots(driveId: string, enabled: boolean) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['drive-slots', driveId],
    queryFn: () => apiFetch<PortalSlotsData>(`/me/portal/drives/${driveId}/slots`, { token }),
    enabled: enabled && !!token,
  });
}

export function useBookSlot() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => apiFetch<{ id: string }>(`/me/portal/slots/${slotId}/book`, { method: 'POST', token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drive-slots'] }); qc.invalidateQueries({ queryKey: ['portal'] }); },
  });
}

export function useCancelBooking() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => apiFetch<{ ok: boolean }>(`/me/portal/slots/${slotId}/book`, { method: 'DELETE', token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drive-slots'] }); qc.invalidateQueries({ queryKey: ['portal'] }); },
  });
}
