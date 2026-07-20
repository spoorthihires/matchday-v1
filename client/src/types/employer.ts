// Mirrors server/src/modules/employerPortal/employerPortal.service.ts getEmployerPortal's return
// shape exactly: { profile, dashboard }. `registrations`/`shortlist` are typed `unknown[]`
// server-side too — they're placeholders filled in by later slices (Slice 3 / Slice 6).

export interface EmployerProfile {
  id: string;
  name: string;
  email: string;
  industry: string;
  size: string;
  status: string;
  spoc: string;
  website: string;
}

export interface EmployerCalendarEntry {
  id: string;
  date: string; // ISO string
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  driveId: string;
}

export interface EmployerDashboard {
  kpis: { activeDrives: number; upcomingInterviews: number; totalSlots: number };
  calendar: EmployerCalendarEntry[];
  registrations: unknown[];
  shortlist: unknown[];
}

export interface EmployerPortalResponse {
  profile: EmployerProfile;
  dashboard: EmployerDashboard;
}

// Mirrors server/src/modules/employerPortal/employerPortal.service.ts's driveProjection /
// getEmployerDrive return shapes exactly (Task 1). EmployerDriveDetail extends the list item
// with the eligibility/evaluation/streamId fields the detail endpoint adds — defined here
// (Task 2) even though the detail page itself is Task 3, so both slices share one source of
// truth for the shape.
export interface EmployerDriveListItem {
  id: string;
  name: string;
  domain: string;
  stream: string;
  month: string;
  primaryEventDate: string | null;
  eventDates: string[];
  candCap: number;
  empCap: number;
  slotCap: number;
  frequency: string;
  eventDay: string;
  status: string;
  employerReg: string;
  canRegister: boolean;
}

export interface EmployerDrivesResponse {
  items: EmployerDriveListItem[];
}

export interface EmployerDriveDetail extends EmployerDriveListItem {
  eligibility: { sources: string[]; branches: string[]; gradYears: number[]; expType: string };
  evaluation: { key: string; enabled: boolean; config: Record<string, number> }[];
  streamId: string | null;
}
