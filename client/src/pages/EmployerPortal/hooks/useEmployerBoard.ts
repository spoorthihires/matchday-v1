import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { BoardCard, BoardStage, EmployerBoardResponse } from '../../../types/employer.js';

// Mirrors useEmployerInterviews.ts's shape (apiFetch + useAuth().token + useQuery, gated on
// `enabled: !!token && !!driveId`). Hits GET /api/me/employer/drives/:id/board (Task 1's
// boardController) -- the full candidate pool with its pinned kanban stage.
export function useEmployerBoard(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-board', driveId],
    queryFn: () => apiFetch<EmployerBoardResponse>(`/me/employer/drives/${driveId}/board`, { token }),
    enabled: !!token && !!driveId,
  });
}

// Hits PATCH /api/me/employer/drives/:id/candidates/:jobseekerId/stage (Task 2's
// setStageController). Invalidates the board, the candidates list, and the employer-portal
// aggregate on success -- same convention as useCandidateMutations/useRevealMutations.
export function useMoveStage(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobseekerId, stage }: { jobseekerId: string; stage: BoardStage }) =>
      apiFetch<BoardCard>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}/stage`, { method: 'PATCH', body: { stage }, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-board', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}
