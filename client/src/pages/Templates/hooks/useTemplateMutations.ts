import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { TemplateInput } from '../../../types/templates.js';

// Mirrors client/src/pages/Slots/hooks/useSlotMutations.ts. All mutations invalidate ['templates'],
// matching useTemplates's query-key prefix.
export function useTemplateMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['templates'] });

  const create = useMutation({
    mutationFn: (body: TemplateInput) => apiFetch('/templates', { method: 'POST', body, token }),
    onSuccess: invalidate,
    meta: { successMessage: 'Template created' },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<TemplateInput> }) =>
      apiFetch(`/templates/${id}`, { method: 'PATCH', body, token }),
    onSuccess: invalidate,
    meta: { successMessage: 'Template saved' },
  });
  const clone = useMutation({
    mutationFn: (id: string) => apiFetch(`/templates/${id}/clone`, { method: 'POST', token }),
    onSuccess: invalidate,
    meta: { successMessage: 'Template cloned' },
  });
  const restore = useMutation({
    mutationFn: ({ id, v }: { id: string; v: string }) =>
      apiFetch(`/templates/${id}/restore`, { method: 'POST', body: { v }, token }),
    onSuccess: invalidate,
    meta: { successMessage: 'Version restored' },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/templates/${id}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
    meta: { successMessage: 'Template deleted' },
  });
  return { create, update, clone, restore, remove };
}
