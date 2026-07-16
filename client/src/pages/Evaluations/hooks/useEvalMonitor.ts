import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { MonitorResponse } from '../../../types/evaluations.js';

export interface MonitorParams { contest?: string; employer?: string; institute?: string; date?: string }

export function useEvalMonitor(params: MonitorParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['eval-monitor', params.contest, params.employer, params.institute, params.date],
    queryFn: () => apiFetch<MonitorResponse>(`/eval-monitor${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
