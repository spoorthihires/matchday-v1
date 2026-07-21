import type { Types } from 'mongoose';
import { SupportRequest } from '../../models/SupportRequest.js';
import type { CreateSupportInput } from './employerSupport.schemas.js';

function ref(id: Types.ObjectId | string): string { return `SUP-${String(id).slice(-6).toUpperCase()}`; }

interface SupportLean { _id: Types.ObjectId; category: string; subject: string; message: string; priority: string; status: string; createdAt: Date }
function project(r: SupportLean) {
  return { id: String(r._id), ref: ref(r._id), category: r.category, subject: r.subject, message: r.message, priority: r.priority, status: r.status, createdAt: new Date(r.createdAt).toISOString() };
}

export async function createSupportRequest(employerId: string, input: CreateSupportInput) {
  const doc = await SupportRequest.create({
    employerId, category: input.category, subject: input.subject, message: input.message, priority: input.priority, status: 'Open',
  });
  return project(doc.toObject() as unknown as SupportLean);
}

export async function listSupportRequests(employerId: string) {
  const rows = await SupportRequest.find({ employerId }).sort({ createdAt: -1 }).lean<SupportLean[]>();
  return { items: rows.map(project) };
}
