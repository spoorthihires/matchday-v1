import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerInterview, EmployerInterviewsResponse, InterviewAction, ScheduleInterviewInput } from '../../../types/employer.js';

// GET /api/me/employer/drives/:id/interviews (Task 1) -- the drive's interview agenda.
export function useEmployerInterviews(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-interviews', driveId],
    queryFn: () => apiFetch<EmployerInterviewsResponse>(`/me/employer/drives/${driveId}/interviews`, { token }),
    enabled: !!token && !!driveId,
  });
}

// POST .../interviews (Task 1) -- schedule a consent-granted candidate into one of the
// employer's slots. Invalidates the agenda + the employer-portal aggregate (dashboard KPIs
// read upcomingInterviews), same fan-out convention as useEmployerSlots.ts's mutations.
export function useScheduleInterview(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduleInterviewInput) =>
      apiFetch<EmployerInterview>(`/me/employer/drives/${driveId}/interviews`, { method: 'POST', body: input, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-interviews', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}

// PATCH .../interviews/:id (Task 2) -- confirm/complete/cancel/reschedule/set-interviewers.
export function useInterviewAction(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ interviewId, action }: { interviewId: string; action: InterviewAction }) =>
      apiFetch<EmployerInterview>(`/me/employer/drives/${driveId}/interviews/${interviewId}`, { method: 'PATCH', body: action, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-interviews', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}
