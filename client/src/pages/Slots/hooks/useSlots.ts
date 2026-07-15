import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { SlotListParams, SlotListResponse } from '../../../types/slots.js';

// Mirrors client/src/pages/Employers/hooks/useEmployers.ts — same shape, slots path, and an
// explicit [from, to, employerId] query key (per the plan) rather than the whole params object.
export function useSlots(params: SlotListParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['slots', params.from, params.to, params.employerId],
    queryFn: () => apiFetch<SlotListResponse>(`/slots${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
