import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerListParams, EmployerListResponse } from '../../../types/employers.js';

export function useEmployers(params: EmployerListParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['employers', params],
    queryFn: () => apiFetch<EmployerListResponse>(`/employers${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
