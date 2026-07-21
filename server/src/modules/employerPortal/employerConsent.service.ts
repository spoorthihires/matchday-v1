import { HttpError } from '../../middleware/errorHandler.js';
import { Application } from '../../models/Application.js';
import { REVEAL_EXPIRY_HOURS, isExpired } from '../../constants/consent.js';
import { requirePoolMember, getPassport } from './employerCandidates.service.js';

function expiryFrom(now: Date): Date { return new Date(now.getTime() + REVEAL_EXPIRY_HOURS * 3600 * 1000); }

export async function requestReveal(employerId: string, driveId: string, jobseekerId: string) {
  await requirePoolMember(employerId, driveId, jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId });
  if (!app || app.decision !== 'Shortlisted') {
    throw new HttpError(400, 'Shortlist the candidate before requesting a reveal', 'not_shortlisted');
  }
  const status = app.consent?.status;
  if (status === 'granted' || status === 'declined') {
    throw new HttpError(400, 'The candidate has already responded to a reveal request', 'already_responded');
  }
  if (status === 'requested' && !isExpired(app.consent)) {
    return getPassport(employerId, driveId, jobseekerId); // idempotent — an active request already exists
  }
  const now = new Date();
  app.set('consent', { status: 'requested', requestedAt: now, expiresAt: expiryFrom(now), respondedAt: null, remindedAt: null });
  await app.save();
  return getPassport(employerId, driveId, jobseekerId);
}

export async function remindReveal(employerId: string, driveId: string, jobseekerId: string) {
  await requirePoolMember(employerId, driveId, jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId });
  if (!app || app.consent?.status !== 'requested') {
    throw new HttpError(400, 'No pending reveal request to remind', 'not_remindable');
  }
  const now = new Date();
  app.set('consent.expiresAt', expiryFrom(now));
  app.set('consent.remindedAt', now);
  await app.save();
  return getPassport(employerId, driveId, jobseekerId);
}

export async function withdrawReveal(employerId: string, driveId: string, jobseekerId: string) {
  await requirePoolMember(employerId, driveId, jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId });
  if (!app || app.consent?.status !== 'requested') {
    throw new HttpError(400, 'No pending reveal request to withdraw', 'not_withdrawable');
  }
  app.set('consent', undefined);
  await app.save();
  return getPassport(employerId, driveId, jobseekerId);
}
