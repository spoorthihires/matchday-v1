import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { BookingStatus, EligibleResponse, SlotRoster } from '../../../types/slots.js';

// Task 6's SlotRosterModal consumes these. Mirrors useSlotMutations.ts/useSlots.ts's shape
// (apiFetch + useAuth token + query keys), but every mutation here additionally invalidates
// ['slots'] so the calendar cells' derived booked/capacity counts (SlotItem.booked/held) refresh
// alongside the roster/eligible-candidates lists.
export function useSlotRoster(slotId: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['slot-roster', slotId],
    queryFn: () => apiFetch<SlotRoster>(`/slots/${slotId}/bookings`, { token }),
    enabled: !!token && !!slotId,
  });
}

export function useEligibleCandidates(slotId: string | null, q: string) {
  const { token } = useAuth();
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return useQuery({
    queryKey: ['slot-eligible', slotId, q.trim()],
    queryFn: () => apiFetch<EligibleResponse>(`/slots/${slotId}/eligible-candidates${qs}`, { token }),
    enabled: !!token && !!slotId,
  });
}

export function useBookingMutations(slotId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['slot-roster', slotId] });
    qc.invalidateQueries({ queryKey: ['slot-eligible', slotId] });
    qc.invalidateQueries({ queryKey: ['slots'] });
  };
  const book = useMutation({
    mutationFn: ({ jobseekerId, status }: { jobseekerId: string; status: BookingStatus }) =>
      apiFetch(`/slots/${slotId}/bookings`, { method: 'POST', body: { jobseekerId, status }, token }),
    onSuccess: invalidate,
  });
  const confirm = useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch(`/slots/${slotId}/bookings/${bookingId}`, { method: 'PATCH', body: { status: 'Booked' }, token }),
    onSuccess: invalidate,
  });
  const release = useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch(`/slots/${slotId}/bookings/${bookingId}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
  });
  return { book, confirm, release };
}
