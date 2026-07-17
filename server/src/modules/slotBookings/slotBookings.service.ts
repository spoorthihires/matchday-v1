import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Slot } from '../../models/Slot.js';
import { Drive } from '../../models/Drive.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { SlotBooking } from '../../models/SlotBooking.js';
import { isEligible } from '../seekerPortal/seekerPortal.service.js';

export const MATCH_READY_STAGES = new Set(['MatchReady', 'Shortlisted', 'Offer', 'Joined']);

export interface RosterEntry {
  bookingId: string; jobseekerId: string; name: string;
  institute: string; branch: string; stage: string; status: 'Booked' | 'Held';
}
export interface CandidateOption {
  id: string; name: string; institute: string; branch: string; stage: string;
}

function assertId(id: string, what: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, `${what} not found`, 'not_found');
}
async function resolveSlot(slotId: string) {
  assertId(slotId, 'Slot');
  const s = await Slot.findById(slotId);
  if (!s) throw new HttpError(404, 'Slot not found', 'not_found');
  return s;
}

export async function createBooking(slotId: string, jobseekerId: string, status: 'Booked' | 'Held') {
  const s = await resolveSlot(slotId);
  assertId(jobseekerId, 'Candidate');
  const js = await Jobseeker.findById(jobseekerId);
  if (!js) throw new HttpError(404, 'Candidate not found', 'not_found');
  if (!MATCH_READY_STAGES.has(js.stage)) {
    throw new HttpError(400, 'Candidate is not Match-Ready', 'not_match_ready');
  }
  const drive = await Drive.findById(s.driveId).lean();
  if (!isEligible(drive?.eligibility as never, { branch: js.branch, gradYear: js.gradYear, source: js.source })) {
    throw new HttpError(400, 'Candidate is not eligible for this drive', 'not_eligible');
  }
  if (await SlotBooking.findOne({ slotId: s._id, jobseekerId: js._id })) {
    throw new HttpError(400, 'Candidate already booked in this slot', 'already_booked');
  }
  const seats = await SlotBooking.countDocuments({ slotId: s._id }); // booked + held both consume a seat
  if (seats >= (s.capacity ?? 0)) throw new HttpError(400, 'Slot is at capacity', 'slot_full');
  let created;
  try {
    created = await SlotBooking.create({ slotId: s._id, jobseekerId: js._id, status });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new HttpError(400, 'Candidate already booked in this slot', 'already_booked');
    }
    throw err;
  }
  return { id: String(created._id), slotId: String(s._id), jobseekerId: String(js._id), status: created.status };
}

export async function confirmBooking(slotId: string, bookingId: string) {
  await resolveSlot(slotId);
  assertId(bookingId, 'Booking');
  const b = await SlotBooking.findOne({ _id: bookingId, slotId });
  if (!b) throw new HttpError(404, 'Booking not found', 'not_found');
  if (b.status !== 'Booked') { b.status = 'Booked'; await b.save(); }
  return { id: String(b._id), status: 'Booked' as const };
}

export async function releaseBooking(slotId: string, bookingId: string) {
  await resolveSlot(slotId);
  assertId(bookingId, 'Booking');
  const b = await SlotBooking.findOne({ _id: bookingId, slotId });
  if (!b) throw new HttpError(404, 'Booking not found', 'not_found');
  await b.deleteOne();
  return { deleted: true as const };
}

export async function getSlotRoster(slotId: string): Promise<{ booked: RosterEntry[]; held: RosterEntry[] }> {
  await resolveSlot(slotId);
  const rows = await SlotBooking.aggregate([
    { $match: { slotId: new Types.ObjectId(slotId) } },
    { $lookup: { from: 'jobseekers', localField: 'jobseekerId', foreignField: '_id', as: 'js' } },
    { $unwind: '$js' },
    { $lookup: { from: 'institutes', localField: 'js.instituteId', foreignField: '_id', as: 'inst' } },
    { $unwind: { path: '$inst', preserveNullAndEmptyArrays: true } },
    { $sort: { 'js.name': 1 } },
  ]);
  const entry = (r: Record<string, any>): RosterEntry => ({
    bookingId: String(r._id), jobseekerId: String(r.jobseekerId), name: r.js.name,
    institute: r.inst?.name ?? '—', branch: r.js.branch, stage: r.js.stage, status: r.status,
  });
  return {
    booked: rows.filter((r) => r.status === 'Booked').map(entry),
    held: rows.filter((r) => r.status === 'Held').map(entry),
  };
}

export async function listEligibleCandidates(slotId: string, q?: string): Promise<{ items: CandidateOption[] }> {
  const s = await resolveSlot(slotId);
  const drive = await Drive.findById(s.driveId).lean();
  const taken = new Set(
    (await SlotBooking.find({ slotId: s._id }).select('jobseekerId').lean()).map((b) => String(b.jobseekerId)),
  );
  const term = (q ?? '').trim().toLowerCase();
  const candidates = await Jobseeker.find({ stage: { $in: [...MATCH_READY_STAGES] } })
    .populate<{ instituteId: { name?: string } }>('instituteId', 'name')
    .lean();
  const items: CandidateOption[] = [];
  for (const c of candidates) {
    if (taken.has(String(c._id))) continue;
    if (!isEligible(drive?.eligibility as never, { branch: c.branch, gradYear: c.gradYear, source: c.source })) continue;
    if (term && !c.name.toLowerCase().includes(term)) continue;
    items.push({
      id: String(c._id), name: c.name,
      institute: (c.instituteId as { name?: string } | null)?.name ?? '—',
      branch: c.branch, stage: c.stage,
    });
    if (items.length >= 50) break;
  }
  return { items };
}
