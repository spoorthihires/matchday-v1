import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { ShortlistPack } from '../../../types/employer.js';

type BulkDecision = 'Shortlisted' | 'Hold' | 'Rejected';

// Bulk-writes 5a's decision for a set of jobseekers, then invalidates the candidates
// list + the employer-portal aggregate (same convention as useCandidateMutations).
export function useBulkDecision(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobseekerIds, decision }: { jobseekerIds: string[]; decision: BulkDecision }) =>
      apiFetch<{ updated: number }>(`/me/employer/drives/${driveId}/candidates/bulk-decision`, { method: 'POST', body: { jobseekerIds, decision }, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}

// One-shot fetch for the download handler (no query cache needed).
export function fetchShortlistPack(driveId: string, token: string | null) {
  return apiFetch<ShortlistPack>(`/me/employer/drives/${driveId}/shortlist/pack`, { token });
}
