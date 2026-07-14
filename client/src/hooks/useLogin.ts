import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.js';

export function useLogin() {
  const { login } = useAuth();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => login(email, password),
  });
}
