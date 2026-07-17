import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { RawRow } from '../upload/template.js';

// Response shape mirrors server/src/modules/jobseekers/jobseekers.import.ts's `commitImport()`
// return value ({imported, skipped, skippedReasons}).
export interface ImportCommitResponse {
  imported: number;
  skipped: number;
  skippedReasons: { duplicates: number; invalid: number };
}

// Mirrors client/src/pages/Jobseekers/hooks/useJobseekerMutations.ts conventions (useMutation +
// apiFetch + invalidate ['jobseekers'] on success, since a commit inserts new candidates that the
// list page's query needs to pick up).
export function useImportCommit() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: RawRow[]) =>
      apiFetch<ImportCommitResponse>('/jobseekers/import/commit', { method: 'POST', body: { rows }, token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobseekers'] }),
    meta: { silentError: true },
  });
}
