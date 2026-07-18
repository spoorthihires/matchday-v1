// Static, in-memory mock data for the Ownership Management page. This page is UI-only per the
// task brief — there is no `/api/ownership` module — so every row here is hardcoded rather than
// fetched. Institute names/cities and the `source` values reuse the real seed pool
// (server/src/seed/seed.ts INSTITUTE_SEED/SOURCES) so the page reads consistently with the rest
// of the seeded app instead of introducing a parallel fictional dataset.

export interface CandidateOwnershipRow {
  id: string;
  candidate: string;
  email: string;
  institute: string;
  source: string;
  owner: string;
  ownerRole: string;
  assignedOn: string;
  status: 'Active' | 'Pending' | 'Unassigned';
}

export interface InstituteOwnershipRow {
  id: string;
  institute: string;
  city: string;
  owner: string;
  email: string;
  candidatesOwned: number;
  lastTransferred: string;
  status: 'Active' | 'Pending' | 'Disabled';
}

export interface SourceAttributionRow {
  id: string;
  source: string;
  candidates: number;
  sharePct: number;
  matchReadyPct: number;
  trend: 'up' | 'down' | 'flat';
}

export interface ConflictRow {
  id: string;
  type: 'Candidate' | 'Institute';
  entity: string;
  claimantA: string;
  claimantB: string;
  detectedOn: string;
  severity: 'High' | 'Medium' | 'Low';
  status: 'Open' | 'Resolved';
  resolvedOwner?: string;
}

export const OWNER_POOL = [
  'Sharath P.', 'Meera Nair', 'Arjun Rao', 'Divya Sen', 'Kabir Malhotra',
  'Ananya Iyer', 'Rohit Verma', 'Priya Menon',
];

export const INITIAL_CANDIDATE_OWNERSHIP: CandidateOwnershipRow[] = [
  { id: 'co-1', candidate: 'Ishaan Kapoor', email: 'ishaan.kapoor@vnr.edu', institute: 'VNR Vignana Jyothi', source: 'Campus', owner: 'Sharath P.', ownerRole: 'Recruiter', assignedOn: '2026-06-02', status: 'Active' },
  { id: 'co-2', candidate: 'Aditi Sharma', email: 'aditi.sharma@cbit.edu', institute: 'CBIT', source: 'Referral', owner: 'Meera Nair', ownerRole: 'SPOC', assignedOn: '2026-06-05', status: 'Active' },
  { id: 'co-3', candidate: 'Varun Reddy', email: 'varun.reddy@vitap.edu', institute: 'VIT-AP', source: 'Portal', owner: 'Arjun Rao', ownerRole: 'Recruiter', assignedOn: '2026-06-09', status: 'Pending' },
  { id: 'co-4', candidate: 'Sneha Pillai', email: 'sneha.pillai@gitam.edu', institute: 'GITAM', source: 'Walk-in', owner: 'Divya Sen', ownerRole: 'Recruiter', assignedOn: '2026-06-11', status: 'Active' },
  { id: 'co-5', candidate: 'Karthik Iyer', email: 'karthik.iyer@srmuniv.edu', institute: 'SRM University', source: 'Campus', owner: 'Unassigned', ownerRole: '—', assignedOn: '2026-06-14', status: 'Unassigned' },
  { id: 'co-6', candidate: 'Neha Joshi', email: 'neha.joshi@bits-hyd.edu', institute: 'BITS Pilani', source: 'Referral', owner: 'Kabir Malhotra', ownerRole: 'SPOC', assignedOn: '2026-06-16', status: 'Active' },
  { id: 'co-7', candidate: 'Rahul Menon', email: 'rahul.menon@amrita.edu', institute: 'Amrita', source: 'Portal', owner: 'Ananya Iyer', ownerRole: 'Recruiter', assignedOn: '2026-06-19', status: 'Active' },
  { id: 'co-8', candidate: 'Pooja Nambiar', email: 'pooja.nambiar@manipal.edu', institute: 'Manipal', source: 'Campus', owner: 'Rohit Verma', ownerRole: 'Recruiter', assignedOn: '2026-06-22', status: 'Pending' },
  { id: 'co-9', candidate: 'Aman Gupta', email: 'aman.gupta@pes.edu', institute: 'PES University', source: 'Walk-in', owner: 'Unassigned', ownerRole: '—', assignedOn: '2026-06-25', status: 'Unassigned' },
  { id: 'co-10', candidate: 'Ritika Bose', email: 'ritika.bose@msrit.edu', institute: 'MSRIT', source: 'Referral', owner: 'Priya Menon', ownerRole: 'SPOC', assignedOn: '2026-06-28', status: 'Active' },
];

