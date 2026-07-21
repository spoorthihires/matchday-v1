import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Application } from '../../models/Application.js';
import { Interview } from '../../models/Interview.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { poolSeekers, candidateScore } from './employerCandidates.service.js';
import { KANBAN_ORDER, deriveStage, type KanbanStage } from '../../constants/kanban.js';

const FUNNEL: { stage: string; threshold: KanbanStage | null }[] = [
  { stage: 'Recommended', threshold: null },
  { stage: 'Shortlisted', threshold: 'Shortlisted' },
  { stage: 'Confirmed', threshold: 'Candidate Confirmed' },
  { stage: 'Interviewed', threshold: 'Scheduled' },
  { stage: 'Offered', threshold: 'Offer Sent' },
  { stage: 'Accepted', threshold: 'Offer Accepted' },
  { stage: 'Joined', threshold: 'Joined' },
];
const OFFER_SENT = ['Sent', 'Accepted', 'Declined', 'Joined'];
const OFFER_ACCEPTED = ['Accepted', 'Joined'];

interface DriveLean { _id: Types.ObjectId; eligibility?: { branches?: string[]; gradYears?: number[]; sources?: string[] } }
interface SeekerLean { _id: Types.ObjectId; cgpa: number; evaluationStatus: string; stage: string }
interface AppLean { jobseekerId: Types.ObjectId; decision?: string | null; consent?: { status?: string } | null; stage?: string | null; offer?: { status?: string } | null }

interface Acc { recommended: number; reached: number[]; interviewsScheduled: number; offersSent: number; offersAccepted: number; scoreSum: number }

async function approvedDrives(employerId: string): Promise<{ id: string; name: string }[]> {
  const regs = await RegistrationRequest.find({ employerId, status: 'Approved' }).select('driveId').lean();
  const ids = [...new Set(regs.map((r) => String(r.driveId)))];
  const ds = await Drive.find({ _id: { $in: ids } }).select('name').lean<{ _id: Types.ObjectId; name?: string }[]>();
  return ds.map((d) => ({ id: String(d._id), name: d.name ?? '—' }));
}

async function accumulate(employerId: string, driveId: string, acc: Acc): Promise<void> {
  const drive = await Drive.findById(driveId).lean<DriveLean>();
  if (!drive) return;
  const pool = await poolSeekers(drive) as unknown as SeekerLean[];
  const apps = await Application.find({ employerId, driveId, jobseekerId: { $in: pool.map((s) => s._id) } }).lean<AppLean[]>();
  const appByJs = new Map(apps.map((a) => [String(a.jobseekerId), a]));
  const interviewed = new Set(
    (await Interview.find({ employerId, driveId, status: { $ne: 'Cancelled' } }).select('jobseekerId').lean<{ jobseekerId: Types.ObjectId }[]>())
      .map((i) => String(i.jobseekerId)),
  );
  acc.recommended += pool.length;
  acc.interviewsScheduled += interviewed.size;
  for (const s of pool) {
    const app = appByJs.get(String(s._id));
    const stage = (app?.stage as KanbanStage | null | undefined) ?? deriveStage(app?.decision, app?.consent?.status, interviewed.has(String(s._id)), app?.offer?.status);
    const flowIdx = KANBAN_ORDER.indexOf(stage);
    FUNNEL.forEach((f, i) => {
      if (f.threshold === null || (flowIdx >= 0 && flowIdx >= KANBAN_ORDER.indexOf(f.threshold))) acc.reached[i] += 1;
    });
    acc.scoreSum += candidateScore(s.cgpa, s.evaluationStatus, s.stage).matchScore;
    const os = app?.offer?.status;
    if (os && OFFER_SENT.includes(os)) acc.offersSent += 1;
    if (os && OFFER_ACCEPTED.includes(os)) acc.offersAccepted += 1;
  }
}

export async function getReport(employerId: string, driveIdParam?: string) {
  const drives = await approvedDrives(employerId);
  const scope = driveIdParam && driveIdParam !== 'all' ? driveIdParam : 'all';
  let targets: string[];
  if (scope === 'all') {
    targets = drives.map((d) => d.id);
  } else {
    if (!Types.ObjectId.isValid(scope)) throw new HttpError(404, 'Drive not found', 'not_found');
    if (!(await Drive.findById(scope).lean())) throw new HttpError(404, 'Drive not found', 'not_found');
    if (!(await hasApprovedRegistration(employerId, scope))) throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
    targets = [scope];
  }
  const acc: Acc = { recommended: 0, reached: FUNNEL.map(() => 0), interviewsScheduled: 0, offersSent: 0, offersAccepted: 0, scoreSum: 0 };
  for (const t of targets) await accumulate(employerId, t, acc);
  const funnel = FUNNEL.map((f, i) => ({
    stage: f.stage,
    count: acc.reached[i],
    conversionPct: i === 0 ? 100 : (acc.reached[i - 1] > 0 ? Math.round((acc.reached[i] / acc.reached[i - 1]) * 100) : 0),
  }));
  const shortlisted = acc.reached[1];
  const kpis = {
    recommended: acc.recommended,
    shortlisted,
    interviewsScheduled: acc.interviewsScheduled,
    offersSent: acc.offersSent,
    offersAccepted: acc.offersAccepted,
    dropOffPct: shortlisted > 0 ? Math.round(((shortlisted - acc.offersAccepted) / shortlisted) * 100) : 0,
    avgMatchScore: acc.recommended > 0 ? Math.round(acc.scoreSum / acc.recommended) : 0,
  };
  return { scope, drives, funnel, kpis };
}
