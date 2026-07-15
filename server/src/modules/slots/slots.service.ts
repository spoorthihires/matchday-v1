import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Slot } from '../../models/Slot.js';
import { Drive } from '../../models/Drive.js';
import type { CreateSlotInput, UpdateSlotInput } from './slots.schemas.js';

export interface SlotItem {
  id: string; driveId: string; driveName: string;
  employerId: string | null; employerName: string;
  date: string; start: string; end: string;
  capacity: number; booked: number; held: number;
  status: string; link: string; attended: number; noShow: number;
}

function assertId(id: string, what = 'Slot') {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, `${what} not found`, 'not_found');
}
function normEmployer(v: string | null | undefined): Types.ObjectId | null {
  return v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null;
}

export async function listSlots(params: { from?: Date; to?: Date; employerId?: string }) {
  const match: Record<string, unknown> = {};
  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) range.$gte = params.from;
    if (params.to) { const end = new Date(params.to); end.setUTCHours(23, 59, 59, 999); range.$lte = end; }
    match.date = range;
  }
  if (params.employerId && Types.ObjectId.isValid(params.employerId)) match.employerId = new Types.ObjectId(params.employerId);
  const rows = await Slot.aggregate([
    { $match: match },
    { $lookup: { from: 'employers', localField: 'employerId', foreignField: '_id', as: 'emp' } },
    { $unwind: { path: '$emp', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'drives', localField: 'driveId', foreignField: '_id', as: 'drv' } },
    { $unwind: { path: '$drv', preserveNullAndEmptyArrays: true } },
    { $sort: { date: 1, start: 1 } },
  ]);
  const items: SlotItem[] = rows.map((r: Record<string, any>) => ({
    id: String(r._id), driveId: String(r.driveId), driveName: r.drv?.name ?? '—',
    employerId: r.employerId ? String(r.employerId) : null,
    employerName: r.emp?.name ?? '(Unallocated)',
    date: new Date(r.date).toISOString(), start: r.start, end: r.end,
    capacity: r.capacity ?? 0, booked: r.booked ?? 0, held: r.held ?? 0,
    status: r.status, link: r.link ?? '', attended: r.attended ?? 0, noShow: r.noShow ?? 0,
  }));
  return { items };
}

async function resolveDrive(driveId: string) {
  assertId(driveId, 'Drive');
  const d = await Drive.findById(driveId);
  if (!d) throw new HttpError(404, 'Drive not found', 'not_found');
  return d;
}

export async function createSlot(input: CreateSlotInput) {
  await resolveDrive(input.driveId);
  return Slot.create({ ...input, employerId: normEmployer(input.employerId), driveId: new Types.ObjectId(input.driveId) });
}
export async function getSlot(id: string) {
  assertId(id);
  const s = await Slot.findById(id);
  if (!s) throw new HttpError(404, 'Slot not found', 'not_found');
  return s;
}
export async function updateSlot(id: string, patch: UpdateSlotInput) {
  const s = await getSlot(id);
  if (patch.driveId !== undefined) { await resolveDrive(patch.driveId); s.driveId = new Types.ObjectId(patch.driveId); }
  if (patch.employerId !== undefined) s.employerId = normEmployer(patch.employerId);
  const { driveId: _d, employerId: _e, ...rest } = patch;
  Object.assign(s, rest);
  if (s.booked + s.held > s.capacity) throw new HttpError(400, 'booked + held must not exceed capacity', 'validation');
  if (s.attended > s.booked) throw new HttpError(400, 'attended must not exceed booked', 'validation');
  await s.save();
  return s;
}
export async function deleteSlot(id: string) {
  const s = await getSlot(id);
  await s.deleteOne();
  return { deleted: true };
}
