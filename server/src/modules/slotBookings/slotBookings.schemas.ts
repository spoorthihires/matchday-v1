import { z } from 'zod';

export const createBookingSchema = z.object({
  jobseekerId: z.string().min(1),
  status: z.enum(['Booked', 'Held']),
});
export const confirmBookingSchema = z.object({
  status: z.literal('Booked'),
});
export const eligibleQuerySchema = z.object({
  q: z.string().optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
