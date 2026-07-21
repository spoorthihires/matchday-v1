import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { CandidateDecision, CandidatePassport, EmployerCandidate, EmployerCandidatesResponse } from '../../../types/employer.js';

// Mirrors useEmployerDrives.ts's shape (apiFetch + useAuth().token + useQuery, gated on
// `enabled: !!token`). Hits GET /api/me/employer/drives/:id/candidates (Task 1's
// candidatesController) -- the redacted candidate-pool list this task's EmployerCandidates
// page renders. Falsy filter values are dropped from the querystring (same convention as
// useEmployerDrives).
export interface CandidateFilters { q?: string; decision?: string; evaluation?: string; }

export function useEmployerCandidates(driveId: string, filters: CandidateFilters) {
  const { token } = useAuth();
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString();
  return useQuery({
    queryKey: ['employer-candidates', driveId, filters.q ?? '', filters.decision ?? '', filters.evaluation ?? ''],
    queryFn: () => apiFetch<EmployerCandidatesResponse>(`/me/employer/drives/${driveId}/candidates${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token && !!driveId,
    placeholderData: keepPreviousData,
  });
}

// Hits GET /api/me/employer/drives/:id/candidates/:jobseekerId (Task 2's passportController) --
// the single-candidate passport (factors + notes). The page consuming this is Task 4, but the
// hook is added now alongside its list-page sibling.
export function useCandidatePassport(driveId: string, jobseekerId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['candidate-passport', driveId, jobseekerId],
    queryFn: () => apiFetch<CandidatePassport>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}`, { token }),
    enabled: !!token && !!driveId && !!jobseekerId,
  });
}

// Mirrors useCreateRegistration's mutation shape (apiFetch + invalidate-on-success). Both
// mutations invalidate the candidates list, the passport (if cached), and the employer-portal
// aggregate -- same convention as useEmployerRegistrations.ts's create mutation.
export function useCandidateMutations(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = (jobseekerId: string) => {
    qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
    qc.invalidateQueries({ queryKey: ['candidate-passport', driveId, jobseekerId] });
    qc.invalidateQueries({ queryKey: ['employer-portal'] });
  };
  const setDecision = useMutation({
    mutationFn: ({ jobseekerId, decision }: { jobseekerId: string; decision: CandidateDecision }) =>
      apiFetch<EmployerCandidate>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}/decision`, { method: 'PUT', body: { decision }, token }),
    onSuccess: (_d, v) => invalidate(v.jobseekerId),
  });
  const addNote = useMutation({
    mutationFn: ({ jobseekerId, text }: { jobseekerId: string; text: string }) =>
      apiFetch<CandidatePassport>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}/notes`, { method: 'POST', body: { text }, token }),
    onSuccess: (_d, v) => invalidate(v.jobseekerId),
  });
  return { setDecision, addNote };
}

// Reveal-consent mutations (Slice 5b). Each takes a jobseekerId and returns the updated passport.
export function useRevealMutations(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = (jobseekerId: string) => {
    qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
    qc.invalidateQueries({ queryKey: ['candidate-passport', driveId, jobseekerId] });
    qc.invalidateQueries({ queryKey: ['employer-portal'] });
  };
  const base = (jobseekerId: string) => `/me/employer/drives/${driveId}/candidates/${jobseekerId}/reveal-request`;
  const requestReveal = useMutation({
    mutationFn: (jobseekerId: string) => apiFetch<CandidatePassport>(base(jobseekerId), { method: 'POST', token }),
    onSuccess: (_d, jobseekerId) => invalidate(jobseekerId),
  });
  const remindReveal = useMutation({
    mutationFn: (jobseekerId: string) => apiFetch<CandidatePassport>(`${base(jobseekerId)}/remind`, { method: 'POST', token }),
    onSuccess: (_d, jobseekerId) => invalidate(jobseekerId),
  });
  const withdrawReveal = useMutation({
    mutationFn: (jobseekerId: string) => apiFetch<CandidatePassport>(base(jobseekerId), { method: 'DELETE', token }),
    onSuccess: (_d, jobseekerId) => invalidate(jobseekerId),
  });
  return { requestReveal, remindReveal, withdrawReveal };
}
