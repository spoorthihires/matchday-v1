import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { RawRow } from '../upload/template.js';

// Response shape mirrors server/src/modules/jobseekers/jobseekers.import.ts's `RowResult`/
// `Summary`/`previewImport()` return value ({rows, summary}) — re-declared here since server
// types aren't importable across the client/server boundary.
export interface ImportRowResult {
  index: number;
  data: {
    name: string; email: string; instituteId: string | null; instituteName: string | null;
    branch: string; gradYear: number | null; cgpa: number | null; source: string;
  };
  valid: boolean; errors: string[]; dupe: boolean; dupeReason?: string;
}
export interface ImportSummary { total: number; valid: number; invalid: number; duplicates: number; willImport: number; }
export interface ImportPreviewResponse { rows: ImportRowResult[]; summary: ImportSummary; }

// Mirrors client/src/pages/Jobseekers/hooks/useJobseekerMutations.ts conventions (useMutation +
// apiFetch). No cache invalidation — a preview doesn't mutate server state.
export function useImportPreview() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (rows: RawRow[]) =>
      apiFetch<ImportPreviewResponse>('/jobseekers/import/preview', { method: 'POST', body: { rows }, token }),
    meta: { silentError: true },
  });
}
