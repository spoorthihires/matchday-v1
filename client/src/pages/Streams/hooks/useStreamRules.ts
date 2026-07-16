import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { StreamRules } from '../../../types/streams.js';

export function useStreamRules() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['stream-rules'],
    queryFn: () => apiFetch<StreamRules>('/stream-rules', { token }),
    enabled: !!token,
  });
}
