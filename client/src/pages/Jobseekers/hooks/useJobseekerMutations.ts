import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { JobseekerInput } from '../../../types/jobseekers.js';

// Mirrors client/src/pages/Institutes/hooks/useInstituteMutations.ts exactly — same shape,
// jobseekers path/key. `block` stays the BulkBar's multi-select action (plural toast); the
// row-level kebab's Block/Unblock candidate instead use `blockOne`/`unblockOne` — same
// POST /jobseekers/bulk endpoint with a single id, but their own singular toast copy.
export function useJobseekerMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['jobseekers'] });
  const add = useMutation({ mutationFn: (b: JobseekerInput) => apiFetch('/jobseekers', { method: 'POST', body: b, token }), onSuccess: invalidate, meta: { silentError: true, successMessage: 'Jobseeker added' } });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<JobseekerInput> }) => apiFetch(`/jobseekers/${id}`, { method: 'PATCH', body, token }), onSuccess: invalidate, meta: { silentError: true, successMessage: 'Jobseeker saved' } });
  const block = useMutation({ mutationFn: (b: { ids: string[]; action: 'block' }) => apiFetch('/jobseekers/bulk', { method: 'POST', body: b, token }), onSuccess: invalidate, meta: { successMessage: 'Jobseekers blocked' } });
  const blockOne = useMutation({ mutationFn: (id: string) => apiFetch('/jobseekers/bulk', { method: 'POST', body: { ids: [id], action: 'block' }, token }), onSuccess: invalidate, meta: { successMessage: 'Candidate blocked' } });
  const unblockOne = useMutation({ mutationFn: (id: string) => apiFetch('/jobseekers/bulk', { method: 'POST', body: { ids: [id], action: 'unblock' }, token }), onSuccess: invalidate, meta: { successMessage: 'Candidate unblocked' } });
  return { add, update, block, blockOne, unblockOne };
}
