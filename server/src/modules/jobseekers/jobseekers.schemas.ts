import { Types } from 'mongoose';
import { z } from 'zod';

export const createJobseekerSchema = z.object({
  name: z.string().trim().min(1),
  instituteId: z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid institute id' }),
  branch: z.string().min(1),
  gradYear: z.coerce.number().int().min(2020).max(2030),
  cgpa: z.coerce.number().min(0).max(10),
  source: z.string().optional(),
  email: z.string().email().or(z.literal('')).optional(),
  consent: z.enum(['Granted', 'Pending', 'Revoked']).optional(),
  stage: z.enum(['Applied', 'Screened', 'Evaluated', 'MatchReady', 'Shortlisted', 'Offer', 'Joined', 'DroppedOff']).optional(),
  evaluationStatus: z.enum(['na', 'pending', 'completed']).optional(),
  profileCompleted: z.boolean().optional(),
});
export const updateJobseekerSchema = createJobseekerSchema.partial();

export const listQuerySchema = z.object({
  q: z.string().optional(),
  instituteId: z.string().optional(),
  stream: z.string().optional(),                 // = branch
  evaluationStatus: z.enum(['na', 'pending', 'completed']).optional(),
  offer: z.enum(['None', 'Shortlisted', 'Offer sent', 'Joined', 'Rejected']).optional(),
  consent: z.enum(['Granted', 'Pending', 'Revoked']).optional(),
  matchBucket: z.enum(['high', 'mid', 'low']).optional(),
  sort: z.enum(['name', 'institute', 'matchReady']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export const bulkSchema = z.object({ ids: z.array(z.string()).min(1), action: z.enum(['block', 'unblock']) });

export type CreateJobseekerInput = z.infer<typeof createJobseekerSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
