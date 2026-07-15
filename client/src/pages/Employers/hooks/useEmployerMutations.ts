import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerInput } from '../../../types/employers.js';

export function useEmployerMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['employers'] });
  const create = useMutation({ mutationFn: (b: EmployerInput) => apiFetch('/employers', { method: 'POST', body: b, token }), onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<EmployerInput> }) => apiFetch(`/employers/${id}`, { method: 'PATCH', body, token }), onSuccess: invalidate });
  const bulk = useMutation({ mutationFn: (b: { ids: string[]; action: 'approve' | 'disable' }) => apiFetch('/employers/bulk', { method: 'POST', body: b, token }), onSuccess: invalidate });
  return { create, update, bulk };
}
