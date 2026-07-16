import { z } from 'zod';

export const PARENTS = ['Engineering', 'Data Science', 'Business', 'Design', 'Product'] as const;
export const ALL_FLOW = ['MCQ', 'Coding', 'TARA', 'Assignment'] as const;

export const createStreamSchema = z.object({
  name: z.string().trim().min(1),
  parent: z.enum(PARENTS),
  label: z.string().trim().default(''),
  skills: z.array(z.string().trim().min(1)).default([]),
  good: z.array(z.string().trim().min(1)).default([]),
  flow: z.array(z.enum(ALL_FLOW)).default([]),
  cutoff: z.coerce.number().int().min(0).max(100).default(65),
  cgpa: z.coerce.number().min(0).max(10).default(6.5),
  backlogs: z.coerce.number().int().min(0).default(1),
  grad: z.array(z.string()).default([]),
  branches: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  status: z.enum(['Active', 'Disabled']).default('Active'),
});

// Explicit all-optional (NOT .partial() of the defaulted base — that would inject defaults on
// omitted PATCH keys and clobber stored data).
export const updateStreamSchema = z.object({
  name: z.string().trim().min(1).optional(),
  parent: z.enum(PARENTS).optional(),
  label: z.string().trim().optional(),
  skills: z.array(z.string().trim().min(1)).optional(),
  good: z.array(z.string().trim().min(1)).optional(),
  flow: z.array(z.enum(ALL_FLOW)).optional(),
  cutoff: z.coerce.number().int().min(0).max(100).optional(),
  cgpa: z.coerce.number().min(0).max(10).optional(),
  backlogs: z.coerce.number().int().min(0).optional(),
  grad: z.array(z.string()).optional(),
  branches: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  status: z.enum(['Active', 'Disabled']).optional(),
});

export const restoreSchema = z.object({ v: z.string().trim().min(1) });
export const listQuerySchema = z.object({
  q: z.string().optional(),
  parent: z.string().optional(),
  status: z.string().optional(),
  sort: z.enum(['name', 'parent', 'cutoff']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type CreateStreamInput = z.infer<typeof createStreamSchema>;
export type UpdateStreamInput = z.infer<typeof updateStreamSchema>;
