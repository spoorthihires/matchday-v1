import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { InstituteListParams, InstituteListResponse } from '../../../types/institutes.js';

export function useInstitutes(params: InstituteListParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['institutes', params],
    queryFn: () => apiFetch<InstituteListResponse>(`/institutes${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
