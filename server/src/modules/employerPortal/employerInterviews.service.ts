import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Slot } from '../../models/Slot.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Application } from '../../models/Application.js';
import { Interview } from '../../models/Interview.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { requirePoolMember } from './employerCandidates.service.js';
import { codeFor } from '../jobseekers/jobseekers.service.js';
import type { ScheduleInterviewPayload, InterviewActionPayload } from './employerInterviews.schemas.js';

interface SlotShape { _id: Types.ObjectId; driveId: Types.ObjectId; employerId?: Types.ObjectId | null; date: Date; start: string; end: string; status: string; link?: string }
interface SeekerName { name: string; email?: string }
interface InterviewLean { _id: Types.ObjectId; jobseekerId: Types.ObjectId; slotId: Types.ObjectId; time: string; status: string; interviewers?: string[] }

async function gate(employerId: string, driveId: string): Promise<void> {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
}

function projectWith(iv: InterviewLean, seeker: SeekerName | null | undefined, slot: SlotShape | null | undefined) {
  return {
    id: String(iv._id), jobseekerId: String(iv.jobseekerId), code: codeFor(iv.jobseekerId),
    name: seeker?.name ?? '—', email: seeker?.email ?? '',
    time: iv.time, status: iv.status, interviewers: iv.interviewers ?? [],
    slot: slot ? { id: String(slot._id), date: new Date(slot.date).toISOString(), start: slot.start, end: slot.end, link: slot.link ?? '' } : null,
  };
}

async function projectOne(iv: InterviewLean) {
  const [seeker, slot] = await Promise.all([
    Jobseeker.findById(iv.jobseekerId).select('name email').lean<SeekerName>(),
    Slot.findById(iv.slotId).select('date start end link').lean<SlotShape>(),
  ]);
  return projectWith(iv, seeker, slot);
}

// Shared by schedule + reschedule. Validates the slot belongs to this employer+drive,
// is not cancelled, the time is inside the window, and no other live interview holds it.
async function validateSlot(employerId: string, driveId: string, slotId: string, time: string, excludeIvId: Types.ObjectId | null): Promise<SlotShape> {
  if (!Types.ObjectId.isValid(slotId)) throw new HttpError(400, 'That slot is not available', 'slot_invalid');
  const slot = await Slot.findById(slotId).lean<SlotShape>();
  if (!slot || String(slot.driveId) !== String(driveId) || String(slot.employerId) !== String(employerId) || slot.status === 'Cancelled')
    throw new HttpError(400, 'That slot is not available', 'slot_invalid');
  if (!(slot.start <= time && time < slot.end))
    throw new HttpError(400, 'The time is outside the slot window', 'time_out_of_window');
  const clashFilter: Record<string, unknown> = { slotId, time, status: { $ne: 'Cancelled' } };
  if (excludeIvId) clashFilter._id = { $ne: excludeIvId };
  if (await Interview.findOne(clashFilter))
    throw new HttpError(400, 'Another interview already holds that time in this slot', 'slot_time_taken');
  return slot;
}

export async function listInterviews(employerId: string, driveId: string) {
  await gate(employerId, driveId);
  const ivs = await Interview.find({ employerId, driveId }).lean<InterviewLean[]>();
  const slots = await Slot.find({ _id: { $in: ivs.map((i) => i.slotId) } }).select('date start end link driveId employerId status').lean<SlotShape[]>();
  const seekers = await Jobseeker.find({ _id: { $in: ivs.map((i) => i.jobseekerId) } }).select('name email').lean<(SeekerName & { _id: Types.ObjectId })[]>();
  const slotMap = new Map(slots.map((s) => [String(s._id), s]));
  const seekerMap = new Map(seekers.map((s) => [String(s._id), s]));
  const items = ivs.map((iv) => projectWith(iv, seekerMap.get(String(iv.jobseekerId)), slotMap.get(String(iv.slotId))));
  items.sort((a, b) => (a.slot?.date ?? '').localeCompare(b.slot?.date ?? '') || a.time.localeCompare(b.time));
  return { items };
}

export async function scheduleInterview(employerId: string, driveId: string, input: ScheduleInterviewPayload) {
  await gate(employerId, driveId);
  await requirePoolMember(employerId, driveId, input.jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId: input.jobseekerId }).lean();
  if ((app?.consent as { status?: string } | undefined)?.status !== 'granted')
    throw new HttpError(400, 'The candidate must consent to reveal their identity before an interview can be scheduled', 'consent_required');
  const slot = await validateSlot(employerId, driveId, input.slotId, input.time, null);
  if (await Interview.findOne({ employerId, driveId, jobseekerId: input.jobseekerId }))
    throw new HttpError(400, 'This candidate already has an interview for this drive', 'already_scheduled');
  const created = await Interview.create({ employerId, driveId, jobseekerId: input.jobseekerId, slotId: slot._id, time: input.time, interviewers: input.interviewers ?? [] });
  return projectOne(created.toObject() as unknown as InterviewLean);
}

export async function interviewAction(employerId: string, driveId: string, interviewId: string, payload: InterviewActionPayload) {
  await gate(employerId, driveId);
  if (!Types.ObjectId.isValid(interviewId)) throw new HttpError(404, 'Interview not found', 'not_found');
  const iv = await Interview.findOne({ _id: interviewId, employerId, driveId });
  if (!iv) throw new HttpError(404, 'Interview not found', 'not_found');
  switch (payload.action) {
    case 'confirm': iv.status = 'Confirmed'; break;
    case 'complete': iv.status = 'Completed'; break;
    case 'cancel': iv.status = 'Cancelled'; break;
    case 'reschedule': {
      const slot = await validateSlot(employerId, driveId, payload.slotId, payload.time, iv._id);
      iv.slotId = slot._id; iv.time = payload.time; iv.status = 'Scheduled'; break;
    }
    case 'set-interviewers': iv.interviewers = payload.interviewers; break;
  }
  await iv.save();
  return projectOne(iv.toObject() as unknown as InterviewLean);
}
