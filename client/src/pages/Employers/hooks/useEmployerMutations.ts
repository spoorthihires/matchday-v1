import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerInput } from '../../../types/employers.js';

export function useEmployerMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['employers'] });
  const create = useMutation({ mutationFn: (b: EmployerInput) => apiFetch('/employers', { method: 'POST', body: b, token }), onSuccess: invalidate, meta: { silentError: true, successMessage: 'Employer saved' } });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<EmployerInput> }) => apiFetch(`/employers/${id}`, { method: 'PATCH', body, token }), onSuccess: invalidate, meta: { silentError: true, successMessage: 'Employer saved' } });
  const bulk = useMutation({ mutationFn: (b: { ids: string[]; action: 'approve' | 'disable' }) => apiFetch('/employers/bulk', { method: 'POST', body: b, token }), onSuccess: invalidate, meta: { successMessage: 'Employers updated' } });
  // Loud (no silentError): used by the list's single-row status actions (approve/disable), which
  // are fire-and-forget and rely on the global MutationCache toast for error/success feedback.
  // `update` stays silenced for the edit modal, which shows inline errors instead.
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/employers/${id}`, { method: 'PATCH', body: { status }, token }), onSuccess: invalidate, meta: { successMessage: 'Employer updated' } });
  return { create, update, bulk, setStatus };
}
