import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import { Employer } from '../../models/Employer.js';
import { Drive } from '../../models/Drive.js';
import { AuditLog } from '../../models/AuditLog.js';
import type { ActionPayload } from './registrations.schemas.js';

const CLOSED = ['Approved', 'Rejected'];

function assertId(id: string, what = 'Registration') {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, `${what} not found`, 'not_found');
}

export async function listRegistrations(status?: string) {
  const match: Record<string, unknown> = {};
  if (status) match.status = status;
  const [items, pending, total] = await Promise.all([
    RegistrationRequest.find(match).sort({ createdAt: -1 }).lean(),
    RegistrationRequest.countDocuments({ status: 'Pending review' }),
    RegistrationRequest.countDocuments({}),
  ]);
  return { items, counts: { pending, total } };
}

export async function getRegistration(id: string) {
  assertId(id);
  const r = await RegistrationRequest.findById(id);
  if (!r) throw new HttpError(404, 'Registration not found', 'not_found');
  return r;
}

async function upsertEmployerFrom(reg: { company: string; industry: string; submittedBy: string; employerId?: Types.ObjectId | null }, actor: string) {
  if (reg.employerId) {
    const emp = await Employer.findById(reg.employerId);
    if (emp) {
      if (emp.status === 'Pending') { emp.status = 'Active'; await emp.save(); }
      return;
    }
  }
  // fallback: name-match/create (unchanged)
  const escaped = reg.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await Employer.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
  if (existing) return;
  const created = await Employer.create({ name: reg.company, industry: reg.industry, spoc: reg.submittedBy, status: 'Active' });
  await AuditLog.create({ entityType: 'employer', entityId: created._id, action: 'created', actor, detail: 'Created from registration approval' });
}

export async function applyAction(id: string, payload: ActionPayload, actor: string) {
  const reg = await getRegistration(id);
  const log = (action: string) => reg.activity.unshift({ action, by: actor, at: new Date() });
  const requireOpen = () => {
    if (CLOSED.includes(reg.status)) throw new HttpError(400, 'Registration is closed', 'validation');
  };
  switch (payload.action) {
    case 'approve': {
      requireOpen();
      reg.status = 'Approved';
      log('Approved');
      await upsertEmployerFrom(reg, actor);
      break;
    }
    case 'reject': {
      requireOpen();
      reg.status = 'Rejected';
      log(payload.reason?.trim() ? `Rejected — ${payload.reason.trim()}` : 'Rejected');
      break;
    }
    case 'request-changes': {
      requireOpen();
      reg.status = 'Changes requested';
      log(payload.note?.trim() ? `Changes requested — ${payload.note.trim()}` : 'Changes requested');
      break;
    }
    case 'move-drive': {
      assertId(payload.driveId, 'Drive');
      const d = await Drive.findById(payload.driveId);
      if (!d) throw new HttpError(404, 'Drive not found', 'not_found');
      reg.driveId = d._id;
      reg.driveName = d.name;
      log(`Moved to drive: ${d.name}`);
      break;
    }
    case 'change-slot': {
      reg.slot = payload.slot;
      log(`Slot changed: ${payload.slot}`);
      break;
    }
  }
  await reg.save();
  return reg;
}
