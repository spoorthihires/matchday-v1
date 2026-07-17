import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { DriveInput } from '../../../types/drives.js';

export function useDriveMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['drives'] });

  const create = useMutation({
    mutationFn: (body: DriveInput) => apiFetch('/drives', { method: 'POST', body, token }),
    onSuccess: invalidate,
    meta: { silentError: true, successMessage: 'Drive saved' },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<DriveInput> & { status?: string } }) =>
      apiFetch(`/drives/${id}`, { method: 'PATCH', body, token }),
    onSuccess: invalidate,
    meta: { silentError: true, successMessage: 'Drive saved' },
  });
  const clone = useMutation({
    mutationFn: (id: string) => apiFetch(`/drives/${id}/clone`, { method: 'POST', token }),
    onSuccess: invalidate,
    meta: { successMessage: 'Drive cloned' },
  });
  const bulk = useMutation({
    mutationFn: (body: { ids: string[]; action: 'publish' | 'clone' | 'archive' }) =>
      apiFetch('/drives/bulk', { method: 'POST', body, token }),
    onSuccess: invalidate,
    meta: { successMessage: 'Drives updated' },
  });
  return { create, update, clone, bulk };
}
