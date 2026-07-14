import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { DriveListParams, DriveListResponse } from '../../../types/drives.js';

export function useDrives(params: DriveListParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['drives', params],
    queryFn: () => apiFetch<DriveListResponse>(`/drives${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
