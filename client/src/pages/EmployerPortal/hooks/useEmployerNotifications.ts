import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerNotificationsResponse } from '../../../types/employer.js';

export function useEmployerNotifications() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-notifications'],
    queryFn: () => apiFetch<EmployerNotificationsResponse>('/me/employer/notifications', { token }),
    enabled: !!token,
  });
}

export function useMarkNotificationsRead() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ lastReadAt: string; unreadCount: number }>('/me/employer/notifications/read', { method: 'POST', token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-notifications'] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
