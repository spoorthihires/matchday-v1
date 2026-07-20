import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerPortalResponse } from '../../../types/employer.js';

// Mirrors client/src/pages/Slots/hooks/useSlots.ts's shape: apiFetch + useAuth().token +
// useQuery, gated on `enabled: !!token`. Hits GET /api/me/employer (Task 2's
// employerPortalRoutes), which 403s for non-employer roles and 200s with { profile, dashboard }
// for an authenticated employer.
export function useEmployerPortal() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-portal'],
    queryFn: () => apiFetch<EmployerPortalResponse>('/me/employer', { token }),
    enabled: !!token,
  });
}
