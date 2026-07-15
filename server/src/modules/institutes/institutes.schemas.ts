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

export const listQuerySchema = z.object({
  q: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
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
export type CreateInstituteInput = z.infer<typeof createInstituteSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
