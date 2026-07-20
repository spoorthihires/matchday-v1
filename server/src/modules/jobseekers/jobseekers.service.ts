import { Types } from 'mongoose';
import type { PipelineStage } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { MATCH_READY_STAGES } from '../../constants/stages.js';
import type { CreateJobseekerInput, ListQuery } from './jobseekers.schemas.js';

export type ListParams = Partial<ListQuery>;

const MR_ORDINAL: Record<string, number> = {
  Applied: 10, Screened: 30, Evaluated: 55, MatchReady: 75, Shortlisted: 85, Offer: 92, Joined: 100, DroppedOff: 0,
};
export function matchReadinessPct(stage: string): number { return MR_ORDINAL[stage] ?? 0; }

// Single source of truth for stage -> offerStatus, shared by the JS helper below and the
// aggregation's `_offerStatus` $switch (built from these same entries) so the two can't drift.
const STAGE_TO_OFFER: Record<string, string> = {
  Shortlisted: 'Shortlisted', Offer: 'Offer sent', Joined: 'Joined', DroppedOff: 'Rejected',
};
export function offerStatus(stage: string): string { return STAGE_TO_OFFER[stage] ?? 'None'; }
export function evaluationLabel(s: string): string {
  return s === 'completed' ? 'Completed' : s === 'pending' ? 'In progress'
    : s === 'failed' ? 'Failed' : 'Not started';
}
export function codeFor(id: unknown): string { return `C-${String(id).slice(-6).toUpperCase()}`; }

export interface JobseekerListItem {
  id: string; code: string; name: string; email: string;
  instituteId: string; instituteName: string; stream: string;
  evaluationLabel: string; matchReadinessPct: number; offerStatus: string;
  dupRisk: 'High' | 'Low'; consent: string; stage: string;
}

function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Jobseeker not found', 'not_found');
}

const OFFER_TO_STAGE: Record<string, string[]> = {
  Shortlisted: ['Shortlisted'], 'Offer sent': ['Offer'], Joined: ['Joined'], Rejected: ['DroppedOff'],
  None: ['Applied', 'Screened', 'Evaluated', 'MatchReady'],
};
const BUCKET_TO_STAGE: Record<string, string[]> = {
  high: [...MATCH_READY_STAGES], mid: ['Screened', 'Evaluated'], low: ['Applied', 'DroppedOff'],
};

export async function listJobseekers(params: ListParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const match: Record<string, unknown> = {};
  if (params.q) match.name = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (params.instituteId?.length) {
    const ids = params.instituteId.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (ids.length) match.instituteId = { $in: ids };
  }
  if (params.stream?.length) match.branch = { $in: params.stream };
  if (params.evaluationStatus?.length) match.evaluationStatus = { $in: params.evaluationStatus };
  if (params.consent?.length) match.consent = { $in: params.consent };
  const stageSets: string[][] = [];
  if (params.offer?.length) stageSets.push(params.offer.flatMap((o) => OFFER_TO_STAGE[o] ?? []));
  if (params.matchBucket?.length) stageSets.push(params.matchBucket.flatMap((b) => BUCKET_TO_STAGE[b] ?? []));
  if (stageSets.length === 1) match.stage = { $in: stageSets[0] };
  else if (stageSets.length > 1) {
    // intersection of the two stage sets
    const inter = stageSets[0].filter((s) => stageSets[1].includes(s));
    match.stage = { $in: inter };
  }

  // duplicate-email set (emails appearing more than once, non-empty)
  const dupAgg = await Jobseeker.aggregate<{ _id: string }>([
    { $match: { email: { $ne: '' } } },
    { $group: { _id: { $toLower: '$email' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  const dupEmails = new Set(dupAgg.map((d) => d._id));
  const dupEmailsArr = [...dupEmails];

  const sortField = params.sort === 'institute' ? 'inst.name'
    : params.sort === 'stream' ? 'branch'
    : params.sort === 'matchReady' ? '_mr'
    : params.sort === 'offerStatus' ? '_offerStatus'
    : params.sort === 'dupRisk' ? '_dup'
    : params.sort === 'evaluationStatus' ? 'evaluationStatus'
    : params.sort === 'consent' ? 'consent'
    : 'name';
  const sortDir = (params.order ?? 'asc') === 'desc' ? -1 : 1;

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $addFields: {
      _mr: { $switch: {
        branches: Object.entries(MR_ORDINAL).map(([stage, v]) => ({ case: { $eq: ['$stage', stage] }, then: v })),
        default: 0,
      } },
      _offerStatus: { $switch: {
        branches: Object.entries(STAGE_TO_OFFER).map(([stage, v]) => ({ case: { $eq: ['$stage', stage] }, then: v })),
        default: 'None',
      } },
      _dup: { $in: [{ $toLower: { $ifNull: ['$email', ''] } }, dupEmailsArr] },
    } },
  ];
  if (params.dupRisk) pipeline.push({ $match: { _dup: params.dupRisk === 'High' } });
  pipeline.push(
    { $lookup: { from: 'institutes', localField: 'instituteId', foreignField: '_id', as: 'inst' } },
    { $unwind: { path: '$inst', preserveNullAndEmptyArrays: true } },
    { $sort: { [sortField]: sortDir, _id: 1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
  );

  const facet = await Jobseeker.aggregate(pipeline).collation({ locale: 'en', strength: 2 });
  const rows = facet[0]?.items ?? [];
  const total = facet[0]?.total?.[0]?.n ?? 0;
  const items: JobseekerListItem[] = rows.map((d: Record<string, any>) => ({
    id: String(d._id), code: codeFor(d._id), name: d.name, email: d.email ?? '',
    instituteId: String(d.instituteId), instituteName: d.inst?.name ?? '—', stream: d.branch,
    evaluationLabel: evaluationLabel(d.evaluationStatus), matchReadinessPct: matchReadinessPct(d.stage),
    offerStatus: offerStatus(d.stage),
    dupRisk: d.email && dupEmails.has(String(d.email).toLowerCase()) ? 'High' : 'Low',
    consent: d.consent ?? 'Granted', stage: d.stage,
  }));
  return { items, total, page, limit };
}

export async function addJobseeker(input: CreateJobseekerInput) {
  return Jobseeker.create({
    ...input, instituteId: new Types.ObjectId(input.instituteId),
    stage: input.stage ?? 'Applied', evaluationStatus: input.evaluationStatus ?? 'na',
    consent: input.consent ?? 'Granted', source: input.source ?? 'Manual',
  });
}
export async function getJobseeker(id: string) {
  assertId(id);
  const j = await Jobseeker.findById(id);
  if (!j) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  return j;
}
export async function updateJobseeker(id: string, patch: Partial<CreateJobseekerInput>) {
  assertId(id);
  const doc: Record<string, unknown> = { ...patch };
  if (patch.instituteId) doc.instituteId = new Types.ObjectId(patch.instituteId);
  const j = await Jobseeker.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!j) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  return j;
}
export async function blockJobseekers(ids: string[]) {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id));
  const res = await Jobseeker.updateMany({ _id: { $in: valid } }, { $set: { consent: 'Revoked' } });
  return { affected: res.modifiedCount };
}
export async function unblockJobseekers(ids: string[]) {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id));
  const res = await Jobseeker.updateMany({ _id: { $in: valid } }, { $set: { consent: 'Granted' } });
  return { affected: res.modifiedCount };
}
