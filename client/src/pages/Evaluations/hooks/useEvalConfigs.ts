import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EvalConfigListResponse } from '../../../types/evaluations.js';

export interface EvalConfigParams { q?: string; type?: string; status?: string }

export function useEvalConfigs(params: EvalConfigParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['eval-configs', params.q, params.type, params.status],
    queryFn: () => apiFetch<EvalConfigListResponse>(`/eval-configs${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
