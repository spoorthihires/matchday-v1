// Post-authentication landing path for a given role.
export function homePathFor(role: string | undefined): string {
  return role === 'jobseeker' ? '/portal' : '/';
}
