import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerTeamResponse, TeamMemberItem } from '../../../types/employer.js';

// Mirrors useEmployerSupport.ts's shape (apiFetch + useAuth().token + useQuery, gated on
// `enabled: !!token`). Hits GET /api/me/employer/team (Task 1's teamListController) --
// this task's EmployerTeam page's members list + canManage/actingRole/selfId gating.
export function useEmployerTeam() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-team'],
    queryFn: () => apiFetch<EmployerTeamResponse>('/me/employer/team', { token }),
    enabled: !!token,
  });
}

// Hits POST /api/me/employer/team (Task 1's addTeamMemberController) -- the add-member form's
// submit action. Invalidates the team list so the new member appears immediately, same
// convention as useEmployerSupport.ts's useCreateSupportRequest.
export interface AddMemberBody { name: string; email: string; role: string; password: string; }
export function useAddTeamMember() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddMemberBody) => apiFetch<TeamMemberItem>('/me/employer/team', { method: 'POST', body, token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employer-team'] }); },
  });
}
// Hits PATCH /api/me/employer/team/:id (Task 1's updateTeamMemberController) -- the per-row
// role-select onChange.
export function useUpdateTeamMember() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; role?: string; status?: string }) =>
      apiFetch<TeamMemberItem>(`/me/employer/team/${vars.id}`, { method: 'PATCH', body: { role: vars.role, status: vars.status }, token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employer-team'] }); },
  });
}
// Hits DELETE /api/me/employer/team/:id (Task 1's removeTeamMemberController) -- the per-row
// Remove button.
export function useRemoveTeamMember() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/me/employer/team/${id}`, { method: 'DELETE', token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employer-team'] }); },
  });
}
