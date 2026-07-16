import { z } from 'zod';

export const EVAL_TYPES = ['MCQ', 'Coding', 'TARA', 'Assignments'] as const;
const RETAKES = ['Not allowed', 'After cooldown', 'Unlimited', 'Admin approval'] as const;

export const createEvalConfigSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(EVAL_TYPES).default('MCQ'),
  enabled: z.boolean().default(true),
  passing: z.coerce.number().int().min(0).max(100).default(60),
  attempts: z.coerce.number().int().min(1).max(10).default(2),
  retake: z.enum(RETAKES).default('After cooldown'),
  cooldown: z.coerce.number().int().min(0).max(90).default(2),
  validity: z.coerce.number().int().min(1).max(365).default(90),
  autoQual: z.boolean().default(false),
  threshold: z.coerce.number().int().min(0).max(100).default(70),
});

// NOT createEvalConfigSchema.partial() — the base carries .default()s that would inject values
// on omitted PATCH keys and clobber stored data. Declare an explicit all-optional shape.
export const updateEvalConfigSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(EVAL_TYPES).optional(),
  enabled: z.boolean().optional(),
  passing: z.coerce.number().int().min(0).max(100).optional(),
  attempts: z.coerce.number().int().min(1).max(10).optional(),
  retake: z.enum(RETAKES).optional(),
  cooldown: z.coerce.number().int().min(0).max(90).optional(),
  validity: z.coerce.number().int().min(1).max(365).optional(),
  autoQual: z.boolean().optional(),
  threshold: z.coerce.number().int().min(0).max(100).optional(),
});

export const listQuerySchema = z.object({
  q: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),   // 'Active' | 'Inactive'
});

export type CreateEvalConfigInput = z.infer<typeof createEvalConfigSchema>;
export type UpdateEvalConfigInput = z.infer<typeof updateEvalConfigSchema>;
