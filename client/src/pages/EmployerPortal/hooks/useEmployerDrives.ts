import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerDriveDetail, EmployerDrivesResponse } from '../../../types/employer.js';

// Mirrors useEmployerPortal.ts's shape: apiFetch + useAuth().token + useQuery, gated on
// `enabled: !!token`. Hits GET /api/me/employer/drives (Task 1's employerDrivesController),
// which lists Active/Published drives (Draft/Archived hidden server-side) with optional
// `q`/`domain` filters. Falsy params are dropped from the querystring (both here and
// server-side) so an empty search/domain never sends `?q=&domain=`.
export function useEmployerDrives(params: { q?: string; domain?: string }) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['employer-drives', params.q ?? '', params.domain ?? ''],
    queryFn: () => apiFetch<EmployerDrivesResponse>(`/me/employer/drives${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}

// Hits GET /api/me/employer/drives/:id (Task 1's employerDriveController): 200 with the full
// detail projection for an Active/Published drive, 404 for Draft/Archived/nonexistent. Used by
// Task 3's EmployerDriveDetail page; defined alongside the list hook since they share the
// EmployerDriveDetail type.
export function useEmployerDrive(id: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-drive', id],
    queryFn: () => apiFetch<EmployerDriveDetail>(`/me/employer/drives/${id}`, { token }),
    enabled: !!token && !!id,
  });
}