export const INITIAL_INSTITUTE_OWNERSHIP: InstituteOwnershipRow[] = [
  { id: 'io-1', institute: 'VNR Vignana Jyothi', city: 'Hyderabad', owner: 'Sharath P.', email: 'spoc@vnr.edu', candidatesOwned: 60, lastTransferred: '2026-05-30', status: 'Active' },
  { id: 'io-2', institute: 'CBIT', city: 'Hyderabad', owner: 'Meera Nair', email: 'spoc@cbit.edu', candidatesOwned: 62, lastTransferred: '2026-06-01', status: 'Active' },
  { id: 'io-3', institute: 'VIT-AP', city: 'Amaravati', owner: 'Arjun Rao', email: 'spoc@vitap.edu', candidatesOwned: 69, lastTransferred: '2026-06-04', status: 'Active' },
  { id: 'io-4', institute: 'GITAM', city: 'Visakhapatnam', owner: 'Divya Sen', email: 'spoc@gitam.edu', candidatesOwned: 64, lastTransferred: '2026-05-28', status: 'Active' },
  { id: 'io-5', institute: 'SRM University', city: 'Chennai', owner: 'Kabir Malhotra', email: 'spoc@srmuniv.edu', candidatesOwned: 73, lastTransferred: '2026-06-10', status: 'Active' },
  { id: 'io-6', institute: 'BITS Pilani', city: 'Hyderabad', owner: 'Ananya Iyer', email: 'spoc@bits-hyd.edu', candidatesOwned: 59, lastTransferred: '2026-06-12', status: 'Pending' },
  { id: 'io-7', institute: 'Amrita', city: 'Coimbatore', owner: 'Rohit Verma', email: 'spoc@amrita.edu', candidatesOwned: 55, lastTransferred: '2026-05-20', status: 'Active' },
  { id: 'io-8', institute: 'Manipal', city: 'Manipal', owner: 'Priya Menon', email: 'spoc@manipal.edu', candidatesOwned: 58, lastTransferred: '2026-06-15', status: 'Disabled' },
];

export const SOURCE_ATTRIBUTION: SourceAttributionRow[] = [
  { id: 'sa-1', source: 'Campus', candidates: 512, sharePct: 40, matchReadyPct: 47, trend: 'up' },
  { id: 'sa-2', source: 'Referral', candidates: 321, sharePct: 25, matchReadyPct: 52, trend: 'up' },
  { id: 'sa-3', source: 'Portal', candidates: 282, sharePct: 22, matchReadyPct: 38, trend: 'flat' },
  { id: 'sa-4', source: 'Walk-in', candidates: 171, sharePct: 13, matchReadyPct: 31, trend: 'down' },
];

export const INITIAL_CONFLICTS: ConflictRow[] = [
  { id: 'cf-1', type: 'Candidate', entity: 'Karthik Iyer', claimantA: 'Sharath P.', claimantB: 'Arjun Rao', detectedOn: '2026-07-10', severity: 'High', status: 'Open' },
  { id: 'cf-2', type: 'Institute', entity: 'BITS Pilani', claimantA: 'Kabir Malhotra', claimantB: 'Ananya Iyer', detectedOn: '2026-07-09', severity: 'Medium', status: 'Open' },
  { id: 'cf-3', type: 'Candidate', entity: 'Aman Gupta', claimantA: 'Rohit Verma', claimantB: 'Priya Menon', detectedOn: '2026-07-07', severity: 'Low', status: 'Open' },
  { id: 'cf-4', type: 'Candidate', entity: 'Neha Joshi', claimantA: 'Divya Sen', claimantB: 'Meera Nair', detectedOn: '2026-07-03', severity: 'Medium', status: 'Resolved', resolvedOwner: 'Divya Sen' },
  { id: 'cf-5', type: 'Institute', entity: 'Manipal', claimantA: 'Priya Menon', claimantB: 'Sharath P.', detectedOn: '2026-06-29', severity: 'High', status: 'Resolved', resolvedOwner: 'Priya Menon' },
];
