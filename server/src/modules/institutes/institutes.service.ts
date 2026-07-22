import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Institute } from '../../models/Institute.js';
import { AuditLog } from '../../models/AuditLog.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Drive } from '../../models/Drive.js';
import { DriveAssignment } from '../../models/DriveAssignment.js';
import { MATCH_READY_STAGES } from '../../constants/stages.js';
import type { CreateInstituteInput, ListQuery } from './institutes.schemas.js';

export type ListParams = Partial<ListQuery>;
export interface Funnel {
  uploaded: number; signupPct: number; completionPct: number;
  matchReadyPct: number; shortlistPct: number; offerPct: number; joinedPct: number;
}
export interface InstituteListItem extends Funnel {
  id: string; name: string; city: string; type: string; status: string; owner: string; email: string;
}
export interface Overview { total: number; pending: number; uploaded: number; avgMatchReadyPct: number; }

const SHORTLIST = ['Shortlisted', 'Offer', 'Joined'];
const OFFER = ['Offer', 'Joined'];

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Institute not found', 'not_found');
}

/** raw per-institute jobseeker counts, keyed by institute id string */
async function funnelCounts(): Promise<Map<string, { uploaded: number; pastApplied: number; profiles: number; mr: number; sl: number; of: number; jn: number }>> {
  const agg = await Jobseeker.aggregate([
    { $group: {
      _id: '$instituteId',
      uploaded: { $sum: 1 },
      pastApplied: { $sum: { $cond: [{ $ne: ['$stage', 'Applied'] }, 1, 0] } },
      profiles: { $sum: { $cond: ['$profileCompleted', 1, 0] } },
      mr: { $sum: { $cond: [{ $in: ['$stage', [...MATCH_READY_STAGES]] }, 1, 0] } },
      sl: { $sum: { $cond: [{ $in: ['$stage', SHORTLIST] }, 1, 0] } },
      of: { $sum: { $cond: [{ $in: ['$stage', OFFER] }, 1, 0] } },
      jn: { $sum: { $cond: [{ $eq: ['$stage', 'Joined'] }, 1, 0] } },
    } },
  ]);
  return new Map(agg.map((f) => [String(f._id), f]));
}

function toFunnel(c?: { uploaded: number; pastApplied: number; profiles: number; mr: number; sl: number; of: number; jn: number }): Funnel {
  const u = c?.uploaded ?? 0;
  return {
    uploaded: u,
    signupPct: pct(c?.pastApplied ?? 0, u),
    completionPct: pct(c?.profiles ?? 0, u),
    matchReadyPct: pct(c?.mr ?? 0, u),
    shortlistPct: pct(c?.sl ?? 0, u),
    offerPct: pct(c?.of ?? 0, u),
    joinedPct: pct(c?.jn ?? 0, u),
  };
}

const SORT_KEY: Record<string, keyof InstituteListItem> = {
  name: 'name', type: 'type', uploaded: 'uploaded', signup: 'signupPct', completion: 'completionPct',
  matchReady: 'matchReadyPct', shortlist: 'shortlistPct', offer: 'offerPct', joined: 'joinedPct',
};

export async function listInstitutes(params: ListParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 8;
  const counts = await funnelCounts();

  // global overview over ALL institutes
  const allInst = await Institute.find({}).lean();
  const total = allInst.length;
  const pending = allInst.filter((i) => i.status === 'Pending').length;
  let uploadedAll = 0;
  for (const c of counts.values()) uploadedAll += c.uploaded;
  const activeMr = allInst.filter((i) => i.status === 'Active').map((i) => toFunnel(counts.get(String(i._id))).matchReadyPct);
  const avgMatchReadyPct = activeMr.length ? Math.round(activeMr.reduce((a, b) => a + b, 0) / activeMr.length) : 0;
  const overview: Overview = { total, pending, uploaded: uploadedAll, avgMatchReadyPct };

  // filtered list
  const match: Record<string, unknown> = {};
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { type: rx }, { city: rx }];
  }
  if (params.type?.length) match.type = { $in: params.type };
  if (params.status?.length) match.status = { $in: params.status };

  const filtered = await Institute.find(match).lean();
  let items: InstituteListItem[] = filtered.map((i) => ({
    id: String(i._id), name: i.name as string, city: i.city as string, type: i.type as string,
    status: i.status as string, owner: (i.owner as string) ?? '', email: (i.email as string) ?? '',
    ...toFunnel(counts.get(String(i._id))),
  }));

  // Funnel/rate columns are computed above (not stored fields), so range-filtering them happens
  // here in JS, in the same post-processing step as the sort below — reusing SORT_KEY as the
  // filter-field lookup too rather than a second parallel map.
  const RANGE_NAMES = ['uploaded', 'signup', 'completion', 'matchReady', 'shortlist', 'offer', 'joined'] as const;
  const rangeParams = params as unknown as Record<string, number | undefined>;
  for (const name of RANGE_NAMES) {
    const from = rangeParams[`${name}From`];
    const to = rangeParams[`${name}To`];
    if (from === undefined && to === undefined) continue;
    const field = SORT_KEY[name];
    items = items.filter((it) => {
      const v = it[field] as number;
      if (from !== undefined && v < from) return false;
      if (to !== undefined && v > to) return false;
      return true;
    });
  }

  const key = params.sort ? SORT_KEY[params.sort] : null;
  const dir = (params.order ?? (params.sort ? 'asc' : 'asc')) === 'desc' ? -1 : 1;
  items.sort((a, b) => {
    if (key) {
      const av = a[key]; const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') { if (av !== bv) return (av - bv) * dir; }
      else { const cmp = String(av).localeCompare(String(bv)); if (cmp !== 0) return cmp * dir; }
    }
    return a.name.localeCompare(b.name);
  });

  const totalFiltered = items.length;
  items = items.slice((page - 1) * limit, (page - 1) * limit + limit);
  return { items, total: totalFiltered, page, limit, overview };
}

