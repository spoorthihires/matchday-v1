import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Stream, type StreamDoc } from '../../models/Stream.js';
import { Drive } from '../../models/Drive.js';
import { ALL_FLOW, type CreateStreamInput, type UpdateStreamInput } from './streams.schemas.js';

const ACTOR = 'Platform Admin';

export interface StreamItem {
  id: string; code: string; name: string; parent: string; label: string;
  skills: string[]; good: string[]; flow: string[]; cutoff: number; cgpa: number; backlogs: number;
  grad: string[]; branches: string[]; sources: string[]; status: string; drives: number;
  version: string; versions: { v: string; date: string; by: string; note: string }[];
  createdAt: string; updatedAt: string;
}

export function bumpVersion(v: string): string {
  const parts = v.split('.').map(Number);
  parts[1] = (parts[1] || 0) + 1;
  return parts.join('.');
}
export function codeFor(id: unknown): string { return `STR-${String(id).slice(-3).toUpperCase()}`; }
export function orderedFlow(flow: string[]): string[] { return ALL_FLOW.filter((f) => flow.includes(f)); }
function assertId(id: string) { if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Stream not found', 'not_found'); }

function toItem(d: StreamDoc & { _id: unknown }): StreamItem {
  return {
    id: String(d._id), code: codeFor(d._id), name: d.name, parent: d.parent ?? 'Engineering', label: d.label ?? '',
    skills: d.skills ?? [], good: d.good ?? [], flow: d.flow ?? [], cutoff: d.cutoff ?? 0, cgpa: d.cgpa ?? 0, backlogs: d.backlogs ?? 0,
    grad: d.grad ?? [], branches: d.branches ?? [], sources: d.sources ?? [], status: d.status ?? 'Active',
    drives: 0,
    version: d.version ?? '1.0',
    versions: (d.versions ?? []).map((v) => ({ v: v.v, date: new Date(v.date).toISOString(), by: v.by, note: v.note ?? '' })),
    createdAt: new Date(d.createdAt as Date).toISOString(), updatedAt: new Date(d.updatedAt as Date).toISOString(),
  };
}

export async function listStreams(params: { q?: string; parent?: string; status?: string; sort?: string; order?: string }) {
  const match: Record<string, unknown> = {};
  if (params.parent) match.parent = params.parent;
  if (params.status) match.status = params.status;
  if (params.q && params.q.trim()) {
    const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { parent: rx }, { label: rx }, { skills: rx }];
  }
  const key = (params.sort === 'parent' || params.sort === 'cutoff') ? params.sort : 'name';
  const dir = params.order === 'desc' ? -1 : 1;
  const rows = await Stream.find(match).collation({ locale: 'en', strength: 2 }).sort({ [key]: dir }).lean();
  const items = rows.map((r) => toItem(r as never));
  const usedAgg = await Drive.aggregate([
    { $match: { streamId: { $ne: null } } },
    { $group: { _id: '$streamId', n: { $sum: 1 } } },
  ]);
  const usedBy = new Map<string, number>(usedAgg.map((r) => [String(r._id), r.n as number]));
  for (const it of items) it.drives = usedBy.get(it.id) ?? 0;
  return { items };
}

export async function createStream(input: CreateStreamInput) {
  const now = new Date();
  return Stream.create({
    ...input, flow: orderedFlow(input.flow), version: '1.0',
    versions: [{ v: '1.0', date: now, by: ACTOR, note: 'Initial stream' }], createdAt: now, updatedAt: now,
  });
}
export async function getStream(id: string) {
  assertId(id);
  const s = await Stream.findById(id);
  if (!s) throw new HttpError(404, 'Stream not found', 'not_found');
  return s;
}
export async function updateStream(id: string, patch: UpdateStreamInput) {
  const s = await getStream(id);
  const configKeys = Object.keys(patch).filter((k) => k !== 'status');
  if (patch.flow !== undefined) patch = { ...patch, flow: orderedFlow(patch.flow) as UpdateStreamInput['flow'] };
  Object.assign(s, patch);
  if (configKeys.length > 0) {
    const nv = bumpVersion(s.version ?? '1.0');
    s.version = nv;
    s.versions.unshift({ v: nv, date: new Date(), by: ACTOR, note: 'Edited stream configuration' });
  }
  s.updatedAt = new Date();
  await s.save();
  return s;
}
export async function restoreStream(id: string, v: string) {
  const s = await getStream(id);
  if (!(s.versions ?? []).some((e) => e.v === v)) throw new HttpError(400, `Unknown version ${v}`, 'validation');
  const nv = bumpVersion(s.version ?? '1.0');
  s.version = nv;
  s.versions.unshift({ v: nv, date: new Date(), by: ACTOR, note: `Restored v${v}` });
  s.updatedAt = new Date();
  await s.save();
  return s;
}
