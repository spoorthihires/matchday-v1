import { z } from 'zod';

export const upsertOfferSchema = z.object({
  status: z.enum(['Draft', 'Sent', 'Accepted', 'Declined', 'Joined']),
  response: z.enum(['Pending', 'Negotiating', 'Accepted', 'Declined']).optional(),
  ctc: z.number().nonnegative().optional(),
  location: z.string().optional(),
  mode: z.enum(['On-site', 'Hybrid', 'Remote']).optional(),
  joinDate: z.string().optional(),           // ISO date string; '' clears
  declineReason: z.string().optional(),
});
export type UpsertOfferPayload = z.infer<typeof upsertOfferSchema>;
