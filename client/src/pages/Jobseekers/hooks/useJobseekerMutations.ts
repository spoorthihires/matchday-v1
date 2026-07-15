import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { JobseekerInput } from '../../../types/jobseekers.js';

// Mirrors client/src/pages/Institutes/hooks/useInstituteMutations.ts exactly — same shape,
// jobseekers path/key. `bulk`'s action union has only 'block' (the server's bulkSchema
// only accepts that one action for jobseekers), so it's exposed as `block` directly.
export function useJobseekerMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['jobseekers'] });
  const add = useMutation({ mutationFn: (b: JobseekerInput) => apiFetch('/jobseekers', { method: 'POST', body: b, token }), onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<JobseekerInput> }) => apiFetch(`/jobseekers/${id}`, { method: 'PATCH', body, token }), onSuccess: invalidate });
  const block = useMutation({ mutationFn: (b: { ids: string[]; action: 'block' }) => apiFetch('/jobseekers/bulk', { method: 'POST', body: b, token }), onSuccess: invalidate });
  return { add, update, block };
}
