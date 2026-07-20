import { z } from 'zod';

const TYPES = ['Engineering College', 'University', 'Autonomous Institute', 'Bootcamp'] as const;

export const createInstituteSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(TYPES),
  city: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  email: z.string().trim().email(),
  status: z.enum(['Active', 'Pending', 'Disabled']).default('Pending'),
});
export const updateInstituteSchema = createInstituteSchema.partial();

// Splits a CSV query param into a trimmed, non-empty string array (multi-select column filters,
// backward-compatible with a lone single value — see jobseekers.schemas.ts's identical helper).
function csv() {
  return z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));
}
function pctRange() {
  return z.coerce.number().int().min(0).max(100).optional();
}

export const listQuerySchema = z.object({
  q: z.string().optional(),
  type: csv().optional(),
  status: csv().optional(),
  uploadedFrom: z.coerce.number().int().min(0).optional(),
  uploadedTo: z.coerce.number().int().min(0).optional(),
  signupFrom: pctRange(), signupTo: pctRange(),
  completionFrom: pctRange(), completionTo: pctRange(),
  matchReadyFrom: pctRange(), matchReadyTo: pctRange(),
  shortlistFrom: pctRange(), shortlistTo: pctRange(),
  offerFrom: pctRange(), offerTo: pctRange(),
  joinedFrom: pctRange(), joinedTo: pctRange(),
  sort: z.enum(['name', 'type', 'uploaded', 'signup', 'completion', 'matchReady', 'shortlist', 'offer', 'joined']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
});
export const bulkSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(['approve', 'disable']),
});
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export const assignDrivesSchema = z.object({ driveIds: z.array(z.string()).default([]) });
export const bulkAssignDrivesSchema = z.object({ instituteIds: z.array(z.string()).min(1), driveIds: z.array(z.string()).min(1) });

export type CreateInstituteInput = z.infer<typeof createInstituteSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
