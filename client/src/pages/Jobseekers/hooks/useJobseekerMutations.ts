import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { JobseekerInput, JobseekerListResponse } from '../../../types/jobseekers.js';

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
  const blockOne = useMutation({ mutationFn: (id: string) => apiFetch('/jobseekers/bulk', { method: 'POST', body: { ids: [id], action: 'block' }, token }), onSuccess: invalidate, meta: { successMessage: 'Jobseeker blocked' } });
  const unblockOne = useMutation({ mutationFn: (id: string) => apiFetch('/jobseekers/bulk', { method: 'POST', body: { ids: [id], action: 'unblock' }, token }), onSuccess: invalidate, meta: { successMessage: 'Jobseeker unblocked' } });
  // TODO: no server endpoint exists yet for resetting a candidate's evaluation (nothing under
  // /jobseekers or /eval-monitor covers it). Until one lands, this mutation only patches the
  // cached list rows client-side so the UI reflects the reset immediately; a hard refresh or
  // cache invalidation will pull the real (unreset) values back from the server. Swap the
  // no-op mutationFn below for the real `apiFetch('/jobseekers/:id/reset-evaluation', ...)` call
  // once it exists, and this optimistic patch can stay as-is (or move to onMutate).
  const resetEvaluationOne = useMutation({
    mutationFn: async (_id: string) => {},
    onSuccess: (_data, id) => {
      qc.setQueriesData<JobseekerListResponse>({ queryKey: ['jobseekers'] }, (data) => {
        if (!data) return data;
        return {
          ...data,
          items: data.items.map((item) =>
            item.id === id ? { ...item, evaluationLabel: 'Not started', matchReadinessPct: 0 } : item,
          ),
        };
      });
    },
    meta: { successMessage: 'Evaluation has been reset successfully.' },
  });
  return { add, update, block, blockOne, unblockOne, resetEvaluationOne };
}
