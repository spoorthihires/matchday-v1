import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { StreamRules } from '../../../types/streams.js';

export function useStreamRulesMutation() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StreamRules) => apiFetch('/stream-rules', { method: 'PUT', body, token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stream-rules'] }),
    meta: { successMessage: 'Selection rules saved' },
  });
}
