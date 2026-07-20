import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { StreamListResponse } from '../../../types/streams.js';

export interface StreamParams {
  q?: string; parent?: string; status?: string; sort?: string; order?: string;
  cutoffFrom?: string; cutoffTo?: string;
}

export function useStreams(params: StreamParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['streams', params],
    queryFn: () => apiFetch<StreamListResponse>(`/streams${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
