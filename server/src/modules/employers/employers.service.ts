import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Employer } from '../../models/Employer.js';
import { AuditLog } from '../../models/AuditLog.js';
import type { CreateEmployerInput, ListQuery } from './employers.schemas.js';

export type ListParams = Partial<ListQuery>;
export interface EmployerListItem {
  id: string; name: string; industry: string; size: string; spoc: string; email: string; status: string;
  activeDrives: number; candidatesViewed: number; shortlistRate: number; offerRate: number; respHours: number;
}

function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Employer not found', 'not_found');
}
async function writeAudit(entityId: Types.ObjectId, action: string, actor: string, detail: string) {
  await AuditLog.create({ entityType: 'employer', entityId, action, actor, detail });
}

const SORT_KEY: Record<string, keyof EmployerListItem> = {
  name: 'name', industry: 'industry', drives: 'activeDrives', viewed: 'candidatesViewed',
  shortlist: 'shortlistRate', offer: 'offerRate', respHours: 'respHours',
};

export async function listEmployers(params: ListParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 8;
  const match: Record<string, unknown> = {};
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { industry: rx }];
  }
  if (params.industry) match.industry = params.industry;
  if (params.status) match.status = params.status;
  const docs = await Employer.find(match).lean();
  let items: EmployerListItem[] = docs.map((d) => ({
    id: String(d._id), name: d.name as string, industry: d.industry as string,
    size: (d.size as string) ?? '51–200', spoc: (d.spoc as string) ?? '', email: (d.email as string) ?? '',
    status: d.status as string,
    activeDrives: (d.activeDrives as number) ?? 0, candidatesViewed: (d.candidatesViewed as number) ?? 0,
    shortlistRate: (d.shortlistRate as number) ?? 0, offerRate: (d.offerRate as number) ?? 0,
    respHours: (d.respHours as number) ?? 0,
  }));
  const key = params.sort ? SORT_KEY[params.sort] : null;
  const dir = (params.order ?? 'asc') === 'desc' ? -1 : 1;
  items.sort((a, b) => {
    if (key) {
      const av = a[key]; const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') { if (av !== bv) return (av - bv) * dir; }
      else { const cmp = String(av).localeCompare(String(bv)); if (cmp !== 0) return cmp * dir; }
    }
    return a.name.localeCompare(b.name);
  });
  const total = items.length;
  items = items.slice((page - 1) * limit, (page - 1) * limit + limit);
  return { items, total, page, limit };
}

export async function createEmployer(input: CreateEmployerInput, actor: string) {
  const e = await Employer.create(input);
  await writeAudit(e._id, 'created', actor, `Created ${e.name}`);
  return e;
}
export async function getEmployer(id: string) {
  assertId(id);
  const e = await Employer.findById(id);
  if (!e) throw new HttpError(404, 'Employer not found', 'not_found');
  return e;
}
export async function updateEmployer(id: string, patch: Partial<CreateEmployerInput>, actor: string) {
  assertId(id);
  const e = await Employer.findById(id);
  if (!e) throw new HttpError(404, 'Employer not found', 'not_found');
  const prevStatus = e.status;
  Object.assign(e, patch);
  await e.save();
  let action = 'edited';
  if (patch.status && patch.status !== prevStatus) {
    action = patch.status === 'Active' ? 'approved' : patch.status === 'Disabled' ? 'disabled' : 'status-changed';
  }
  await writeAudit(e._id, action, actor, `${action} ${e.name}`);
  return e;
}
export async function bulkEmployerAction(ids: string[], action: 'approve' | 'disable', actor: string) {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id));
  const status = action === 'approve' ? 'Active' : 'Disabled';
  const res = await Employer.updateMany({ _id: { $in: valid } }, { $set: { status } });
  const logAction = action === 'approve' ? 'approved' : 'disabled';
  await Promise.all(valid.map((id) => writeAudit(new Types.ObjectId(id), logAction, actor, `Bulk ${logAction}`)));
  return { affected: res.modifiedCount };
}
