export interface JobseekerListItem {
  id: string; code: string; name: string; email: string;
  instituteId: string; instituteName: string; stream: string;
  evaluationLabel: string; matchReadinessPct: number; offerStatus: string;
  dupRisk: 'High' | 'Low'; consent: 'Granted' | 'Pending' | 'Revoked'; stage: string;
}
export interface JobseekerListResponse { items: JobseekerListItem[]; total: number; page: number; limit: number; }
export interface JobseekerListParams {
  q?: string; instituteId?: string; stream?: string; evaluationStatus?: string;
  offer?: string; consent?: string; matchBucket?: string;
  sort?: string; order?: 'asc' | 'desc'; page?: number; limit?: number;
}
export interface JobseekerInput {
  name: string; instituteId: string; branch: string; gradYear: number; cgpa: number;
  email?: string; consent?: string; stage?: string; evaluationStatus?: string; source?: string;
}

// Not part of the brief's verbatim block — added because the modal's EDIT prefill needs fields
// (gradYear/cgpa) that the list item doesn't carry (see jobseekers.service.ts#JobseekerListItem
// vs. the raw Jobseeker mongoose doc returned by GET /jobseekers/:id). Mirrors the doc shape in
// server/src/models/Jobseeker.ts.
export interface JobseekerDetail {
  _id: string; name: string; instituteId: string; branch: string;
  gradYear: number; cgpa: number; source: string; email: string;
  consent: 'Granted' | 'Pending' | 'Revoked'; profileCompleted: boolean;
  evaluationStatus: 'na' | 'pending' | 'completed' | 'failed'; stage: string; createdAt: string;
}
