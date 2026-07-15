import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../../api/client.js';
import { useAuth } from '../../../../auth/AuthContext.js';
import type { Registration, RegistrationActionPayload } from '../../../../types/employers.js';

// POST /registrations/:id/action — the discriminated-union payload (registrations.schemas.ts's
// actionSchema mirrored by RegistrationActionPayload). Always invalidates the approvals queue;
// an 'approve' additionally upserts an Employer server-side (registrations.service.ts's
// upsertEmployerFrom), so it also invalidates the Employers list so a newly-created employer
// shows up there without a manual refresh.
export function useRegistrationAction() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RegistrationActionPayload }) =>
      apiFetch<Registration>(`/registrations/${id}/action`, { method: 'POST', body: payload, token }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['registrations'] });
      if (variables.payload.action === 'approve') {
        qc.invalidateQueries({ queryKey: ['employers'] });
      }
    },
  });
}
