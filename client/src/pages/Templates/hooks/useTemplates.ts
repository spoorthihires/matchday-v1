import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { TemplateListParams, TemplateListResponse } from '../../../types/templates.js';

// Mirrors client/src/pages/Slots/hooks/useSlots.ts — same shape, templates path, explicit key.
export function useTemplates(params: TemplateListParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['templates', params.q, params.domain, params.status],
    queryFn: () => apiFetch<TemplateListResponse>(`/templates${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
