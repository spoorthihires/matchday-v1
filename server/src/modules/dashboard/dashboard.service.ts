import { Types } from 'mongoose';
import { MATCH_READY_STAGES } from '../../constants/stages.js';
import { dashboardConfig, verdictFor } from '../../config/dashboard.config.js';
import { Drive } from '../../models/Drive.js';
import { Employer } from '../../models/Employer.js';
import { Institute } from '../../models/Institute.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Slot } from '../../models/Slot.js';
import { SlotBooking } from '../../models/SlotBooking.js';
import type { DashboardOverview, FunnelStep } from '../../types/dashboard.js';

const DAY = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function direction(delta: number): 'up' | 'down' | 'flat' {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

function fmtDelta(delta: number, suffix = ''): { value: number; direction: 'up' | 'down' | 'flat'; display: string } {
  const dir = direction(delta);
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return { value: delta, direction: dir, display: dir === 'flat' ? 'no change' : `${sign}${Math.abs(delta)}${suffix}` };
}

/** count of docs created in [start, end) */
async function countInWindow(model: { countDocuments: (q: object) => Promise<number> }, start: Date, end: Date, extra: object = {}) {
  return model.countDocuments({ ...extra, createdAt: { $gte: start, $lt: end } });
}

function nextWednesday(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0 Sun .. 3 Wed
  let add = (3 - day + 7) % 7;
  if (add === 0) add = 0; // if today is Wednesday, treat today as next matchday
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

export async function getOverview(now: Date = new Date()): Promise<DashboardOverview> {
  const win1Start = new Date(now.getTime() - 30 * DAY);
  const win2Start = new Date(now.getTime() - 60 * DAY);

  // ---- Supply / hiring funnel counts from Jobseeker (single source) ----
  const [
    jsAdded, profilesCompleted, evalCompleted, evalPending,
    matchReady, shortlisted, offers, joined, droppedOff,
  ] = await Promise.all([
    Jobseeker.countDocuments({}),
    Jobseeker.countDocuments({ profileCompleted: true }),
    Jobseeker.countDocuments({ evaluationStatus: 'completed' }),
    Jobseeker.countDocuments({ evaluationStatus: 'pending' }),
    Jobseeker.countDocuments({ stage: { $in: [...MATCH_READY_STAGES] } }),
    Jobseeker.countDocuments({ stage: { $in: ['Shortlisted', 'Offer', 'Joined'] } }),
    Jobseeker.countDocuments({ stage: { $in: ['Offer', 'Joined'] } }),
    Jobseeker.countDocuments({ stage: 'Joined' }),
    Jobseeker.countDocuments({ stage: 'DroppedOff' }),
  ]);

  // ---- Drives ----
  const activeDrives = await Drive.countDocuments({ status: 'Active' });
  const upcomingWedAgg = await Drive.aggregate<{ n: number }>([
    { $match: { status: 'Active' } },
    { $unwind: '$eventDates' },
    { $match: { eventDates: { $gte: now } } },
    { $addFields: {
      _dow: { $dayOfWeek: { date: '$eventDates', timezone: 'UTC' } },
      _day: { $dateToString: { date: '$eventDates', format: '%Y-%m-%d', timezone: 'UTC' } },
    } },
    { $match: { _dow: 4 } },            // $dayOfWeek: 1=Sun..7=Sat; 4 = Wednesday
    { $group: { _id: '$_day' } },
    { $count: 'n' },
  ]);
  const upcomingWed = upcomingWedAgg[0]?.n ?? 0;

  // ---- Employers / Institutes ----
  const [employerRegistrations, instituteParticipation] = await Promise.all([
    Employer.countDocuments({}),
    Institute.countDocuments({ status: 'Active' }),
  ]);

  // ---- Slots ----
  const capAgg = await Slot.aggregate<{ _id: null; capacity: number }>([
    { $group: { _id: null, capacity: { $sum: '$capacity' } } },
  ]);
  const booked = await SlotBooking.countDocuments({ status: 'Booked' });
  const held = await SlotBooking.countDocuments({ status: 'Held' });
  const totalSlots = capAgg[0]?.capacity ?? 0;
  const available = Math.max(0, totalSlots - booked - held);

  // ---- 30-day deltas (count metrics) ----
  const [jsAddedPrev, employersPrev, institutesPrev] = await Promise.all([
    countInWindow(Jobseeker, win2Start, win1Start),
    countInWindow(Employer, win2Start, win1Start),
    countInWindow(Institute, win2Start, win1Start, { status: 'Active' }),
  ]);
  const [jsAddedRecent, employersRecent, institutesRecent] = await Promise.all([
    countInWindow(Jobseeker, win1Start, now),
    countInWindow(Employer, win1Start, now),
    countInWindow(Institute, win1Start, now, { status: 'Active' }),
  ]);

  // ---- Leaderboards ----
  const instLb = await Jobseeker.aggregate([
    { $match: { stage: { $in: [...MATCH_READY_STAGES] } } },
    { $group: { _id: '$instituteId', ready: { $sum: 1 }, total: { $sum: 1 } } },
    { $lookup: { from: 'institutes', localField: '_id', foreignField: '_id', as: 'inst' } },
    { $unwind: '$inst' },
    { $match: { 'inst.status': 'Active' } }, // only participating institutes appear on the leaderboard
    { $sort: { ready: -1 } },
    { $limit: 5 },
  ]);
  // conversion per institute = ready / (all jobseekers at that institute)
  const perInstituteTotals = await Jobseeker.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $group: { _id: '$instituteId', n: { $sum: 1 } } },
  ]);
  const totalsMap = new Map(perInstituteTotals.map((x) => [String(x._id), x.n]));
  const institutesBoard = instLb.map((row, i) => ({
    rank: i + 1,
    name: row.inst.name as string,
    city: row.inst.city as string,
    ready: row.ready as number,
    conversionPct: pct(row.ready as number, totalsMap.get(String(row._id)) ?? row.ready),
  }));

  const empDocs = await Employer.find({ status: 'Active' }).sort({ offersExtended: -1 }).limit(5).lean();
  const employersBoard = empDocs.map((e, i) => ({
    rank: i + 1,
    name: e.name as string,
    industry: e.industry as string,
    offers: (e.offersExtended as number) ?? 0,
    fillRatePct: Math.round((e.slotsFillRate as number) ?? 0),
  }));

  // ---- Funnels ----
  const supply: FunnelStep[] = [
    { name: 'Jobseekers Added', value: jsAdded, pct: null },
    { name: 'Profiles Completed', value: profilesCompleted, pct: pct(profilesCompleted, jsAdded) },
    { name: 'Evaluations Completed', value: evalCompleted, pct: pct(evalCompleted, profilesCompleted) },
    { name: 'Match-Ready', value: matchReady, pct: pct(matchReady, evalCompleted) },
  ];
  const slotsOpened = totalSlots;
  const demand: FunnelStep[] = [
    { name: 'Employers Registered', value: employerRegistrations, pct: null },
    { name: 'Active Drives Created', value: activeDrives, pct: pct(activeDrives, employerRegistrations) },
    { name: 'Slots Opened', value: slotsOpened, pct: null },
    { name: 'Slots Booked', value: booked, pct: pct(booked, slotsOpened) },
  ];
  const hiring: FunnelStep[] = [
    { name: 'Match-Ready', value: matchReady, pct: null },
    { name: 'Shortlisted', value: shortlisted, pct: pct(shortlisted, matchReady) },
    { name: 'Offers Sent', value: offers, pct: pct(offers, shortlisted) },
    { name: 'Joined', value: joined, pct: pct(joined, offers) },
  ];

  // ---- Readiness pillars ----
  const supplyPct = Math.min(100, pct(matchReady, dashboardConfig.supplyTarget));
  const demandPct = Math.min(100, pct(employerRegistrations, dashboardConfig.demandTarget));
  const slotsPct = pct(booked, totalSlots);
  const evalPct = pct(evalCompleted, evalCompleted + evalPending);
  const { weights } = dashboardConfig;
  const score = Math.round(
    weights.supply * supplyPct + weights.demand * demandPct +
    weights.slots * slotsPct + weights.evaluations * evalPct,
  );
  const pillars = [
    { key: 'supply' as const, pct: supplyPct, caption: `${matchReady} match-ready` },
    { key: 'demand' as const, pct: demandPct, caption: `${employerRegistrations} employers live` },
    { key: 'slots' as const, pct: slotsPct, caption: `${booked} of ${totalSlots} booked` },
    { key: 'evaluations' as const, pct: evalPct, caption: `${evalPending} pending` },
  ];
  const attention = evalPending > 0 ? { message: `${evalPending} evaluations pending — clear these to lift readiness.` } : null;

  // ---- Schedule ----
  const nextMd = nextWednesday(now);
  const eventDrives = await Drive.aggregate([
    { $match: { status: 'Active' } },
    { $addFields: {
      _upcoming: { $filter: { input: '$eventDates', as: 'd', cond: { $gte: ['$$d', new Date(now.getTime() - DAY)] } } },
    } },
    { $addFields: { nearest: { $min: '$_upcoming' } } },
    { $match: { nearest: { $ne: null } } },
    { $sort: { nearest: 1 } },
    { $limit: 3 },
  ]);
  const events = await Promise.all(eventDrives.map(async (d: Record<string, unknown>) => {
    const nearest = new Date(d.nearest as Date);
    const capOnly = await Slot.aggregate<{ _id: null; cap: number }>([
      { $match: { driveId: d._id } },
      { $group: { _id: null, cap: { $sum: '$capacity' } } },
    ]);
    const driveCap = capOnly[0]?.cap ?? 0;
    const driveSlotIds = await Slot.find({ driveId: d._id }).distinct('_id');
    const driveBooked = await SlotBooking.countDocuments({ slotId: { $in: driveSlotIds }, status: 'Booked' });
    const candCount = await Jobseeker.countDocuments({});
    const sameUtcDay =
      nearest.getUTCFullYear() === nextMd.getUTCFullYear() &&
      nearest.getUTCMonth() === nextMd.getUTCMonth() &&
      nearest.getUTCDate() === nextMd.getUTCDate();
    return {
      date: nearest.toISOString(),
      title: `MatchDay · ${d.name}`,
      employers: (d.empCap as number) ?? 0,
      slots: driveCap,
      candidates: candCount,
      prepPct: pct(driveBooked, driveCap),
      status: (sameUtcDay ? 'prep' : 'open') as 'prep' | 'open',
    };
  }));

  // calendar grid for the month of nextMd
  const year = nextMd.getUTCFullYear();
  const month = nextMd.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startDow = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayNum = now.getUTCMonth() === month && now.getUTCFullYear() === year ? now.getUTCDate() : -1;
  const calendar: DashboardOverview['schedule']['calendar'] = [];
  for (let i = 0; i < startDow; i++) calendar.push({ day: 0, inMonth: false, isWed: false, isToday: false, isNextMatchDay: false });
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
    calendar.push({
      day, inMonth: true, isWed: dow === 3, isToday: day === todayNum,
      isNextMatchDay: day === nextMd.getUTCDate(),
    });
  }

  // ---- KPIs ----
  const dropOffRate = jsAdded > 0 ? Math.round((droppedOff / jsAdded) * 1000) / 10 : 0;
  const kpis: DashboardOverview['kpis'] = [
    { key: 'activeDrives', label: 'Active Drives', group: 'Demand', value: activeDrives, display: String(activeDrives), delta: fmtDelta(0) },
    { key: 'upcomingWednesdays', label: 'Upcoming Wednesdays', group: 'Schedule', value: upcomingWed, display: String(upcomingWed), delta: { value: 0, direction: 'flat', display: 'scheduled' } },
    { key: 'employerRegistrations', label: 'Employer Registrations', group: 'Demand', value: employerRegistrations, display: String(employerRegistrations), delta: fmtDelta(employersRecent - employersPrev) },
    { key: 'instituteParticipation', label: 'Institute Participation', group: 'Supply', value: instituteParticipation, display: String(instituteParticipation), delta: fmtDelta(institutesRecent - institutesPrev) },
    { key: 'jobseekersAdded', label: 'Jobseekers Added', group: 'Supply', value: jsAdded, display: jsAdded.toLocaleString('en-US'), delta: fmtDelta(jsAddedRecent - jsAddedPrev) },
    { key: 'profilesCompleted', label: 'Profiles Completed', group: 'Supply', value: profilesCompleted, display: `${profilesCompleted.toLocaleString('en-US')} / ${jsAdded.toLocaleString('en-US')}`, delta: fmtDelta(pct(profilesCompleted, jsAdded), '%') },
    { key: 'evaluationsCompleted', label: 'Evaluations Completed', group: 'Supply', value: evalCompleted, display: String(evalCompleted), delta: fmtDelta(0) },
    { key: 'matchReady', label: 'Match-Ready Candidates', group: 'Supply', value: matchReady, display: String(matchReady), delta: fmtDelta(0) },
    { key: 'slotsBooked', label: 'Slots Booked', group: 'Slots', value: booked, display: `${booked} / ${totalSlots}`, delta: fmtDelta(pct(booked, totalSlots), '%') },
    { key: 'slotsAvailable', label: 'Slots Available', group: 'Slots', value: available, display: String(available), delta: fmtDelta(0) },
    { key: 'shortlisted', label: 'Shortlisted', group: 'Outcomes', value: shortlisted, display: String(shortlisted), delta: fmtDelta(0) },
    { key: 'offersSent', label: 'Offers Sent', group: 'Outcomes', value: offers, display: String(offers), delta: fmtDelta(0) },
    { key: 'joined', label: 'Joined Candidates', group: 'Outcomes', value: joined, display: String(joined), delta: fmtDelta(0) },
    { key: 'dropOffRate', label: 'Drop-off Rate', group: 'Outcomes', value: dropOffRate, display: `${dropOffRate}%`, delta: fmtDelta(0) },
  ];

  const daysToMd = Math.max(0, Math.ceil((nextMd.getTime() - now.getTime()) / DAY));

  return {
    readiness: {
      score,
      verdict: verdictFor(score),
      nextMatchDay: nextMd.toISOString(),
      countdown: { days: daysToMd, hours: 0 },
      pillars,
      attention,
    },
    kpis,
    funnels: { supply, demand, hiring },
    schedule: { monthLabel: `${MONTH_NAMES[month]} ${year}`, calendar, events },
    slotUtilization: { booked, held, available, total: totalSlots, utilizedPct: pct(booked, totalSlots) },
    leaderboards: { institutes: institutesBoard, employers: employersBoard },
  };
}
