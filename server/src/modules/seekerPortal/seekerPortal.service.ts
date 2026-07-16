import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Employer } from '../../models/Employer.js';
import { Institute } from '../../models/Institute.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Slot } from '../../models/Slot.js';
import { codeFor, evaluationLabel, matchReadinessPct, offerStatus } from '../jobseekers/jobseekers.service.js';

// The positive pipeline shown to the seeker (DroppedOff is a separate terminal state).
export const JOURNEY_STAGES = ['Applied', 'Screened', 'Evaluated', 'MatchReady', 'Shortlisted', 'Offer', 'Joined'] as const;

const SELECTED_STAGES = new Set(['Shortlisted', 'Offer', 'Joined']);

export function statusTag(stage: string): 'Selected' | 'In progress' | 'Closed' {
  if (stage === 'DroppedOff') return 'Closed';
  if (SELECTED_STAGES.has(stage)) return 'Selected';
  return 'In progress';
}

interface EligibilityLike { branches?: string[]; gradYears?: number[]; sources?: string[] }

export function isEligible(
  eligibility: EligibilityLike | undefined,
  seeker: { branch: string; gradYear: number; source: string },
): boolean {
  const branches = eligibility?.branches ?? [];
  const gradYears = eligibility?.gradYears ?? [];
  const sources = eligibility?.sources ?? [];
  if (branches.length && !branches.includes(seeker.branch)) return false;
  if (gradYears.length && !gradYears.includes(seeker.gradYear)) return false;
  if (sources.length && !sources.includes(seeker.source)) return false;
  return true;
}

export interface PortalDrive {
  id: string; name: string; domain: string;
  employers: string[]; eventDates: string[];
  statusTag: 'Selected' | 'In progress' | 'Closed';
}

// Minimal explicit shape for the fields we read off a leaned Drive doc.
// Needed because mongoose's automatic schema-type inference misinfers
// `eventDates: [Date]` as a Subdocument array once a sibling field uses
// Schema.Types.Mixed inside an array-of-subdocuments (the `evaluation`
// stage config) — a library type-inference quirk, not a data-shape issue.
// Passing an explicit generic to `.lean<T>()` sidesteps it without `any`.
interface DriveLean {
  _id: Types.ObjectId;
  name?: string;
  domain?: string;
  eventDates?: Date[];
  eligibility?: EligibilityLike;
}

export async function getPortal(jobseekerId: string) {
  if (!Types.ObjectId.isValid(jobseekerId)) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  const seeker = await Jobseeker.findById(jobseekerId).lean();
  if (!seeker) throw new HttpError(404, 'Jobseeker not found', 'not_found');

  const inst = await Institute.findById(seeker.instituteId).select('name').lean();

  const drives = await Drive.find({ status: { $in: ['Active', 'Published'] } }).lean<DriveLean[]>();
  const eligible = drives.filter((d) => isEligible(d.eligibility, {
    branch: seeker.branch, gradYear: seeker.gradYear, source: seeker.source,
  }));
  const driveIds = eligible.map((d) => d._id);

  // employer name(s) per drive, via slots
  const slots = await Slot.find({ driveId: { $in: driveIds }, employerId: { $ne: null } })
    .select('driveId employerId').lean();
  const emps = await Employer.find({ _id: { $in: [...new Set(slots.map((s) => String(s.employerId)))] } })
    .select('name').lean();
  const empName = new Map(emps.map((e) => [String(e._id), e.name as string]));
  const byDrive = new Map<string, Set<string>>();
  for (const s of slots) {
    const name = empName.get(String(s.employerId));
    if (!name) continue;
    const key = String(s.driveId);
    if (!byDrive.has(key)) byDrive.set(key, new Set());
    byDrive.get(key)!.add(name);
  }

  const tag = statusTag(seeker.stage);
  const driveItems: PortalDrive[] = eligible.map((d) => ({
    id: String(d._id),
    name: d.name || 'Untitled drive',
    domain: d.domain || '',
    employers: [...(byDrive.get(String(d._id)) ?? [])],
    eventDates: (d.eventDates ?? []).map((dt) => new Date(dt).toISOString()),
    statusTag: tag,
  }));

  return {
    profile: {
      id: String(seeker._id),
      code: codeFor(seeker._id),
      name: seeker.name,
      email: seeker.email ?? '',
      institute: inst?.name ?? '—',
      branch: seeker.branch,
      gradYear: seeker.gradYear,
      cgpa: seeker.cgpa,
    },
    journey: {
      stage: seeker.stage,
      stages: [...JOURNEY_STAGES],
      matchReadinessPct: matchReadinessPct(seeker.stage),
      evaluationLabel: evaluationLabel(seeker.evaluationStatus),
      offerStatus: offerStatus(seeker.stage),
    },
    drives: driveItems,
  };
}
