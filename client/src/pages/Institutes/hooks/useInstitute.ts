import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { InstituteDetailResponse } from '../../../types/institutes.js';

export function useInstitute(id: string | undefined) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['institute', id],
    queryFn: () => apiFetch<InstituteDetailResponse>(`/institutes/${id}`, { token }),
    enabled: !!token && !!id,
  });
}
