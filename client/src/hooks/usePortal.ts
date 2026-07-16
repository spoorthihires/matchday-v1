import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { PortalData } from '../types/portal.js';

export function usePortal() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['portal'],
    queryFn: () => apiFetch<PortalData>('/me/portal', { token }),
    enabled: !!token,
  });
}
