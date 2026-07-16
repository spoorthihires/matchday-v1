import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EvalConfigInput } from '../../../types/evaluations.js';

export function useEvalConfigMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['eval-configs'] });
  const create = useMutation({
    mutationFn: (body: EvalConfigInput) => apiFetch('/eval-configs', { method: 'POST', body, token }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EvalConfigInput> }) =>
      apiFetch(`/eval-configs/${id}`, { method: 'PATCH', body, token }),
    onSuccess: invalidate,
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => apiFetch(`/eval-configs/${id}/duplicate`, { method: 'POST', token }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/eval-configs/${id}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
  });
  return { create, update, duplicate, remove };
}
