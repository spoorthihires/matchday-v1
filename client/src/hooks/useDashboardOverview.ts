import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { DashboardOverview } from '../types/dashboard.js';

export function useDashboardOverview() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => apiFetch<DashboardOverview>('/dashboard/overview', { token }),
    enabled: !!token,
  });
}
