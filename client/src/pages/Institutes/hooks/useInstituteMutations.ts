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
  return { create, update, bulk };
}
