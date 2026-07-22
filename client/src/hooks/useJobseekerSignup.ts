import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';

export interface InstituteOption { id: string; name: string; }

// Powers the institute <select> on the public jobseeker signup page
// (client/src/pages/JobseekerLanding/JobseekerSignup.tsx). GET /auth/institutes is public
// (no auth token) -- a visitor filling out the signup form has no session yet.
export function useInstitutes() {
  return useQuery({
    queryKey: ['auth-institutes'],
    queryFn: () => apiFetch<{ items: InstituteOption[] }>('/auth/institutes'),
  });
}
