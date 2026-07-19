// Post-authentication landing path for a given role.
export function homePathFor(role: string | undefined): string {
  if (role === 'jobseeker') return '/portal';
  if (role === 'employer') return '/employer/dashboard';
  return '/';
}
