import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { AssignedDrivesResponse } from '../../../types/institutes.js';

export function useInstituteDrives(id: string | undefined) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['institute-drives', id],
    queryFn: () => apiFetch<AssignedDrivesResponse>(`/institutes/${id}/drives`, { token }),
    enabled: !!token && !!id,
  });
}
