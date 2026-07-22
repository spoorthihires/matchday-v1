import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { TeamMember } from '../../models/TeamMember.js';
import { Employer } from '../../models/Employer.js';
import { hashPassword } from '../auth/auth.service.js';
import type { AddMemberInput, UpdateMemberInput } from './employerTeam.schemas.js';

interface MemberLean { _id: Types.ObjectId; name: string; email: string; role: string; status: string; createdAt: Date }
function project(m: MemberLean) {
  return { id: String(m._id), name: m.name, email: m.email, role: m.role, status: m.status, createdAt: new Date(m.createdAt).toISOString() };
}

interface ActingCtx { canManage: boolean; role: string; selfId: string | null }
export async function actingContext(employerId: string, memberId?: string): Promise<ActingCtx> {
  if (!memberId) return { canManage: true, role: 'Owner', selfId: null };
  const m = await TeamMember.findOne({ _id: memberId, employerId }).lean<{ _id: Types.ObjectId; role: string; status: string } | null>();
  if (!m || m.status !== 'Active') throw new HttpError(403, 'Your team access is no longer active', 'team_access_revoked');
  return { canManage: m.role === 'Admin', role: m.role, selfId: String(m._id) };
}
function requireManage(ctx: ActingCtx) {
  if (!ctx.canManage) throw new HttpError(403, 'Only admins can manage team access', 'forbidden');
}

export async function listTeam(employerId: string, memberId?: string) {
  const ctx = await actingContext(employerId, memberId);
  const rows = await TeamMember.find({ employerId }).sort({ createdAt: -1 }).lean<MemberLean[]>();
  return { members: rows.map(project), canManage: ctx.canManage, actingRole: ctx.role, selfId: ctx.selfId };
}

export async function addTeamMember(employerId: string, memberId: string | undefined, input: AddMemberInput) {
  requireManage(await actingContext(employerId, memberId));
  const email = input.email; // zod lowercased
  if (await TeamMember.findOne({ email })) throw new HttpError(400, 'That email already has an account', 'email_taken');
  if (await Employer.findOne({ email })) throw new HttpError(400, 'That email already has an account', 'email_taken');
  const passwordHash = await hashPassword(input.password);
  const doc = await TeamMember.create({ employerId, name: input.name, email, role: input.role, status: 'Active', passwordHash });
  return project(doc.toObject() as unknown as MemberLean);
}

export async function updateTeamMember(employerId: string, memberId: string | undefined, targetId: string, input: UpdateMemberInput) {
  const ctx = await actingContext(employerId, memberId); requireManage(ctx);
  if (!Types.ObjectId.isValid(targetId)) throw new HttpError(404, 'Member not found', 'not_found');
  if (ctx.selfId && ctx.selfId === targetId) throw new HttpError(400, 'You cannot modify your own membership', 'cant_modify_self');
  const m = await TeamMember.findOne({ _id: targetId, employerId });
  if (!m) throw new HttpError(404, 'Member not found', 'not_found');
  if (input.role !== undefined) m.role = input.role;
  if (input.status !== undefined) m.status = input.status;
  await m.save();
  return project(m.toObject() as unknown as MemberLean);
}

export async function removeTeamMember(employerId: string, memberId: string | undefined, targetId: string) {
  const ctx = await actingContext(employerId, memberId); requireManage(ctx);
  if (!Types.ObjectId.isValid(targetId)) throw new HttpError(404, 'Member not found', 'not_found');
  if (ctx.selfId && ctx.selfId === targetId) throw new HttpError(400, 'You cannot remove your own membership', 'cant_remove_self');
  const res = await TeamMember.deleteOne({ _id: targetId, employerId });
  if (res.deletedCount === 0) throw new HttpError(404, 'Member not found', 'not_found');
  return { ok: true as const };
}
