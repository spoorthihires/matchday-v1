import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { AuditRow, Paged } from '../../../types/institutes.js';

export function useInstituteAudit(id: string, page: number, limit = 10) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['institute-audit', id, page, limit],
    queryFn: () => apiFetch<Paged<AuditRow>>(`/institutes/${id}/audit?page=${page}&limit=${limit}`, { token }),
    enabled: !!token && !!id,
  });
}
