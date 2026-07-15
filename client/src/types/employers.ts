// Mirrors server/src/modules/employers/employers.service.ts EmployerListItem and
// server/src/modules/employers/employers.schemas.ts (INDUSTRIES/SIZES enums, createEmployerSchema)
// plus server/src/modules/registrations/registrations.{schemas,service}.ts (Registration shape,
// discriminated-union actionSchema) — the Registration/* types here are consumed by Task 7
// (Registration Approvals master-detail), declared here since both live under the Employers module.

export interface EmployerListItem {
  id: string; name: string; industry: string; size: string; spoc: string; email: string;
  status: 'Active' | 'Pending' | 'Disabled';
  activeDrives: number; candidatesViewed: number; shortlistRate: number; offerRate: number; respHours: number;
}

export interface EmployerListResponse {
  items: EmployerListItem[]; total: number; page: number; limit: number;
}

export interface EmployerListParams {
  q?: string; industry?: string; status?: string; sort?: string; order?: 'asc' | 'desc'; page?: number; limit?: number;
}

export interface EmployerInput {
  name: string; industry: string; size: string; spoc: string; email: string; status?: string;
}

// --- Registration Approvals (Task 7) ---

export interface Panelist { name: string; role: string; }
export interface ActivityEntry { action: string; by: string; at: string; }

export interface Registration {
  _id: string;
  company: string;
  industry: string;
  role: string;
  driveId: string | null;
  driveName: string;
  openings: number;
  ctcRange: string;
  skills: string[];
  slot: string;
  panel: Panelist[];
  jd: string;
  submittedBy: string;
  status: 'Pending review' | 'Approved' | 'Rejected' | 'Changes requested';
  activity: ActivityEntry[];
  createdAt: string;
}

export interface RegistrationListResponse {
  items: Registration[];
  counts: { pending: number; total: number };
}

// Mirrors server/src/modules/registrations/registrations.schemas.ts actionSchema exactly.
export type RegistrationActionPayload =
  | { action: 'approve' }
  | { action: 'reject'; reason?: string }
  | { action: 'request-changes'; note?: string }
  | { action: 'move-drive'; driveId: string }
  | { action: 'change-slot'; slot: string };
