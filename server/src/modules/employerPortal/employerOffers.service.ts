import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Application } from '../../models/Application.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { requirePoolMember, candidateScore } from './employerCandidates.service.js';
import { codeFor } from '../jobseekers/jobseekers.service.js';
import type { UpsertOfferPayload } from './employerOffers.schemas.js';

const MODES = ['On-site', 'Hybrid', 'Remote'];
interface SeekerLean { _id: Types.ObjectId; cgpa: number; evaluationStatus: string; stage: string }
interface OfferLean { status: string; response: string; ctc: number; location: string; mode: string; joinDate?: Date | null; declineReason: string }
export interface OfferRow {
  jobseekerId: string; code: string; matchScore: number; revealed: { name: string; email: string };
  status: string; response: string; ctc: number; location: string; mode: string; joinDate: string | null; declineReason: string;
}

// NOTE (tracked in .superpowers/sdd/progress.md): duplicates the same
// gate-check pattern (drive validity → approved registration → drive
// existence) that already exists ~6x across employerPortal services
// (e.g. `gateAndDrive` in employerBoard.service.ts, the inline checks in
// employerCandidates.service.ts). Flagged for a future shared-helper
// extraction rather than fixed here, to keep this task's diff scoped to the
// offer feature. `upsertOffer` below relies on `requirePoolMember` (which
// already gates + checks pool membership) rather than this helper directly.
async function gate(employerId: string, driveId: string): Promise<void> {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
}

export function offerRow(seeker: SeekerLean, ident: { name?: string; email?: string } | null, offer: OfferLean): OfferRow {
  const { matchScore } = candidateScore(seeker.cgpa, seeker.evaluationStatus, seeker.stage);
  return {
    jobseekerId: String(seeker._id), code: codeFor(seeker._id), matchScore,
    revealed: { name: ident?.name ?? '—', email: ident?.email ?? '' },
    status: offer.status, response: offer.response, ctc: offer.ctc, location: offer.location, mode: offer.mode,
    joinDate: offer.joinDate ? new Date(offer.joinDate).toISOString() : null, declineReason: offer.declineReason,
  };
}

export async function upsertOffer(employerId: string, driveId: string, jobseekerId: string, input: UpsertOfferPayload): Promise<OfferRow> {
  const { seeker } = await requirePoolMember(employerId, driveId, jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId });
  if (app?.consent?.status !== 'granted')
    throw new HttpError(400, 'The candidate must consent to reveal their identity before an offer can be made', 'offer_requires_consent');
  const existing = app.offer as OfferLean | undefined;
  let dCtc = 0; let dLoc = ''; let dMode = 'Hybrid';
  if (!existing) {
    const reg = await RegistrationRequest.findOne({ employerId, driveId, status: 'Approved' }).lean();
    const det = (reg?.details ?? {}) as { ctcMax?: number | null; cities?: string[]; workMode?: string; officeLocation?: string };
    dCtc = det.ctcMax ?? 0;
    dLoc = (Array.isArray(det.cities) && det.cities[0]) || det.officeLocation || '';
    dMode = MODES.includes(det.workMode ?? '') ? (det.workMode as string) : 'Hybrid';
  }
  const offer = {
    status: input.status,
    response: input.response ?? existing?.response ?? 'Pending',
    ctc: input.ctc ?? existing?.ctc ?? dCtc,
    location: input.location ?? existing?.location ?? dLoc,
    mode: input.mode ?? existing?.mode ?? dMode,
    // '' explicitly clears (per the schema's documented contract); undefined
    // (not provided) keeps the existing value.
    joinDate: input.joinDate !== undefined ? (input.joinDate ? new Date(input.joinDate) : null) : (existing?.joinDate ?? null),
    declineReason: input.declineReason ?? existing?.declineReason ?? '',
  };
  app.set('offer', offer);
  await app.save();
  const ident = await Jobseeker.findById(jobseekerId).select('name email').lean<{ name: string; email?: string }>();
  return offerRow(seeker as unknown as SeekerLean, ident, offer as OfferLean);
}

const OFFER_STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Joined'];

export async function listOffers(employerId: string, driveId: string) {
  await gate(employerId, driveId);
  const apps = await Application.find({ employerId, driveId, offer: { $exists: true } }).lean();
  const seekers = await Jobseeker.find({ _id: { $in: apps.map((a) => a.jobseekerId) } })
    .select('name email cgpa evaluationStatus stage').lean<(SeekerLean & { name: string; email?: string })[]>();
  const byId = new Map(seekers.map((s) => [String(s._id), s]));
  const items = apps
    .map((a) => {
      const s = byId.get(String(a.jobseekerId));
      if (!s) return null;
      return offerRow(s, { name: s.name, email: s.email }, a.offer as OfferLean);
    })
    .filter((r): r is OfferRow => r !== null)
    .sort((x, y) => y.matchScore - x.matchScore);
  const counts: Record<string, number> = Object.fromEntries(OFFER_STATUSES.map((st) => [st, 0]));
  for (const it of items) counts[it.status] = (counts[it.status] ?? 0) + 1;
  return { items, counts };
}
