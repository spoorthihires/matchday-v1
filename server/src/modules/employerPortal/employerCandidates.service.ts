import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Institute } from '../../models/Institute.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Application } from '../../models/Application.js';
import { Employer } from '../../models/Employer.js';
import { MATCH_READY_STAGES, MATCH_READY_STAGE_SET } from '../../constants/stages.js';
import { isEligible } from '../seekerPortal/seekerPortal.service.js';
import { codeFor, evaluationLabel } from '../jobseekers/jobseekers.service.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { consentBlock, type ConsentBlock } from '../../constants/consent.js';
import type { CandidatesQuery } from './employerCandidates.schemas.js';

interface DriveLean { _id: Types.ObjectId; eligibility?: { branches?: string[]; gradYears?: number[]; sources?: string[] } }
interface SeekerLean { _id: Types.ObjectId; instituteId: Types.ObjectId; branch: string; gradYear: number; cgpa: number; source: string; evaluationStatus: string; stage: string }

export interface RevealedIdentity { name: string; email: string; institute: string; city: string; }

export interface RedactedCandidate {
  jobseekerId: string; code: string;
  branch: string; gradYear: number; source: string;
  cgpaBand: string; instituteCategory: string;
  evaluationStatus: string; evaluationLabel: string; stage: string;
  matchScore: number; evalPill: 'Strong' | 'Qualified';
  decision: 'Shortlisted' | 'Hold' | 'Rejected' | null; noteCount: number;
  consent: ConsentBlock | null;
  revealed: RevealedIdentity | null;
}

const EVAL_WEIGHT: Record<string, number> = { completed: 1, pending: 0.5, na: 0.3, failed: 0 };
const STAGE_WEIGHT: Record<string, number> = { Joined: 1, Offer: 0.9, Shortlisted: 0.8, MatchReady: 0.6 };

export function candidateScore(cgpa: number, evaluationStatus: string, stage: string) {
  const normCgpa = Math.max(0, Math.min(1, (cgpa ?? 0) / 10));
  const evalW = EVAL_WEIGHT[evaluationStatus] ?? 0.3;
  const stageW = STAGE_WEIGHT[stage] ?? 0.5;
  const matchScore = Math.round(100 * (0.5 * normCgpa + 0.3 * evalW + 0.2 * stageW));
  return { matchScore, factors: { normCgpa, evalW, stageW } };
}
export function cgpaBand(cgpa: number): string {
  const lo = Math.floor((cgpa ?? 0) * 2) / 2;
  return `${lo.toFixed(1)}–${(lo + 0.5).toFixed(1)}`;
}
function redactCandidate(s: SeekerLean, instituteCategory: string, app?: { decision?: string | null; notes?: unknown[]; consent?: unknown } | null, reveal?: RevealedIdentity | null): RedactedCandidate {
  const { matchScore } = candidateScore(s.cgpa, s.evaluationStatus, s.stage);
  return {
    jobseekerId: String(s._id), code: codeFor(s._id),
    branch: s.branch, gradYear: s.gradYear, source: s.source,
    cgpaBand: cgpaBand(s.cgpa), instituteCategory,
    evaluationStatus: s.evaluationStatus, evaluationLabel: evaluationLabel(s.evaluationStatus), stage: s.stage,
    matchScore, evalPill: matchScore >= 80 ? 'Strong' : 'Qualified',
    decision: (app?.decision as RedactedCandidate['decision']) ?? null, noteCount: (app?.notes as unknown[] | undefined)?.length ?? 0,
    consent: consentBlock(app?.consent as Parameters<typeof consentBlock>[0]),
    revealed: reveal ?? null,
  };
}

export async function poolSeekers(drive: DriveLean): Promise<SeekerLean[]> {
  const seekers = await Jobseeker.find({ stage: { $in: MATCH_READY_STAGES } })
    .select('instituteId branch gradYear cgpa source evaluationStatus stage').lean<SeekerLean[]>();
  return seekers.filter((s) => isEligible(drive.eligibility, { branch: s.branch, gradYear: s.gradYear, source: s.source }));
}

