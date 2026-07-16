import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { EvalConfig, type EvalConfigDoc } from '../../models/EvalConfig.js';
import type { CreateEvalConfigInput, UpdateEvalConfigInput } from './eval-configs.schemas.js';

export interface EvalConfigItem {
  id: string; code: string; name: string; type: string; enabled: boolean;
  passing: number; attempts: number; retake: string; cooldown: number; validity: number;
  autoQual: boolean; threshold: number; contests: number;
  createdAt: string; updatedAt: string;
}

export function codeFor(id: unknown): string {
  return `EVC-${String(id).slice(-3).toUpperCase()}`;
}
function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Configuration not found', 'not_found');
}
function toItem(d: EvalConfigDoc & { _id: unknown }): EvalConfigItem {
  return {
    id: String(d._id), code: codeFor(d._id), name: d.name, type: d.type ?? 'MCQ',
    enabled: d.enabled ?? true, passing: d.passing ?? 0, attempts: d.attempts ?? 1,
    retake: d.retake ?? 'After cooldown', cooldown: d.cooldown ?? 0, validity: d.validity ?? 0,
    autoQual: d.autoQual ?? false, threshold: d.threshold ?? 0, contests: d.contests ?? 0,
    createdAt: new Date(d.createdAt as Date).toISOString(),
    updatedAt: new Date(d.updatedAt as Date).toISOString(),
  };
}

export async function listEvalConfigs(params: { q?: string; type?: string; status?: string }) {
  const match: Record<string, unknown> = {};
  if (params.type) match.type = params.type;
  if (params.status === 'Active') match.enabled = true;
  else if (params.status === 'Inactive') match.enabled = false;
  if (params.q && params.q.trim()) {
    const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { type: rx }];
  }
  const rows = await EvalConfig.find(match).sort({ updatedAt: -1 }).lean();
  return { items: rows.map((r) => toItem(r as never)) };
}

export async function createEvalConfig(input: CreateEvalConfigInput) {
  const now = new Date();
  return EvalConfig.create({ ...input, contests: 0, createdAt: now, updatedAt: now });
}
export async function getEvalConfig(id: string) {
  assertId(id);
  const c = await EvalConfig.findById(id);
  if (!c) throw new HttpError(404, 'Configuration not found', 'not_found');
  return c;
}
export async function updateEvalConfig(id: string, patch: UpdateEvalConfigInput) {
  const c = await getEvalConfig(id);
  Object.assign(c, patch);
  c.updatedAt = new Date();
  await c.save();
  return c;
}
export async function duplicateEvalConfig(id: string) {
  const c = await getEvalConfig(id);
  const now = new Date();
  return EvalConfig.create({
    name: `${c.name} (Copy)`, type: c.type, enabled: false,
    passing: c.passing, attempts: c.attempts, retake: c.retake, cooldown: c.cooldown,
    validity: c.validity, autoQual: c.autoQual, threshold: c.threshold, contests: 0,
    createdAt: now, updatedAt: now,
  });
}
export async function deleteEvalConfig(id: string) {
  const c = await getEvalConfig(id);
  await c.deleteOne();
  return { deleted: true as const };
}
