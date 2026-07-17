import { z } from 'zod';

export const evalStage = z.object({
  key: z.enum(['mcq', 'coding', 'tara', 'assignments']),
  enabled: z.boolean(),
  config: z.record(z.number()).default({}),
  evalConfigId: z.string().optional(),
});

export const createDriveSchema = z.object({
  name: z.string().trim().min(1),
  domain: z.string().min(1),
  stream: z.string().min(1),
  status: z.enum(['Active', 'Published', 'Draft', 'Archived']).default('Draft'),
  candType: z.enum(['Freshers', 'Experienced', 'Both']),
  mode: z.enum(['Online', 'Onsite', 'Hybrid']),
  frequency: z.enum(['Weekly', 'Bi-weekly', 'Monthly', 'One-time']),
  eventDay: z.enum(['Wednesday', 'Saturday']),
  eventDates: z.array(z.coerce.date()).min(1),
  candCap: z.number().int().min(0),
  empCap: z.number().int().min(0),
  slotCap: z.number().int().min(0),
  eligibility: z.object({
    sources: z.array(z.string()).min(1),
    branches: z.array(z.string()).min(1),
    gradYears: z.array(z.number().int()),
    expType: z.string(),
  }),
  evaluation: z.array(evalStage).refine((a) => a.some((s) => s.enabled), {
    message: 'Enable at least one evaluation stage',
  }),
  templateId: z.string().optional(),
  streamId: z.string().optional(),
  visibility: z.object({
    employerReg: z.enum(['Open', 'Invite-only', 'Closed']),
    instituteVis: z.enum(['All institutes', 'Selected institutes', 'Private link']),
    candidateAccess: z.enum(['Public', 'Eligible only', 'Invite']),
  }),
});

// Draft saves may be incomplete (spec §11): relax the minimum-length / refine
// constraints while keeping enums, types, and defaults. The full minimums
// only apply once a drive moves to Published/Active — that path still uses
// createDriveSchema unchanged.
export const draftDriveSchema = createDriveSchema.extend({
  name: z.string().trim().default(''),
  eventDates: z.array(z.coerce.date()).default([]),
  eligibility: z.object({
    sources: z.array(z.string()).default([]),
    branches: z.array(z.string()).default([]),
    gradYears: z.array(z.number().int()).default([]),
    expType: z.string().default('Freshers only'),
  }),
  evaluation: z.array(evalStage).default([]),
});

export const updateDriveSchema = createDriveSchema.partial();

export const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  stream: z.string().optional(),
  domain: z.string().optional(),
  sort: z.enum(['name', 'domain', 'stream', 'month', 'candCap', 'empCap', 'slotCap', 'status']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
});

export type DriveInput = z.infer<typeof createDriveSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
