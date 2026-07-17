import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { InstituteInput } from '../../../types/institutes.js';

export function useInstituteMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['institutes'] });
  const create = useMutation({ mutationFn: (b: InstituteInput) => apiFetch('/institutes', { method: 'POST', body: b, token }), onSuccess: invalidate, meta: { silentError: true, successMessage: 'Institute saved' } });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<InstituteInput> }) => apiFetch(`/institutes/${id}`, { method: 'PATCH', body, token }), onSuccess: invalidate, meta: { silentError: true, successMessage: 'Institute saved' } });
  const bulk = useMutation({ mutationFn: (b: { ids: string[]; action: 'approve' | 'disable' }) => apiFetch('/institutes/bulk', { method: 'POST', body: b, token }), onSuccess: invalidate, meta: { successMessage: 'Institutes updated' } });
  // Loud (no silentError): used by the list's single-row status actions (approve/disable), which
  // are fire-and-forget and rely on the global MutationCache toast for error/success feedback.
  // `update` stays silenced for the edit modal, which shows inline errors instead.
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/institutes/${id}`, { method: 'PATCH', body: { status }, token }), onSuccess: invalidate, meta: { successMessage: 'Institute updated' } });
  return { create, update, bulk, setStatus };
}
