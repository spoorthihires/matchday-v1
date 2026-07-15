import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { CandidateRow, Paged } from '../../../types/institutes.js';

export function useInstituteCandidates(id: string, page: number, limit = 10) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['institute-candidates', id, page, limit],
    queryFn: () => apiFetch<Paged<CandidateRow>>(`/institutes/${id}/candidates?page=${page}&limit=${limit}`, { token }),
    enabled: !!token && !!id,
  });
}
