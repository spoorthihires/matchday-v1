import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { StreamInput } from '../../../types/streams.js';

export function useStreamMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['streams'] });
  const create = useMutation({
    mutationFn: (body: StreamInput) => apiFetch('/streams', { method: 'POST', body, token }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<StreamInput> }) =>
      apiFetch(`/streams/${id}`, { method: 'PATCH', body, token }),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: ({ id, v }: { id: string; v: string }) =>
      apiFetch(`/streams/${id}/restore`, { method: 'POST', body: { v }, token }),
    onSuccess: invalidate,
  });
  return { create, update, restore };
}
