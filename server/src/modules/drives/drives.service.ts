import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import type { DriveInput, ListQuery } from './drives.schemas.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type ListParams = Partial<ListQuery>;
export interface DriveListItem {
  id: string; name: string; domain: string; stream: string;
  month: string; frequency: string; eventDay: string;
  candCap: number; empCap: number; slotCap: number;
  status: string; createdBy: string; primaryEventDate: string | null;
}

function monthLabel(d: Date | null): string {
  if (!d) return '—';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function assertObjectId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Drive not found', 'not_found');
}

function normTemplateId(v: unknown): Types.ObjectId | null {
  return typeof v === 'string' && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null;
}

export async function createDrive(input: DriveInput, createdBy: string) {
  return Drive.create({ ...input, templateId: normTemplateId((input as { templateId?: unknown }).templateId), createdBy });
}

export async function getDrive(id: string) {
  assertObjectId(id);
  const d = await Drive.findById(id);
  if (!d) throw new HttpError(404, 'Drive not found', 'not_found');
  return d;
}

export async function updateDrive(id: string, patch: Partial<DriveInput> & { status?: string }) {
  assertObjectId(id);
  const p: Record<string, unknown> = { ...patch };
  if ('templateId' in p) p.templateId = normTemplateId(p.templateId);
  const d = await Drive.findByIdAndUpdate(id, p, { new: true, runValidators: true });
  if (!d) throw new HttpError(404, 'Drive not found', 'not_found');
  return d;
}

export async function cloneDrive(id: string) {
  const src = await getDrive(id);
  const obj = src.toObject();
  delete (obj as Record<string, unknown>)._id;
  delete (obj as Record<string, unknown>).createdAt;
  delete (obj as Record<string, unknown>).updatedAt;
  return Drive.create({ ...obj, name: `${src.name} (copy)`, status: 'Draft' });
}

export async function bulkAction(ids: string[], action: 'publish' | 'clone' | 'archive') {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id));
  if (action === 'clone') {
    let n = 0;
    for (const id of valid) { await cloneDrive(id); n++; }
    return { affected: n };
  }
  const status = action === 'publish' ? 'Published' : 'Archived';
  const res = await Drive.updateMany({ _id: { $in: valid } }, { $set: { status } });
  return { affected: res.modifiedCount };
}

export async function listDrives(params: ListParams, now: Date = new Date()) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 8;
  const match: Record<string, unknown> = {};
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { domain: rx }, { stream: rx }];
  }
  if (params.status) match.status = params.status;
  if (params.stream) match.stream = params.stream;
  if (params.domain) match.domain = params.domain;
  if (params.month) {
    const [y, m] = params.month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    match.eventDates = { $elemMatch: { $gte: start, $lt: end } };
  }

  const sortField = params.sort === 'month' ? 'primaryEventDate'
    : params.sort ?? 'createdAt';
  const sortDir = (params.order ?? (params.sort ? 'asc' : 'desc')) === 'asc' ? 1 : -1;

  const facet = await Drive.aggregate([
    { $match: match },
    { $addFields: {
      _upcoming: { $filter: { input: '$eventDates', as: 'd', cond: { $gte: ['$$d', now] } } },
    } },
    { $addFields: {
      primaryEventDate: { $ifNull: [{ $min: '$_upcoming' }, { $min: '$eventDates' }] },
    } },
    { $sort: { [sortField]: sortDir, _id: 1 } },
    { $facet: {
      items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      total: [{ $count: 'n' }],
    } },
  ]);

  const rows = facet[0]?.items ?? [];
  const total = facet[0]?.total?.[0]?.n ?? 0;
  const items: DriveListItem[] = rows.map((d: Record<string, unknown>) => {
    const primary = (d.primaryEventDate as Date | null) ?? null;
    return {
      id: String(d._id), name: d.name as string, domain: d.domain as string, stream: d.stream as string,
      month: monthLabel(primary), frequency: d.frequency as string, eventDay: d.eventDay as string,
      candCap: (d.candCap as number) ?? 0, empCap: (d.empCap as number) ?? 0, slotCap: (d.slotCap as number) ?? 0,
      status: d.status as string, createdBy: (d.createdBy as string) ?? '—',
      primaryEventDate: primary ? new Date(primary).toISOString() : null,
    };
  });
  return { items, total, page, limit };
}
