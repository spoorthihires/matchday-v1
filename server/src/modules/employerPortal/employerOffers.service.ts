import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Application } from '../../models/Application.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
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
