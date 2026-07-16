export interface Funnel {
  uploaded: number; signupPct: number; completionPct: number;
  matchReadyPct: number; shortlistPct: number; offerPct: number; joinedPct: number;
}
export interface InstituteListItem extends Funnel {
  id: string; name: string; city: string; type: string;
  status: 'Active' | 'Pending' | 'Disabled'; owner: string; email: string;
}
export interface Overview { total: number; pending: number; uploaded: number; avgMatchReadyPct: number; }
export interface InstituteListResponse { items: InstituteListItem[]; total: number; page: number; limit: number; overview: Overview; }
export interface InstituteListParams {
  q?: string; type?: string; status?: string; sort?: string; order?: 'asc' | 'desc'; page?: number; limit?: number;
}
export interface InstituteInput {
  name: string; type: string; city: string; owner: string; email: string; status?: string;
}
export interface OwnershipEntry { owner: string; email: string; changedAt: string; changedBy: string; }
export interface InstituteDetailResponse {
  institute: { _id: string; name: string; city: string; type: string; status: string; owner: string; email: string; ownershipHistory: OwnershipEntry[]; createdAt: string };
  funnel: Funnel;
  kpis: { uploaded: number; matchReadyPct: number; shortlistPct: number; joinedPct: number };
  performance: { matchReadyPct: number; joinedPct: number; avgMatchReadyPct: number; rank: number | null; ofActive: number };
  assignedDrives: number;
}
export interface AssignedDriveItem { id: string; name: string; domain: string; stream: string; status: string; month: string; }
export interface AssignedDrivesResponse { items: AssignedDriveItem[] }
export interface CandidateRow { id: string; name: string; branch: string; gradYear: number; cgpa: number; source: string; stage: string; profileCompleted: boolean; }
export interface AuditRow { action: string; actor: string; detail: string; at: string; }
export interface Paged<T> { items: T[]; total: number; page: number; limit: number; }
