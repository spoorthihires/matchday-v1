import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerReport } from '../../../types/employer.js';

export function useEmployerReports(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-reports', driveId],
    queryFn: () => apiFetch<EmployerReport>(`/me/employer/reports?driveId=${driveId}`, { token }),
    enabled: !!token,
    placeholderData: keepPreviousData,
  });
}