export async function getInstitute(id: string) {
  assertId(id);
  const inst = await Institute.findById(id).lean();
  if (!inst) throw new HttpError(404, 'Institute not found', 'not_found');
  const counts = await funnelCounts();
  const funnel = toFunnel(counts.get(String(inst._id)));

  // performance vs platform average (active institutes)
  const all = await Institute.find({ status: 'Active' }).lean();
  const mrValues = all.map((i) => ({ id: String(i._id), mr: counts.get(String(i._id))?.mr ?? 0, mrPct: toFunnel(counts.get(String(i._id))).matchReadyPct }));
  const avgMrPct = mrValues.length ? Math.round(mrValues.reduce((a, b) => a + b.mrPct, 0) / mrValues.length) : 0;
  const ranked = [...mrValues].sort((a, b) => b.mr - a.mr);
  const rank = ranked.findIndex((r) => r.id === String(inst._id)) + 1;
  const performance = { matchReadyPct: funnel.matchReadyPct, joinedPct: funnel.joinedPct, avgMatchReadyPct: avgMrPct, rank: rank || null, ofActive: mrValues.length };

  const kpis = { uploaded: funnel.uploaded, matchReadyPct: funnel.matchReadyPct, shortlistPct: funnel.shortlistPct, joinedPct: funnel.joinedPct };
  const assignedDrives = await DriveAssignment.countDocuments({ instituteId: new Types.ObjectId(id) });
  return { institute: inst, funnel, kpis, performance, assignedDrives };
}

async function writeAudit(entityId: Types.ObjectId, action: string, actor: string, detail: string) {
  await AuditLog.create({ entityType: 'institute', entityId, action, actor, detail });
}

export async function createInstitute(input: CreateInstituteInput, actor: string) {
  const inst = await Institute.create({
    ...input,
    ownershipHistory: [{ owner: input.owner, email: input.email, changedAt: new Date(), changedBy: actor }],
  });
  await writeAudit(inst._id, 'created', actor, `Created ${inst.name}`);
  return inst;
}

export async function updateInstitute(id: string, patch: Partial<CreateInstituteInput>, actor: string) {
  assertId(id);
  const inst = await Institute.findById(id);
  if (!inst) throw new HttpError(404, 'Institute not found', 'not_found');
  const prevStatus = inst.status;
  const ownerChanged = (patch.owner !== undefined && patch.owner !== inst.owner) || (patch.email !== undefined && patch.email !== inst.email);
  Object.assign(inst, patch);
  if (ownerChanged) {
    inst.ownershipHistory.push({ owner: inst.owner, email: inst.email, changedAt: new Date(), changedBy: actor });
  }
  await inst.save();
  let action = 'edited';
  if (patch.status && patch.status !== prevStatus) {
    action = patch.status === 'Active' ? 'approved' : patch.status === 'Disabled' ? 'disabled' : 'status-changed';
  }
  await writeAudit(inst._id, action, actor, `${action} ${inst.name}`);
  return inst;
}

export async function bulkInstituteAction(ids: string[], action: 'approve' | 'disable', actor: string) {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id));
  const status = action === 'approve' ? 'Active' : 'Disabled';
  const res = await Institute.updateMany({ _id: { $in: valid } }, { $set: { status } });
  const logAction = action === 'approve' ? 'approved' : 'disabled';
  await Promise.all(valid.map((id) => writeAudit(new Types.ObjectId(id), logAction, actor, `Bulk ${logAction}`)));
  return { affected: res.modifiedCount };
}

