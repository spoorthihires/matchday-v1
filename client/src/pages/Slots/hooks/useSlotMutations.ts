import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { SlotInput } from '../../../types/slots.js';

// Mirrors client/src/pages/Drives/hooks/useDriveMutations.ts (same shape, /slots path). `remove`
// backs SlotModal's edit-mode Delete button (DELETE /slots/:id — slots.routes.ts/slots.service.ts's
// deleteSlot) — none of the Employer/Institute/Drive mutation hooks needed a delete, so this is the
// first of its kind in the client. All three invalidate ['slots'], matching useSlots's query key
// prefix (client/src/pages/Slots/hooks/useSlots.ts uses ['slots', from, to, employerId]).
export function useSlotMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['slots'] });

  const create = useMutation({
    mutationFn: (body: SlotInput) => apiFetch('/slots', { method: 'POST', body, token }),
    onSuccess: invalidate,
    meta: { silentError: true, successMessage: 'Slot created' },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SlotInput> }) =>
      apiFetch(`/slots/${id}`, { method: 'PATCH', body, token }),
    onSuccess: invalidate,
    meta: { silentError: true, successMessage: 'Slot updated' },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/slots/${id}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
    meta: { silentError: true, successMessage: 'Slot deleted' },
  });
  return { create, update, remove };
}
