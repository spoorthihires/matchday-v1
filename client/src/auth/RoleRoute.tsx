import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.js';

export function RoleRoute({ role, children }: { role: 'admin' | 'jobseeker'; children: ReactNode }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (user && user.role !== role) {
    return <Navigate to={user.role === 'jobseeker' ? '/portal' : '/'} replace />;
  }
  return <>{children}</>;
}
