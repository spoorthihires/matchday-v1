import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { JobseekerListParams, JobseekerListResponse } from '../../../types/jobseekers.js';

// Mirrors client/src/pages/Institutes/hooks/useInstitutes.ts exactly — same shape, jobseekers path/key.
export function useJobseekers(params: JobseekerListParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['jobseekers', params],
    queryFn: () => apiFetch<JobseekerListResponse>(`/jobseekers${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
