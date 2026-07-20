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
  evaluationStatus: z.enum(['na', 'pending', 'completed', 'failed']).optional(),
  profileCompleted: z.boolean().optional(),
});
export const updateJobseekerSchema = createJobseekerSchema.partial();

// Splits a CSV query param into a trimmed, non-empty string array (supports multi-select column
// filters while staying backward-compatible with a lone single value, which round-trips fine).
function csv() {
  return z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));
}
function csvEnum<T extends [string, ...string[]]>(values: T) {
  return csv().pipe(z.array(z.enum(values)));
}

export const listQuerySchema = z.object({
  q: z.string().optional(),
  instituteId: csv().optional(),
  stream: csv().optional(),                 // = branch
  evaluationStatus: csvEnum(['na', 'pending', 'completed', 'failed']).optional(),
  offer: csvEnum(['None', 'Shortlisted', 'Offer sent', 'Joined', 'Rejected']).optional(),
  consent: csvEnum(['Granted', 'Pending', 'Revoked']).optional(),
  matchBucket: csvEnum(['high', 'mid', 'low']).optional(),
  dupRisk: z.enum(['High', 'Low']).optional(),
  sort: z.enum(['name', 'institute', 'stream', 'matchReady', 'evaluationStatus', 'offerStatus', 'dupRisk', 'consent']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export const bulkSchema = z.object({ ids: z.array(z.string()).min(1), action: z.enum(['block', 'unblock']) });

export type CreateJobseekerInput = z.infer<typeof createJobseekerSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
