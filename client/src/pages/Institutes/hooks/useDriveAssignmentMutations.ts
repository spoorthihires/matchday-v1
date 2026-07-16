import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';

export function useDriveAssignmentMutations(instituteId?: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['institute-drives'] });
    qc.invalidateQueries({ queryKey: ['institute'] });
    qc.invalidateQueries({ queryKey: ['institutes'] });
  };
  const assign = useMutation({
    mutationFn: (driveIds: string[]) => apiFetch(`/institutes/${instituteId}/drives`, { method: 'POST', body: { driveIds }, token }),
    onSuccess: invalidate,
  });
  const unassign = useMutation({
    mutationFn: (driveId: string) => apiFetch(`/institutes/${instituteId}/drives/${driveId}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
  });
  const bulkAssign = useMutation({
    mutationFn: (body: { instituteIds: string[]; driveIds: string[] }) => apiFetch('/institutes/assign-drives', { method: 'POST', body, token }),
    onSuccess: invalidate,
  });
  return { assign, unassign, bulkAssign };
}
