import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Employer } from '../../models/Employer.js';
import { Slot } from '../../models/Slot.js';
import { SlotBooking } from '../../models/SlotBooking.js';
import { Drive } from '../../models/Drive.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import { Interview } from '../../models/Interview.js';
import { Application } from '../../models/Application.js';
import { notificationsSummary } from './employerNotifications.service.js';
import { poolSeekers } from './employerCandidates.service.js';
import type { RegistrationInput, SlotInput, SlotPatch } from './employerPortal.schemas.js';

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
  const regRows = await RegistrationRequest.find({ employerId: empObjId }).sort({ createdAt: -1 }).limit(5).lean();
  const registrations = regRows.map((r) => ({ id: String(r._id), driveName: r.driveName ?? '', role: r.role, status: r.status }));
  // derived: count of live (not cancelled) interviews still to happen, not a slot count
  const upcomingInterviews = await Interview.countDocuments({ employerId, status: { $in: ['Scheduled', 'Confirmed'] } });
  const { unreadCount, recent } = await notificationsSummary(employerId);

  // --- V1 dashboard rebuild (Task 1): funnel-adjacent KPIs + activeDrives +
  // pendingActions + calendarEvents. Derived-only, no PII. The funnel itself
  // is NOT derived here — the client gets it from the reports endpoint.
  const allRegs = await RegistrationRequest.find({ employerId: empObjId }).sort({ createdAt: -1 }).lean();
  const activeRegistrations = allRegs.length;
  const regDriveIds = [...new Set(allRegs.map((r) => String(r.driveId)).filter(Boolean))];
  const regDrives = await Drive.find({ _id: { $in: regDriveIds } }).lean();
  const driveById = new Map(regDrives.map((d) => [String(d._id), d as unknown as Record<string, any>]));

  // calendarEvents: one entry per registered-drive event date, deduped by date+driveName.
  const calEventSeen = new Set<string>();
  const calendarEvents: { date: string; driveName: string; status: string }[] = [];
  for (const r of allRegs) {
    const drive = driveById.get(String(r.driveId));
    if (!drive) continue;
    for (const ed of (drive.eventDates ?? []) as Date[]) {
      const iso = new Date(ed).toISOString();
      const key = `${iso}|${drive.name}`;
      if (calEventSeen.has(key)) continue;
      calEventSeen.add(key);
      calendarEvents.push({ date: iso, driveName: (drive.name as string) ?? '', status: r.status as string });
    }
  }
  const upcomingMatchDays = new Set(
    calendarEvents.filter((e) => new Date(e.date) >= now).map((e) => e.date),
  ).size;

  // sharedCount / pool-emptiness are only meaningful (and only cheap enough) to
  // compute for Approved drives — cache per drive so activeDrives + pendingActions
  // never call poolSeekers twice for the same drive.
  const poolCountCache = new Map<string, number>();
  async function poolCountFor(drive: Record<string, any>): Promise<number> {
    const key = String(drive._id);
    if (!poolCountCache.has(key)) poolCountCache.set(key, (await poolSeekers(drive as never)).length);
    return poolCountCache.get(key)!;
  }

  // activeDrives: one entry per driveId — an employer can have more than one
  // registration row for the same drive (e.g. a Rejected reg then a re-Approved
  // one), so dedupe by keeping the highest-priority registration's status.
  function regStatusPriority(status: string): number {
    switch (status) {
      case 'Approved': return 0;
      case 'Pending review': return 1;
      case 'Changes requested': return 2;
      case 'Rejected': return 4;
      default: return 3; // unknown status: below Approved, above Rejected
    }
  }
  const bestRegByDrive = new Map<string, (typeof allRegs)[number]>();
  for (const r of allRegs) {
    const driveIdStr = String(r.driveId ?? '');
    if (!driveIdStr) continue;
    const existing = bestRegByDrive.get(driveIdStr);
    if (!existing || regStatusPriority(r.status as string) < regStatusPriority(existing.status as string)) {
      bestRegByDrive.set(driveIdStr, r);
    }
  }
  // Approved regs first, then others; capped at 6.
  const sortedRegs = [...bestRegByDrive.values()].sort((a, b) => (a.status === 'Approved' ? 0 : 1) - (b.status === 'Approved' ? 0 : 1));
  const dashboardActiveDrives: { id: string; name: string; status: string; primaryEventDate: string | null; sharedCount: number }[] = [];
  for (const r of sortedRegs) {
    if (dashboardActiveDrives.length >= 6) break;
    const drive = driveById.get(String(r.driveId));
    if (!drive) continue;
    const futureDates = ((drive.eventDates ?? []) as Date[])
      .map((d) => new Date(d)).filter((d) => d >= now).sort((a, b) => +a - +b);
    const sharedCount = r.status === 'Approved' ? await poolCountFor(drive) : 0;
    dashboardActiveDrives.push({
      id: String(r.driveId), name: (drive.name as string) ?? '', status: r.status as string,
      primaryEventDate: futureDates[0] ? futureDates[0].toISOString() : null, sharedCount,
    });
  }

  // pendingActions: cheap real rules, stable ids. Sorted by urgency (most
  // urgent first) before capping at 6, so an urgent 'today' action on an
  // older drive is never dropped in favor of a less-urgent one on a newer drive.
  const pendingActions: { id: string; text: string; kind: 'register' | 'slot' | 'shortlist'; urgency: 'today' | 'soon' | 'over' }[] = [];
  for (const r of allRegs) {
    const driveIdStr = String(r.driveId ?? '');
    const name = r.driveName ?? '';
    if (r.status === 'Pending review') {
      pendingActions.push({ id: `register:${driveIdStr}`, text: `Registration under review — ${name}`, kind: 'register', urgency: 'soon' });
      continue;
    }
    if (r.status === 'Approved' && driveIdStr) {
      const slotCount = await Slot.countDocuments({ employerId: empObjId, driveId: r.driveId });
      if (slotCount === 0) {
        pendingActions.push({ id: `slot:${driveIdStr}`, text: `Book a Wednesday slot — ${name}`, kind: 'slot', urgency: 'today' });
        continue;
      }
      const drive = driveById.get(driveIdStr);
      if (drive && (await poolCountFor(drive)) > 0) {
        const decidedCount = await Application.countDocuments({ employerId: empObjId, driveId: r.driveId, decision: { $ne: null } });
        if (decidedCount === 0) {
          pendingActions.push({ id: `shortlist:${driveIdStr}`, text: `Shortlist jobseekers — ${name}`, kind: 'shortlist', urgency: 'soon' });
        }
      }
    }
  }
  const urgencyRank: Record<'over' | 'today' | 'soon', number> = { over: 0, today: 1, soon: 2 };
  pendingActions.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]); // stable: preserves relative order within a rank
  pendingActions.splice(6); // cap AFTER sorting so the most urgent survive

  return {
    profile: {
      id: String(emp._id), name: emp.name, email: emp.email ?? '', industry: emp.industry,
      size: emp.size ?? '', status: emp.status ?? 'Active', spoc: emp.spoc ?? '', website: emp.website ?? '',
    },
    dashboard: {
      kpis: { activeDrives, upcomingInterviews, totalSlots, activeRegistrations, upcomingMatchDays },
      calendar,
      registrations,
      shortlist: [] as unknown[],       // placeholder — filled by Slice 6
      notifications: recent,
      notificationsUnread: unreadCount,
      activeDrives: dashboardActiveDrives,
      pendingActions,
      calendarEvents,
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

// --- Registration tracker (Slice 3) ---------------------------------------
export async function listEmployerRegistrations(employerId: string) {
  const rows = await RegistrationRequest.find({ employerId }).sort({ createdAt: -1 }).lean();
  return { items: rows.map((r) => ({ id: String(r._id), driveId: String(r.driveId ?? ''), driveName: r.driveName ?? '', role: r.role, openings: r.openings ?? 0, status: r.status, submittedAt: new Date(r.createdAt).toISOString(), latestActivity: r.activity?.[0]?.action ?? '' })) };
}

export async function getEmployerRegistration(employerId: string, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Registration not found', 'not_found');
  const r = await RegistrationRequest.findById(id).lean();
  if (!r || String(r.employerId) !== String(employerId)) throw new HttpError(404, 'Registration not found', 'not_found');
  return { id: String(r._id), driveName: r.driveName, role: r.role, openings: r.openings, ctcRange: r.ctcRange, skills: r.skills, slot: r.slot, jd: r.jd, status: r.status, submittedAt: new Date(r.createdAt).toISOString(), activity: (r.activity ?? []).map((a) => ({ action: a.action, by: a.by, at: new Date(a.at).toISOString() })), details: r.details ?? {} };
}

// --- Employer slot management (Slice 4) -----------------------------------
// Reuses the Slot model verbatim; employerId is server-set (never from the body).
// booked is DERIVED from SlotBooking (0 until the candidate-booking slice) and
// never stored on the slot.
export interface EmployerSlotItem {
  id: string; date: string; start: string; end: string;
  capacity: number; booked: number; status: string; link: string;
}

export async function hasApprovedRegistration(employerId: string, driveId: string): Promise<boolean> {
  return !!(await RegistrationRequest.findOne({ employerId, driveId, status: 'Approved' }));
}
function sameUTCDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}
async function derivedBooked(slotId: Types.ObjectId): Promise<number> {
  return SlotBooking.countDocuments({ slotId });
}
function slotProjection(s: Record<string, any>, booked: number): EmployerSlotItem {
  return { id: String(s._id), date: new Date(s.date).toISOString(), start: s.start, end: s.end,
    capacity: s.capacity ?? 0, booked, status: s.status, link: s.link ?? '' };
}
function stubLink(slotId: unknown): string { return `https://meet.hiringhood.test/${String(slotId)}`; }

export async function listEmployerSlots(employerId: string, driveId: string) {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive to manage slots', 'registration_not_approved');
  const rows = await Slot.find({ driveId, employerId }).sort({ date: 1, start: 1 }).lean();
  const bk = await SlotBooking.aggregate([
    { $match: { slotId: { $in: rows.map((r) => r._id) } } },
    { $group: { _id: '$slotId', n: { $sum: 1 } } },
  ]);
  const counts = new Map<string, number>(bk.map((r: Record<string, any>) => [String(r._id), r.n]));
  return { items: rows.map((s) => slotProjection(s, counts.get(String(s._id)) ?? 0)) };
}

export async function createEmployerSlot(employerId: string, driveId: string, input: SlotInput) {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  const emp = await Employer.findById(employerId);
  if (!emp) throw new HttpError(404, 'Employer not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive to manage slots', 'registration_not_approved');
  const drive = await Drive.findById(driveId);
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  const allowed = ((drive.eventDates ?? []) as unknown as Date[]).map((d) => new Date(d));
  if (!allowed.some((d) => sameUTCDay(d, input.date)))
    throw new HttpError(400, 'That date is not in the drive schedule', 'date_not_in_schedule');
  if (input.end <= input.start) throw new HttpError(400, 'End time must be after start time', 'validation');
  const clash = await Slot.findOne({ employerId, driveId, date: input.date, start: input.start, status: { $ne: 'Cancelled' } });
  if (clash) throw new HttpError(400, 'You already have a slot at that date and time', 'slot_exists');
  if (drive.slotCap > 0) {
    const own = await Slot.countDocuments({ employerId, driveId, status: { $ne: 'Cancelled' } });
    if (own >= drive.slotCap) throw new HttpError(400, 'You have reached the slot cap for this drive', 'slot_cap_reached');
  }
  const slot = await Slot.create({
    driveId: new Types.ObjectId(driveId), employerId: new Types.ObjectId(employerId),
    date: input.date, start: input.start, end: input.end, capacity: input.capacity,
    link: input.linkMode === 'own' ? (input.link ?? '') : '', status: 'Scheduled',
  });
  if (input.linkMode === 'auto') { slot.link = stubLink(slot._id); await slot.save(); }
  return slotProjection(slot.toObject(), 0);
}

export async function updateEmployerSlot(employerId: string, driveId: string, slotId: string, patch: SlotPatch) {
  if (!Types.ObjectId.isValid(driveId) || !Types.ObjectId.isValid(slotId))
    throw new HttpError(404, 'Slot not found', 'not_found');
  const slot = await Slot.findOne({ _id: slotId, employerId, driveId });
  if (!slot) throw new HttpError(404, 'Slot not found', 'not_found'); // cross-employer isolation, no oracle
  if (slot.status === 'Cancelled') throw new HttpError(400, 'This slot has been cancelled', 'slot_cancelled');
  const drive = await Drive.findById(driveId);
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  const nextDate = patch.date ?? new Date(slot.date);
  const nextStart = patch.start ?? slot.start;
  const nextEnd = patch.end ?? slot.end;
  const allowed = ((drive.eventDates ?? []) as unknown as Date[]).map((d) => new Date(d));
  if (!allowed.some((d) => sameUTCDay(d, nextDate)))
    throw new HttpError(400, 'That date is not in the drive schedule', 'date_not_in_schedule');
  if (nextEnd <= nextStart) throw new HttpError(400, 'End time must be after start time', 'validation');
  if (patch.capacity !== undefined) {
    const seats = await SlotBooking.countDocuments({ slotId: slot._id });
    if (patch.capacity < seats) throw new HttpError(400, 'Capacity cannot be lower than existing bookings', 'validation');
  }
  if (patch.date !== undefined) slot.date = patch.date;
  if (patch.start !== undefined) slot.start = patch.start;
  if (patch.end !== undefined) slot.end = patch.end;
  if (patch.capacity !== undefined) slot.capacity = patch.capacity;
  if (patch.linkMode === 'own') slot.link = patch.link ?? '';
  else if (patch.linkMode === 'auto') slot.link = stubLink(slot._id);
  await slot.save();
  return slotProjection(slot.toObject(), await derivedBooked(slot._id));
}

export async function deleteEmployerSlot(employerId: string, driveId: string, slotId: string) {
  if (!Types.ObjectId.isValid(driveId) || !Types.ObjectId.isValid(slotId))
    throw new HttpError(404, 'Slot not found', 'not_found');
  const slot = await Slot.findOne({ _id: slotId, employerId, driveId });
  if (!slot) throw new HttpError(404, 'Slot not found', 'not_found');
  const bookings = await SlotBooking.countDocuments({ slotId: slot._id });
  if (bookings > 0) throw new HttpError(400, 'This slot has candidate bookings and cannot be removed', 'slot_has_bookings');
  const interviews = await Interview.countDocuments({ slotId: slot._id, status: { $ne: 'Cancelled' } });
  if (interviews > 0) throw new HttpError(400, 'This slot has scheduled interviews', 'slot_has_interviews');
  await slot.deleteOne();
  return { ok: true as const };
}
