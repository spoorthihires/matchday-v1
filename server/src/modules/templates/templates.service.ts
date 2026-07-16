import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { DriveTemplate, type DriveTemplateDoc } from '../../models/DriveTemplate.js';
import type { CreateTemplateInput, UpdateTemplateInput } from './templates.schemas.js';

const ACTOR = 'Platform Admin';

export interface TemplateItem {
  id: string; code: string; name: string; domain: string;
  status: string; usedBy: number;
  sections: unknown;
  version: string;
  versions: { v: string; date: string; by: string; note: string }[];
  createdAt: string; updatedAt: string;
}

export function bumpVersion(v: string): string {
  const parts = v.split('.').map(Number);
  parts[1] = (parts[1] || 0) + 1;
  return parts.join('.');
}
export function codeFor(id: unknown): string {
  return `TPL-${String(id).slice(-3).toUpperCase()}`;
}
function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Template not found', 'not_found');
}

function toItem(d: DriveTemplateDoc & { _id: unknown }): TemplateItem {
  return {
    id: String(d._id), code: codeFor(d._id), name: d.name, domain: d.domain,
    status: d.status ?? 'Active', usedBy: d.usedBy ?? 0,
    sections: d.sections,
    version: d.version ?? '1.0',
    versions: (d.versions ?? []).map((v) => ({
      v: v.v, date: new Date(v.date).toISOString(), by: v.by, note: v.note ?? '',
    })),
    createdAt: new Date(d.createdAt as Date).toISOString(),
    updatedAt: new Date(d.updatedAt as Date).toISOString(),
  };
}

export async function listTemplates(params: { q?: string; domain?: string; status?: string }) {
  const match: Record<string, unknown> = {};
  if (params.domain) match.domain = params.domain;
  if (params.status) match.status = params.status;
  if (params.q && params.q.trim()) {
    const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { domain: rx }];
  }
  const rows = await DriveTemplate.find(match).sort({ updatedAt: -1 }).lean();
  return { items: rows.map((r) => toItem(r as never)) };
}

export async function createTemplate(input: CreateTemplateInput) {
  const now = new Date();
  return DriveTemplate.create({
    name: input.name, domain: input.domain, status: input.status, usedBy: 0,
    sections: input.sections, version: '1.0',
    versions: [{ v: '1.0', date: now, by: ACTOR, note: 'Initial template' }],
    createdAt: now, updatedAt: now,
  });
}

export async function getTemplate(id: string) {
  assertId(id);
  const t = await DriveTemplate.findById(id);
  if (!t) throw new HttpError(404, 'Template not found', 'not_found');
  return t;
}

export async function updateTemplate(id: string, patch: UpdateTemplateInput) {
  const t = await getTemplate(id);
  if (patch.name !== undefined) t.name = patch.name;
  if (patch.domain !== undefined) t.domain = patch.domain;
  if (patch.status !== undefined) t.status = patch.status;
  if (patch.sections !== undefined) {
    t.sections = patch.sections;
    t.markModified('sections');
    const nv = bumpVersion(t.version ?? '1.0');
    t.version = nv;
    t.versions.unshift({ v: nv, date: new Date(), by: ACTOR, note: 'Edited configuration' });
  }
  t.updatedAt = new Date();
  await t.save();
  return t;
}

export async function cloneTemplate(id: string) {
  const t = await getTemplate(id);
  const now = new Date();
  return DriveTemplate.create({
    name: `${t.name} (Copy)`, domain: t.domain, status: 'Inactive', usedBy: 0,
    sections: t.sections, version: '1.0',
    versions: [{ v: '1.0', date: now, by: ACTOR, note: `Cloned from ${t.name}` }],
    createdAt: now, updatedAt: now,
  });
}

export async function restoreTemplate(id: string, v: string) {
  const t = await getTemplate(id);
  if (!(t.versions ?? []).some((entry) => entry.v === v)) {
    throw new HttpError(400, `Unknown version ${v}`, 'validation');
  }
  const nv = bumpVersion(t.version ?? '1.0');
  t.version = nv;
  t.versions.unshift({ v: nv, date: new Date(), by: ACTOR, note: `Restored v${v}` });
  t.updatedAt = new Date();
  await t.save();
  return t;
}

export async function deleteTemplate(id: string) {
  const t = await getTemplate(id);
  await t.deleteOne();
  return { deleted: true as const };
}
