export interface PortalProfile {
  id: string; code: string; name: string; email: string;
  institute: string; branch: string; gradYear: number; cgpa: number;
}
export interface PortalJourney {
  stage: string; stages: string[];
  matchReadinessPct: number; evaluationLabel: string; offerStatus: string;
}
export interface PortalDrive {
  id: string; name: string; domain: string;
  employers: string[]; eventDates: string[];
  statusTag: 'Selected' | 'In progress' | 'Closed';
}
export interface PortalData {
  profile: PortalProfile; journey: PortalJourney; drives: PortalDrive[];
}
export interface RevealRequestItem { applicationId: string; company: string; driveName: string; status: 'requested' | 'granted' | 'declined'; expired: boolean; requestedAt: string | null; expiresAt: string | null; respondedAt: string | null; }
export interface RevealRequestsData { items: RevealRequestItem[]; }
export interface InterviewItem { interviewId: string; company: string; driveName: string; date: string | null; start: string; end: string; time: string; status: string; interviewers: string[]; link: string; }
export interface OfferItem { applicationId: string; company: string; driveName: string; status: string; response: string; ctc: number; location: string; mode: string; joinDate: string | null; declineReason: string; }
export interface InterviewsData { items: InterviewItem[]; }
export interface OffersData { items: OfferItem[]; }
