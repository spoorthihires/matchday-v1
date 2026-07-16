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
