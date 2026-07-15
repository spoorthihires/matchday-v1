import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../../api/client.js';
import { useAuth } from '../../../../auth/AuthContext.js';
import type { RegistrationListResponse } from '../../../../types/employers.js';

// GET /registrations → { items, counts: { pending, total } } — no params (the server route
// supports an optional ?status filter but this page always shows the full queue, per the
// prototype's #apprList which lists all four seeded registrations regardless of status).
export function useRegistrations() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['registrations'],
    queryFn: () => apiFetch<RegistrationListResponse>('/registrations', { token }),
    enabled: !!token,
  });
}
