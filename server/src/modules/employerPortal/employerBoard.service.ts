import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Application } from '../../models/Application.js';
import { Interview } from '../../models/Interview.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { poolSeekers, candidateScore, requirePoolMember } from './employerCandidates.service.js';
import { codeFor } from '../jobseekers/jobseekers.service.js';
import { consentBlock } from '../../constants/consent.js';
import { deriveStage, type KanbanStage } from '../../constants/kanban.js';

interface SeekerLean { _id: Types.ObjectId; instituteId: Types.ObjectId; branch: string; gradYear: number; cgpa: number; source: string; evaluationStatus: string; stage: string }
interface AppLean { jobseekerId: Types.ObjectId; decision?: string | null; consent?: { status?: string } | null; stage?: KanbanStage | null }
export interface RevealedIdentity { name: string; email: string; }
export interface BoardCard {
  jobseekerId: string; code: string; branch: string; matchScore: number; evalPill: 'Strong' | 'Qualified';
  stage: KanbanStage; decision: 'Shortlisted' | 'Hold' | 'Rejected' | null;
  consentStatus: 'requested' | 'granted' | 'declined' | 'expired' | 'none'; revealed: RevealedIdentity | null;
}

interface DriveLean { _id: Types.ObjectId; eligibility?: { branches?: string[]; gradYears?: number[]; sources?: string[] } }

async function gateAndDrive(employerId: string, driveId: string): Promise<DriveLean> {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean<DriveLean>();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  return drive;
}

export function boardCard(s: SeekerLean, app: AppLean | undefined, hasInterview: boolean, reveal: RevealedIdentity | null): BoardCard {
  const { matchScore } = candidateScore(s.cgpa, s.evaluationStatus, s.stage);
  const cb = consentBlock(app?.consent as Parameters<typeof consentBlock>[0]);
  const consentStatus = (cb ? (cb.expired ? 'expired' : cb.status) : 'none') as BoardCard['consentStatus'];
  const stage = (app?.stage as KanbanStage | null | undefined) ?? deriveStage(app?.decision, app?.consent?.status, hasInterview);
  return {
    jobseekerId: String(s._id), code: codeFor(s._id), branch: s.branch,
    matchScore, evalPill: matchScore >= 80 ? 'Strong' : 'Qualified',
    stage, decision: (app?.decision as BoardCard['decision']) ?? null, consentStatus, revealed: reveal,
  };
}

async function revealMapFor(apps: AppLean[]): Promise<Map<string, RevealedIdentity>> {
  const grantedIds = apps.filter((a) => a.consent?.status === 'granted').map((a) => a.jobseekerId);
  const map = new Map<string, RevealedIdentity>();
  if (grantedIds.length) {
    const revealed = await Jobseeker.find({ _id: { $in: grantedIds } }).select('name email').lean<{ _id: Types.ObjectId; name: string; email?: string }[]>();
    for (const r of revealed) map.set(String(r._id), { name: r.name, email: r.email ?? '' });
  }
  return map;
}

export async function setStage(employerId: string, driveId: string, jobseekerId: string, stage: KanbanStage): Promise<BoardCard> {
  const { seeker } = await requirePoolMember(employerId, driveId, jobseekerId);
  await Application.findOneAndUpdate(
    { employerId, driveId, jobseekerId },
    { $set: { stage }, $setOnInsert: { employerId, driveId, jobseekerId } },
    { upsert: true, new: true },
  );
  const app = await Application.findOne({ employerId, driveId, jobseekerId }).lean<AppLean>();
  const hasInterview = !!(await Interview.findOne({ employerId, driveId, jobseekerId, status: { $ne: 'Cancelled' } }));
  const reveal = app?.consent?.status === 'granted'
    ? await Jobseeker.findById(jobseekerId).select('name email').lean<{ name: string; email?: string }>().then((r) => ({ name: r?.name ?? '—', email: r?.email ?? '' }))
    : null;
  return boardCard(seeker as unknown as SeekerLean, app ?? undefined, hasInterview, reveal);
}

export async function getBoard(employerId: string, driveId: string) {
  const drive = await gateAndDrive(employerId, driveId);
  const pool = await poolSeekers(drive) as unknown as SeekerLean[];
  const apps = await Application.find({ employerId, driveId, jobseekerId: { $in: pool.map((s) => s._id) } }).lean<AppLean[]>();
  const appByJs = new Map(apps.map((a) => [String(a.jobseekerId), a]));
  const interviewed = new Set(
    (await Interview.find({ employerId, driveId, status: { $ne: 'Cancelled' } }).select('jobseekerId').lean<{ jobseekerId: Types.ObjectId }[]>())
      .map((i) => String(i.jobseekerId)),
  );
  const revealMap = await revealMapFor(apps);
  const items = pool.map((s) => boardCard(s, appByJs.get(String(s._id)), interviewed.has(String(s._id)), revealMap.get(String(s._id)) ?? null));
  items.sort((a, b) => b.matchScore - a.matchScore);
  return { items };
}
