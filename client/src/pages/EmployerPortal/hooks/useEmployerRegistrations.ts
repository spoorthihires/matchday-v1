import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type {
  CreateRegistrationResult, EmployerRegistrationDetail, EmployerRegistrationsResponse, RegistrationInput,
} from '../../../types/employer.js';

// Mirrors useEmployerDrives.ts's shape (apiFetch + useAuth().token + useQuery, gated on
// `enabled: !!token`). Hits GET /api/me/employer/registrations (Task 2's
// employerRegistrationsController) -- the tracker list (Task 4 renders it).
export function useEmployerRegistrations() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-registrations'],
    queryFn: () => apiFetch<EmployerRegistrationsResponse>('/me/employer/registrations', { token }),
    enabled: !!token,
  });
}

// Hits GET /api/me/employer/registrations/:id (Task 2's employerRegistrationController) -- a
// single registration's full detail incl. activity log (Task 4 renders it).
export function useEmployerRegistration(id: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-registration', id],
    queryFn: () => apiFetch<EmployerRegistrationDetail>(`/me/employer/registrations/${id}`, { token }),
    enabled: !!token && !!id,
  });
}

// Mirrors useBookingMutations' mutation shape (apiFetch + invalidate-on-success). POSTs to
// /api/me/employer/registrations (Task 2's createEmployerRegistrationController); Task 3's
// EmployerRegister wizard is the sole caller. On success, invalidates the registrations list
// (so the Task 4 tracker picks up the new row) and the employer-portal aggregate (whose
// dashboard.registrations preview -- getEmployerPortal -- would otherwise go stale).
export function useCreateRegistration() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegistrationInput) =>
      apiFetch<CreateRegistrationResult>('/me/employer/registrations', { method: 'POST', body: input, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-registrations'] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}
