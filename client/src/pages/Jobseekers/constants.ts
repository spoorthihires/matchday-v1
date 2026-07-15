// Shared option lists + derivation maps for the Jobseekers module. Streams/offer/consent option
// lists mirror the server's enums (server/src/modules/jobseekers/jobseekers.schemas.ts) and the
// task brief's stream set (CSE/IT/ECE/EEE/MECH); the ordinal/offer-to-stage maps mirror
// jobseekers.service.ts's MR_ORDINAL / offerStatus() so the modal's read-only match-readiness %
// preview and offer→stage mapping stay in lockstep with what the server will actually compute.

export const STREAM_OPTIONS = ['CSE', 'IT', 'ECE', 'EEE', 'MECH'];

export const EVAL_OPTIONS: { label: string; value: 'na' | 'pending' | 'completed' }[] = [
  { label: 'Not started', value: 'na' },
  { label: 'In progress', value: 'pending' },
  { label: 'Completed', value: 'completed' },
];
export const EVAL_LABEL_TO_VALUE: Record<string, 'na' | 'pending' | 'completed'> = {
  'Not started': 'na', 'In progress': 'pending', Completed: 'completed',
};

export const MATCH_BUCKET_OPTIONS: { label: string; value: 'high' | 'mid' | 'low' }[] = [
  { label: 'High (≥75%)', value: 'high' },
  { label: 'Mid (30–74%)', value: 'mid' },
  { label: 'Low (<30%)', value: 'low' },
];

export const OFFER_OPTIONS = ['None', 'Shortlisted', 'Offer sent', 'Joined', 'Rejected'];
export const CONSENT_OPTIONS: ('Granted' | 'Pending' | 'Revoked')[] = ['Granted', 'Pending', 'Revoked'];

// Mirrors jobseekers.service.ts#MR_ORDINAL exactly.
export const MR_ORDINAL: Record<string, number> = {
  Applied: 10, Screened: 30, Evaluated: 55, MatchReady: 75, Shortlisted: 85, Offer: 92, Joined: 100, DroppedOff: 0,
};

// Forward direction only (offer label -> the single stage it sets when saving). The server's
// OFFER_TO_STAGE is used for *filtering* and maps 'None' to several stages — that reverse/fan-out
// case doesn't apply here, so 'None' is deliberately absent; callers special-case it themselves
// (see JobseekerModal's ADD/EDIT decision in the task brief).
export const OFFER_TO_STAGE: Record<string, string> = {
  Shortlisted: 'Shortlisted', 'Offer sent': 'Offer', Joined: 'Joined', Rejected: 'DroppedOff',
};