export async function listCandidates(employerId: string, driveId: string, filters: CandidatesQuery) {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive to view candidates', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean<DriveLean>();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  const pool = await poolSeekers(drive);
  const instIds = [...new Set(pool.map((s) => String(s.instituteId)))];
  const insts = await Institute.find({ _id: { $in: instIds } }).select('type').lean<{ _id: Types.ObjectId; type?: string }[]>();
  const instType = new Map(insts.map((i) => [String(i._id), i.type ?? '—']));
  const apps = await Application.find({ employerId, driveId, jobseekerId: { $in: pool.map((s) => s._id) } }).lean();
  const appByJs = new Map(apps.map((a) => [String(a.jobseekerId), a]));
  const grantedIds = apps.filter((a) => (a.consent as { status?: string } | undefined)?.status === 'granted').map((a) => a.jobseekerId);
  const revealMap = new Map<string, RevealedIdentity>();
  if (grantedIds.length) {
    const revealed = await Jobseeker.find({ _id: { $in: grantedIds } }).select('name email instituteId')
      .lean<{ _id: Types.ObjectId; name: string; email?: string; instituteId: Types.ObjectId }[]>();
    const revInstIds = [...new Set(revealed.map((r) => String(r.instituteId)))];
    const revInsts = await Institute.find({ _id: { $in: revInstIds } }).select('name city')
      .lean<{ _id: Types.ObjectId; name: string; city: string }[]>();
    const revInstMap = new Map(revInsts.map((i) => [String(i._id), i]));
    for (const r of revealed) {
      const ri = revInstMap.get(String(r.instituteId));
      revealMap.set(String(r._id), { name: r.name, email: r.email ?? '', institute: ri?.name ?? '—', city: ri?.city ?? '—' });
    }
  }
  let items = pool.map((s) => redactCandidate(s, instType.get(String(s.instituteId)) ?? '—', appByJs.get(String(s._id)), revealMap.get(String(s._id)) ?? null));
  if (filters.evaluation) items = items.filter((c) => c.evalPill === filters.evaluation);
  if (filters.decision) items = items.filter((c) => (filters.decision === 'undecided' ? c.decision === null : c.decision === filters.decision));
  if (filters.q && filters.q.trim()) {
    const rx = new RegExp(filters.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    items = items.filter((c) => rx.test(c.code) || rx.test(c.branch));
  }
  items.sort((a, b) => b.matchScore - a.matchScore);
  return { items };
}

// Reused by Task 2 (passport/decision/notes): gate + pool membership. 404 for a
// jobseeker outside this drive's eligible∩Match-Ready pool — indistinguishable
// from a bad id (no enumeration oracle).
export async function requirePoolMember(employerId: string, driveId: string, jobseekerId: string): Promise<{ drive: DriveLean; seeker: SeekerLean }> {
  if (!Types.ObjectId.isValid(driveId) || !Types.ObjectId.isValid(jobseekerId)) throw new HttpError(404, 'Candidate not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive to view candidates', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean<DriveLean>();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  const seeker = await Jobseeker.findById(jobseekerId)
    .select('instituteId branch gradYear cgpa source evaluationStatus stage').lean<SeekerLean>();
  if (!seeker || !MATCH_READY_STAGE_SET.has(seeker.stage)
    || !isEligible(drive.eligibility, { branch: seeker.branch, gradYear: seeker.gradYear, source: seeker.source })) {
    throw new HttpError(404, 'Candidate not found', 'not_found');
  }
  return { drive, seeker };
}

export { redactCandidate };

export async function getPassport(employerId: string, driveId: string, jobseekerId: string) {
  const { seeker } = await requirePoolMember(employerId, driveId, jobseekerId);
  const inst = await Institute.findById(seeker.instituteId).select('type').lean<{ type?: string }>();
  const app = await Application.findOne({ employerId, driveId, jobseekerId }).lean();
  let reveal: RevealedIdentity | null = null;
  if ((app?.consent as { status?: string } | undefined)?.status === 'granted') {
    const [ident, revInst] = await Promise.all([
      Jobseeker.findById(jobseekerId).select('name email').lean<{ name: string; email?: string }>(),
      Institute.findById(seeker.instituteId).select('name city').lean<{ name: string; city: string }>(),
    ]);
    reveal = { name: ident?.name ?? '—', email: ident?.email ?? '', institute: revInst?.name ?? '—', city: revInst?.city ?? '—' };
  }
  const base = redactCandidate(seeker, inst?.type ?? '—', app, reveal);
  const { factors } = candidateScore(seeker.cgpa, seeker.evaluationStatus, seeker.stage);
  return {
    ...base,
    factors: {
      cgpa: { weight: 0.5, value: factors.normCgpa, contribution: Math.round(100 * 0.5 * factors.normCgpa) },
      evaluation: { weight: 0.3, value: factors.evalW, contribution: Math.round(100 * 0.3 * factors.evalW) },
      stage: { weight: 0.2, value: factors.stageW, contribution: Math.round(100 * 0.2 * factors.stageW) },
    },
    notes: (app?.notes ?? []).map((n: { text: string; by?: string; at: Date }) => ({ text: n.text, by: n.by ?? '', at: new Date(n.at).toISOString() })),
  };
}

export async function setDecision(employerId: string, driveId: string, jobseekerId: string, decision: 'Shortlisted' | 'Hold' | 'Rejected' | null) {
  const { seeker } = await requirePoolMember(employerId, driveId, jobseekerId);
  if (decision === null) {
    // Atomic so a concurrent addNote can't be lost: delete the row only if it has
    // no notes; if the delete matched nothing (notes exist, or no row), just clear
    // the decision. A read-then-write here could drop a note landing between the two.
    // `stage: null` (matches null or missing) guards a pinned kanban card (Slice 8)
    // from being deleted out from under the board.
    const { deletedCount } = await Application.deleteOne({ employerId, driveId, jobseekerId, notes: { $size: 0 }, consent: { $exists: false }, stage: null });
    if (deletedCount === 0) await Application.updateOne({ employerId, driveId, jobseekerId }, { $set: { decision: null } });
  } else {
    await Application.findOneAndUpdate(
      { employerId, driveId, jobseekerId },
      { $set: { decision }, $setOnInsert: { employerId, driveId, jobseekerId } },
      { upsert: true, new: true },
    );
  }
  const app = await Application.findOne({ employerId, driveId, jobseekerId }).lean();
  const inst = await Institute.findById(seeker.instituteId).select('type').lean<{ type?: string }>();
  return redactCandidate(seeker, inst?.type ?? '—', app);
}

export async function addNote(employerId: string, driveId: string, jobseekerId: string, text: string) {
  await requirePoolMember(employerId, driveId, jobseekerId);
  const emp = await Employer.findById(employerId).select('spoc name').lean<{ spoc?: string; name?: string }>();
  const by = emp?.spoc || emp?.name || 'Employer';
  await Application.findOneAndUpdate(
    { employerId, driveId, jobseekerId },
    { $push: { notes: { text, by, at: new Date() } }, $setOnInsert: { employerId, driveId, jobseekerId } },
    { upsert: true, new: true },
  );
  return getPassport(employerId, driveId, jobseekerId);
}
