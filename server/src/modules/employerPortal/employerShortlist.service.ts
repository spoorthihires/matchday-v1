import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Institute } from '../../models/Institute.js';
import { Application } from '../../models/Application.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { poolSeekers, candidateScore, cgpaBand } from './employerCandidates.service.js';
import { codeFor } from '../jobseekers/jobseekers.service.js';
import { consentBlock } from '../../constants/consent.js';

interface DriveShape { _id: Types.ObjectId; name?: string; eligibility?: { branches?: string[]; gradYears?: number[]; sources?: string[] } }

async function gateAndDrive(employerId: string, driveId: string): Promise<DriveShape> {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean<DriveShape>();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  return drive;
}

export async function bulkDecision(employerId: string, driveId: string, jobseekerIds: string[], decision: 'Shortlisted' | 'Hold' | 'Rejected') {
  const drive = await gateAndDrive(employerId, driveId);
  const pool = await poolSeekers(drive);
  const requested = new Set(jobseekerIds);
  const valid = pool.filter((s) => requested.has(String(s._id)));   // intersect with the pool; unknown/non-pool ids are silently skipped
  if (valid.length) {
    const empId = new Types.ObjectId(employerId);
    const drvId = new Types.ObjectId(driveId);
    await Application.bulkWrite(valid.map((s) => ({
      updateOne: {
        filter: { employerId: empId, driveId: drvId, jobseekerId: s._id },
        update: { $set: { decision }, $setOnInsert: { employerId: empId, driveId: drvId, jobseekerId: s._id } },
        upsert: true,
      },
    })));
  }
  return { updated: valid.length };
}

export interface ShortlistPackItem {
  code: string; matchScore: number; evalPill: 'Strong' | 'Qualified';
  branch: string; gradYear: number; cgpaBand: string; instituteCategory: string; stage: string;
  consentStatus: 'requested' | 'granted' | 'declined' | 'expired' | 'none';
  notes: string[];
}

export async function shortlistPack(employerId: string, driveId: string) {
  const drive = await gateAndDrive(employerId, driveId);
  const pool = await poolSeekers(drive);
  const poolById = new Map(pool.map((s) => [String(s._id), s]));
  const apps = await Application.find({ employerId, driveId, decision: 'Shortlisted', jobseekerId: { $in: pool.map((s) => s._id) } }).lean();
  const instIds = [...new Set(apps.map((a) => poolById.get(String(a.jobseekerId))).filter(Boolean).map((s) => String(s!.instituteId)))];
  const insts = await Institute.find({ _id: { $in: instIds } }).select('type').lean<{ _id: Types.ObjectId; type?: string }[]>();
  const instType = new Map(insts.map((i) => [String(i._id), i.type ?? '—']));
  const items: ShortlistPackItem[] = apps.map((a): ShortlistPackItem => {
    const s = poolById.get(String(a.jobseekerId))!;
    const { matchScore } = candidateScore(s.cgpa, s.evaluationStatus, s.stage);
    const cb = consentBlock(a.consent as Parameters<typeof consentBlock>[0]);
    const consentStatus = (cb ? (cb.expired ? 'expired' : cb.status) : 'none') as ShortlistPackItem['consentStatus'];
    return {
      code: codeFor(s._id), matchScore, evalPill: matchScore >= 80 ? 'Strong' : 'Qualified',
      branch: s.branch, gradYear: s.gradYear, cgpaBand: cgpaBand(s.cgpa),
      instituteCategory: instType.get(String(s.instituteId)) ?? '—', stage: s.stage,
      consentStatus, notes: ((a.notes ?? []) as { text: string }[]).map((n) => n.text),
    };
  }).sort((x, y) => y.matchScore - x.matchScore);
  return { driveName: drive.name ?? '—', generatedAt: new Date().toISOString(), items };
}
