import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Employer } from '../../models/Employer.js';
import { Slot } from '../../models/Slot.js';
import { Drive } from '../../models/Drive.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import type { RegistrationInput } from './employerPortal.schemas.js';

export async function getEmployerPortal(employerId: string) {
  if (!Types.ObjectId.isValid(employerId)) throw new HttpError(404, 'Employer not found', 'not_found');
  const emp = await Employer.findById(employerId).lean();
  if (!emp) throw new HttpError(404, 'Employer not found', 'not_found');
  const empObjId = new Types.ObjectId(employerId);
  // derived: distinct drives this employer participates in (via their booked slots)
  const driveAgg = await Slot.aggregate([
    { $match: { employerId: empObjId } },
    { $group: { _id: null, drives: { $addToSet: '$driveId' }, slots: { $sum: 1 } } },
  ]);
  const activeDrives = driveAgg[0]?.drives?.length ?? 0;
  const totalSlots = driveAgg[0]?.slots ?? 0;
  // upcoming interview slots (future), grouped for a calendar widget
  const now = new Date();
  const upcoming = await Slot.find({ employerId: empObjId, date: { $gte: now } }).sort({ date: 1 }).limit(20).lean();
  const calendar = upcoming.map((s) => ({ id: String(s._id), date: new Date(s.date).toISOString(), start: s.start, end: s.end, driveId: String(s.driveId) }));
  return {
    profile: {
      id: String(emp._id), name: emp.name, email: emp.email ?? '', industry: emp.industry,
      size: emp.size ?? '', status: emp.status ?? 'Active', spoc: emp.spoc ?? '', website: emp.website ?? '',
    },
    dashboard: {
      kpis: { activeDrives, upcomingInterviews: calendar.length, totalSlots },
      calendar,
      registrations: [] as unknown[],   // placeholder — filled by Slice 3
      shortlist: [] as unknown[],       // placeholder — filled by Slice 6
    },
  };
}

// --- Drive marketplace + detail (Slice 2) ---------------------------------
// Self-contained: does NOT couple to the admin drives.service — mirrors only
// the small month/primaryEventDate derivation this module needs.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function driveProjection(d: Record<string, any>, now: Date) {
  const dates = (d.eventDates ?? []).map((x: Date) => new Date(x));
  const upcoming = dates.filter((x: Date) => x >= now).sort((a: Date, b: Date) => +a - +b);
  const primary = upcoming[0] ?? dates.slice().sort((a: Date, b: Date) => +a - +b)[0] ?? null;
  const employerReg = d.visibility?.employerReg ?? 'Invite-only';
  return {
    id: String(d._id), name: d.name, domain: d.domain, stream: d.stream,
    month: primary ? `${MONTHS[primary.getUTCMonth()]} ${primary.getUTCFullYear()}` : '—',
    primaryEventDate: primary ? primary.toISOString() : null,
    eventDates: dates.map((x: Date) => x.toISOString()),
    candCap: d.candCap ?? 0, empCap: d.empCap ?? 0, slotCap: d.slotCap ?? 0,
    frequency: d.frequency, eventDay: d.eventDay, status: d.status,
    employerReg, canRegister: employerReg !== 'Closed',
  };
}

export async function listEmployerDrives(params: { q?: string; domain?: string }, now: Date = new Date()) {
  const match: Record<string, unknown> = { status: { $in: ['Active', 'Published'] } };
  if (params.domain) match.domain = params.domain;
  if (params.q && params.q.trim()) {
    const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { domain: rx }, { stream: rx }];
  }
  const rows = await Drive.find(match).sort({ createdAt: -1 }).lean();
  return { items: rows.map((d) => driveProjection(d as never, now)) };
}

export async function getEmployerDrive(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Drive not found', 'not_found');
  const d = await Drive.findById(id).lean();
  if (!d || !['Active', 'Published'].includes(d.status as string)) throw new HttpError(404, 'Drive not found', 'not_found');
  const base = driveProjection(d as never, new Date());
  return {
    ...base,
    eligibility: {
      sources: d.eligibility?.sources ?? [], branches: d.eligibility?.branches ?? [],
      gradYears: d.eligibility?.gradYears ?? [], expType: d.eligibility?.expType ?? '',
    },
    evaluation: ((d.evaluation ?? []) as unknown as Record<string, unknown>[]).map((e) => ({ key: e.key, enabled: !!e.enabled, config: e.config ?? {} })),
    streamId: d.streamId ? String(d.streamId) : null,
  };
}

// --- Registration create (Slice 3) ----------------------------------------
// Server-authoritative identity: company/industry/submittedBy/employerId are
// derived from the authenticated Employer profile — never from the client
// body — so a spoofed `company` in the request is always ignored.
export async function createEmployerRegistration(employerId: string, input: RegistrationInput) {
  const emp = await Employer.findById(employerId);
  if (!emp) throw new HttpError(404, 'Employer not found', 'not_found');
  if (!Types.ObjectId.isValid(input.driveId)) throw new HttpError(400, 'Invalid drive', 'validation');
  const drive = await Drive.findById(input.driveId);
  if (!drive || !['Active', 'Published'].includes(drive.status) || drive.visibility?.employerReg === 'Closed') {
    throw new HttpError(400, 'This drive is not open for registration', 'not_registerable');
  }
  const dup = await RegistrationRequest.findOne({ employerId: emp._id, driveId: drive._id, status: { $in: ['Pending review', 'Approved', 'Changes requested'] } });
  if (dup) throw new HttpError(400, 'You already have an active registration for this drive', 'already_registered');
  const submittedBy = emp.spoc || emp.name;
  const reg = await RegistrationRequest.create({
    company: emp.name, industry: emp.industry, submittedBy, employerId: emp._id,
    driveId: drive._id, driveName: drive.name, role: input.role, openings: input.openings ?? 1,
    ctcRange: input.ctcMin != null && input.ctcMax != null ? `${input.ctcMin}–${input.ctcMax} LPA` : '',
    skills: input.mustHave ?? [], slot: [input.preferredWednesday, input.timeSlot].filter(Boolean).join(' · '),
    jd: input.jd ?? '', status: 'Pending review',
    activity: [{ action: 'Submitted', by: submittedBy, at: new Date() }],
    details: input.details ?? {},
  });
  return { id: String(reg._id), status: reg.status, driveName: reg.driveName, role: reg.role };
}
