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

export type EmployerNotificationCategory = 'registration' | 'candidate' | 'slot';
export interface EmployerNotification {
  id: string;
  category: EmployerNotificationCategory;
  title: string;
  body: string;
  at: string;
  link: string;
  read: boolean;
}
export interface EmployerNotificationsResponse {
  items: EmployerNotification[];
  unreadCount: number;
  lastReadAt: string | null;
}

export interface EmployerDashboard {
  kpis: { activeDrives: number; upcomingInterviews: number; totalSlots: number };
  calendar: EmployerCalendarEntry[];
  registrations: unknown[];
  shortlist: unknown[];
  notifications: EmployerNotification[];
  notificationsUnread: number;
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

// Mirrors server/src/modules/employerPortal/employerPortal.schemas.ts's createRegistrationSchema
// (Tasks 1+2) exactly -- field names/nesting must match the zod shape verbatim, since the server
// rejects (400) any body it doesn't recognise and silently ignores anything else (it derives
// company/industry/employerId server-side, so those are deliberately NOT part of this type).
export interface RegistrationDetailsInput {
  roleDescription?: string;
  deadline?: string;
  urgency?: string;
  goodToHave?: string[];
  qualification?: string;
  gradYearFrom?: number;
  gradYearTo?: number;
  expMin?: number;
  expMax?: number;
  stipend?: number;
  cities?: string[];
  workMode?: string;
  officeLocation?: string;
  rounds?: number;
  roundNames?: string;
  minEvalScore?: number;
  mandatorySkills?: string[];
}

export interface RegistrationInput {
  driveId: string;
  role: string;
  openings?: number;
  ctcMin?: number;
  ctcMax?: number;
  mustHave?: string[];
  preferredWednesday?: string;
  timeSlot?: string;
  jd?: string;
  details?: RegistrationDetailsInput;
}

// Mirrors listEmployerRegistrations' row shape (Task 2) -- the tracker row (Task 4 consumes this).
export interface EmployerRegistrationItem {
  id: string;
  driveId: string;
  driveName: string;
  role: string;
  openings: number;
  status: string;
  submittedAt: string;
  latestActivity: string;
}

export interface EmployerRegistrationsResponse {
  items: EmployerRegistrationItem[];
}

export interface EmployerRegistrationActivity {
  action: string;
  by: string;
  at: string;
}

// Mirrors getEmployerRegistration's return shape (Task 2).
export interface EmployerRegistrationDetail {
  id: string;
  driveName: string;
  role: string;
  openings: number;
  ctcRange: string;
  skills: string[];
  slot: string;
  jd: string;
  status: string;
  submittedAt: string;
  activity: EmployerRegistrationActivity[];
  details: RegistrationDetailsInput;
}

// Mirrors createEmployerRegistration's 201 response shape (Task 2).
export interface CreateRegistrationResult {
  id: string;
  status: string;
  driveName: string;
  role: string;
}

// Mirrors server/src/modules/employerPortal/employerPortal.service.ts EmployerSlotItem (Slice 4).
export interface EmployerSlot {
  id: string;
  date: string; // ISO
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  capacity: number;
  booked: number; // derived (0 until the candidate-booking slice)
  status: string;
  link: string;
}
export interface EmployerSlotsResponse { items: EmployerSlot[]; }

// Mirrors createSlotSchema/updateSlotSchema (Slice 4). driveId comes from the route,
// employerId from the JWT — neither is part of the body.
export interface SlotInput {
  date: string; // ISO date string (one of the drive's eventDates)
  start: string;
  end: string;
  capacity: number;
  linkMode: 'auto' | 'own';
  link?: string;
}

// Mirrors server/src/modules/employerPortal/employerCandidates.service.ts's RedactedCandidate
// (Slice 5a) exactly -- NO name/email (identity is masked until a shortlisted candidate
// confirms interest, per the prototype's privacy model).
export type CandidateDecision = 'Shortlisted' | 'Hold' | 'Rejected' | null;

export interface CandidateConsent {
  status: 'requested' | 'granted' | 'declined' | null;
  expired: boolean;
  requestedAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
}
export interface RevealedIdentity { name: string; email: string; institute: string; city: string; }

export interface EmployerCandidate {
  jobseekerId: string;
  code: string;
  branch: string;
  gradYear: number;
  source: string;
  cgpaBand: string;
  instituteCategory: string;
  evaluationStatus: string;
  evaluationLabel: string;
  stage: string;
  matchScore: number;
  evalPill: 'Strong' | 'Qualified';
  decision: CandidateDecision;
  noteCount: number;
  consent: CandidateConsent | null;
  revealed: RevealedIdentity | null;
}
export interface EmployerCandidatesResponse { items: EmployerCandidate[]; }

// Mirrors getPassport's return shape (Slice 5a Task 2) -- the passport page is Task 4, but the
// type + hook are added now so both slices share one source of truth.
export interface CandidatePassportFactors {
  cgpa: { weight: number; value: number; contribution: number };
  evaluation: { weight: number; value: number; contribution: number };
  stage: { weight: number; value: number; contribution: number };
}
export interface CandidateNote { text: string; by: string; at: string; }
export interface CandidatePassport extends EmployerCandidate {
  factors: CandidatePassportFactors;
  notes: CandidateNote[];
}

// Mirrors server/src/modules/employerPortal/employerShortlist.service.ts's ShortlistPackItem /
// shortlistPack return shape exactly (Slice 6 Tasks 1-2) -- the redacted, downloadable CSV pack
// this task's EmployerShortlist page builds client-side from.
export interface ShortlistPackItem {
  code: string; matchScore: number; evalPill: 'Strong' | 'Qualified';
  branch: string; gradYear: number; cgpaBand: string; instituteCategory: string; stage: string;
  consentStatus: 'requested' | 'granted' | 'declined' | 'expired' | 'none';
  notes: string[];
}
export interface ShortlistPack { driveName: string; generatedAt: string; items: ShortlistPackItem[]; }

// Mirrors server/src/modules/employerPortal/employerInterviews.service.ts's projectWith/
// projectOne return shape exactly (Slice 7 Tasks 1-2) -- the schedule/agenda/action endpoints
// this task's EmployerInterviews page reads and writes.
export interface InterviewSlotRef { id: string; date: string; start: string; end: string; link: string; }
export interface EmployerInterview {
  id: string; jobseekerId: string; code: string; name: string; email: string;
  time: string; status: 'Scheduled' | 'Confirmed' | 'Cancelled' | 'Completed'; interviewers: string[];
  slot: InterviewSlotRef | null;
}
export interface EmployerInterviewsResponse { items: EmployerInterview[]; }
export interface ScheduleInterviewInput { jobseekerId: string; slotId: string; time: string; interviewers?: string[]; }
export type InterviewAction =
  | { action: 'confirm' } | { action: 'complete' } | { action: 'cancel' }
  | { action: 'reschedule'; slotId: string; time: string }
  | { action: 'set-interviewers'; interviewers: string[] };

// Mirrors server/src/constants/kanban.ts's KANBAN_STAGES/KANBAN_ORDER/KANBAN_TERMINAL and
// server/src/modules/employerPortal/employerBoard.service.ts's BoardCard shape exactly
// (Slice 8 Tasks 1-2) -- the pipeline board this task's EmployerKanban page renders.
export type BoardStage =
  | 'Recommended' | 'Shortlisted' | 'Candidate Confirmed' | 'Scheduled'
  | 'L1' | 'L2' | 'L3' | 'HR' | 'Offer Sent' | 'Offer Accepted' | 'Joined'
  | 'Rejected' | 'Withdrawn';
export const KANBAN_ORDER: BoardStage[] = ['Recommended', 'Shortlisted', 'Candidate Confirmed', 'Scheduled', 'L1', 'L2', 'L3', 'HR', 'Offer Sent', 'Offer Accepted', 'Joined'];
export const KANBAN_TERMINAL: BoardStage[] = ['Rejected', 'Withdrawn'];
export const KANBAN_ALL: BoardStage[] = [...KANBAN_ORDER, ...KANBAN_TERMINAL];
export interface BoardCard {
  jobseekerId: string; code: string; branch: string; matchScore: number; evalPill: 'Strong' | 'Qualified';
  stage: BoardStage; decision: 'Shortlisted' | 'Hold' | 'Rejected' | null;
  consentStatus: 'requested' | 'granted' | 'declined' | 'expired' | 'none';
  revealed: { name: string; email: string } | null;
}
export interface EmployerBoardResponse { items: BoardCard[]; }

// Mirrors server/src/modules/employerPortal/employerOffers.service.ts's OfferProjection /
// listOffers return shape exactly (Slice 9 Tasks 1-2) -- the offer-management dashboard this
// task's EmployerOffers page renders (KPI row + per-row update + new-offer picker).
export type OfferStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Joined';
export type OfferResponse = 'Pending' | 'Negotiating' | 'Accepted' | 'Declined';
export type OfferMode = 'On-site' | 'Hybrid' | 'Remote';
export interface EmployerOffer {
  jobseekerId: string; code: string; matchScore: number; revealed: { name: string; email: string };
  status: OfferStatus; response: OfferResponse; ctc: number; location: string; mode: OfferMode;
  joinDate: string | null; declineReason: string;
}
export interface EmployerOffersResponse { items: EmployerOffer[]; counts: Record<OfferStatus, number>; }
export interface OfferInput {
  status: OfferStatus; response?: OfferResponse; ctc?: number; location?: string; mode?: OfferMode; joinDate?: string; declineReason?: string;
}

export interface ReportFunnelStage { stage: string; count: number; conversionPct: number; }
export interface EmployerReport {
  scope: string;
  drives: { id: string; name: string }[];
  funnel: ReportFunnelStage[];
  kpis: {
    recommended: number; shortlisted: number; interviewsScheduled: number;
    offersSent: number; offersAccepted: number; dropOffPct: number; avgMatchScore: number;
  };
}
