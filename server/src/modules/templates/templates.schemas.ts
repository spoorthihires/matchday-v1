import { z } from 'zod';

export const DOMAINS = ['Data / Analytics', 'Data Engineering', 'Machine Learning', 'GenAI', 'Business'] as const;
const CHANNELS = ['Email', 'WhatsApp', 'Bell'] as const;

const sectionsSchema = z.object({
  assessment: z.object({
    mcq: z.boolean(),
    coding: z.boolean(),
    tara: z.boolean(),
    assignments: z.boolean(),
  }),
  weightage: z.record(z.coerce.number().int().min(0).max(100)),
  matching: z.record(z.coerce.number().int().min(0).max(100)),
  kanban: z.array(z.string().trim().min(1)).min(1),
  notifications: z.array(z.object({ name: z.string().min(1), ch: z.array(z.enum(CHANNELS)) })),
  privacy: z.record(z.boolean()),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1),
  domain: z.enum(DOMAINS),
  status: z.enum(['Active', 'Inactive']).default('Active'),
  sections: sectionsSchema,
});

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  domain: z.enum(DOMAINS).optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
  sections: sectionsSchema.optional(),
});

export const restoreSchema = z.object({ v: z.string().trim().min(1) });

export const listQuerySchema = z.object({
  q: z.string().optional(),
  domain: z.string().optional(),
  status: z.string().optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
