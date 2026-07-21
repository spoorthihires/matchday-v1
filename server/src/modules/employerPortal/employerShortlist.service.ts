import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Application } from '../../models/Application.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { poolSeekers } from './employerCandidates.service.js';

interface DriveShape { _id: Types.ObjectId; name?: string; eligibility?: { branches?: string[]; gradYears?: number[]; sources?: string[] } }

async function gateAndDrive(employerId: string, driveId: string): Promise<DriveShape> {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean<DriveShape>();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  return drive;
}

export async function bulkDecision(employerId: string, driveId: string, jobseekerIds: string[], decision: 'Shortlisted' | 'Hold' | 'Rejected') {
  const drive = await gateAndDrive(employerId, driveId);
  const pool = await poolSeekers(drive);
  const requested = new Set(jobseekerIds);
  const valid = pool.filter((s) => requested.has(String(s._id)));   // intersect with the pool; unknown/non-pool ids are silently skipped
  if (valid.length) {
    const empId = new Types.ObjectId(employerId);
    const drvId = new Types.ObjectId(driveId);
    await Application.bulkWrite(valid.map((s) => ({
      updateOne: {
        filter: { employerId: empId, driveId: drvId, jobseekerId: s._id },
        update: { $set: { decision }, $setOnInsert: { employerId: empId, driveId: drvId, jobseekerId: s._id } },
        upsert: true,
      },
    })));
  }
  return { updated: valid.length };
}
