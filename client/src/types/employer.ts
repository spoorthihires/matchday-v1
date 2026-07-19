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
