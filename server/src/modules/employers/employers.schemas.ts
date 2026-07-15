import { z } from 'zod';

export const INDUSTRIES = ['Product · SaaS', 'Fintech', 'ML / AI Platform', 'Cloud Infra', 'Enterprise', 'E-commerce'] as const;
export const SIZES = ['1–50', '51–200', '201–1000', '1000+'] as const;

export const createEmployerSchema = z.object({
  name: z.string().trim().min(1),
  industry: z.enum(INDUSTRIES),
  size: z.enum(SIZES).default('51–200'),
  spoc: z.string().trim().default(''),
  email: z.string().email().or(z.literal('')).default(''),
  status: z.enum(['Active', 'Pending', 'Disabled']).default('Pending'),
});
export const updateEmployerSchema = createEmployerSchema.partial();

export const listQuerySchema = z.object({
  q: z.string().optional(),
  industry: z.string().optional(),
  status: z.string().optional(),
  sort: z.enum(['name', 'industry', 'drives', 'viewed', 'shortlist', 'offer', 'respHours']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
});
export const bulkSchema = z.object({ ids: z.array(z.string()).min(1), action: z.enum(['approve', 'disable']) });

export type CreateEmployerInput = z.infer<typeof createEmployerSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