export async function listCandidates(id: string, page: number, limit: number) {
  assertId(id);
  const filter = { instituteId: new Types.ObjectId(id) };
  const [docs, total] = await Promise.all([
    Jobseeker.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Jobseeker.countDocuments(filter),
  ]);
  const items = docs.map((d) => ({
    id: String(d._id), name: d.name as string, branch: d.branch as string, gradYear: d.gradYear as number,
    cgpa: d.cgpa as number, source: d.source as string, stage: d.stage as string, profileCompleted: !!d.profileCompleted,
  }));
  return { items, total, page, limit };
}

export async function listAudit(id: string, page: number, limit: number) {
  assertId(id);
  const filter = { entityType: 'institute', entityId: new Types.ObjectId(id) };
  const [docs, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  const items = docs.map((l) => ({ action: l.action as string, actor: l.actor as string, detail: (l.detail as string) ?? '', at: new Date(l.at as Date).toISOString() }));
  return { items, total, page, limit };
}

export interface AssignedDriveItem { id: string; name: string; domain: string; stream: string; status: string; month: string; }

const A_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function driveMonth(dates: unknown): string {
  const arr = Array.isArray(dates) ? (dates as Date[]) : [];
  if (!arr.length) return '—';
  const min = new Date(Math.min(...arr.map((d) => new Date(d).getTime())));
  return `${A_MONTHS[min.getUTCMonth()]} ${min.getUTCFullYear()}`;
}

async function requireInstitute(id: string) {
  assertId(id);
  const inst = await Institute.findById(id).select('_id').lean();
  if (!inst) throw new HttpError(404, 'Institute not found', 'not_found');
  return inst;
}

export async function listInstituteDrives(id: string) {
  await requireInstitute(id);
  const rows = await DriveAssignment.find({ instituteId: new Types.ObjectId(id) }).sort({ createdAt: -1 }).lean();
  const drives = await Drive.find({ _id: { $in: rows.map((r) => r.driveId) } }).lean();
  const byId = new Map(drives.map((d) => [String(d._id), d]));
  const items: AssignedDriveItem[] = rows.flatMap((r) => {
    const d = byId.get(String(r.driveId));
    if (!d) return [];   // drive was deleted — drop the orphaned assignment from the view
    return [{ id: String(d._id), name: (d.name as string) || '(untitled)', domain: (d.domain as string) ?? '', stream: (d.stream as string) ?? '', status: (d.status as string) ?? 'Draft', month: driveMonth(d.eventDates) }];
  });
  return { items };
}

async function upsertPair(instituteId: string, driveId: string) {
  await DriveAssignment.updateOne(
    { instituteId: new Types.ObjectId(instituteId), driveId: new Types.ObjectId(driveId) },
    { $setOnInsert: { instituteId: new Types.ObjectId(instituteId), driveId: new Types.ObjectId(driveId), createdAt: new Date() } },
    { upsert: true },
  );
}

export async function assignDrives(id: string, driveIds: string[]) {
  await requireInstitute(id);
  const valid = driveIds.filter((d) => Types.ObjectId.isValid(d));
  const resolvable = (await Drive.find({ _id: { $in: valid } }).select('_id').lean()).map((d) => String(d._id));
  for (const dId of resolvable) await upsertPair(id, dId);
  return listInstituteDrives(id);
}

export async function unassignDrive(id: string, driveId: string) {
  assertId(id);
  if (Types.ObjectId.isValid(driveId)) {
    await DriveAssignment.deleteOne({ instituteId: new Types.ObjectId(id), driveId: new Types.ObjectId(driveId) });
  }
  return { deleted: true as const };
}

export async function bulkAssignDrives(instituteIds: string[], driveIds: string[]) {
  const insts = (await Institute.find({ _id: { $in: instituteIds.filter((i) => Types.ObjectId.isValid(i)) } }).select('_id').lean()).map((i) => String(i._id));
  const drives = (await Drive.find({ _id: { $in: driveIds.filter((d) => Types.ObjectId.isValid(d)) } }).select('_id').lean()).map((d) => String(d._id));
  let assigned = 0;
  for (const iId of insts) for (const dId of drives) {
    const res = await DriveAssignment.updateOne(
      { instituteId: new Types.ObjectId(iId), driveId: new Types.ObjectId(dId) },
      { $setOnInsert: { instituteId: new Types.ObjectId(iId), driveId: new Types.ObjectId(dId), createdAt: new Date() } },
      { upsert: true },
    );
    if (res.upsertedCount) assigned += 1;
  }
  return { assigned };
}
