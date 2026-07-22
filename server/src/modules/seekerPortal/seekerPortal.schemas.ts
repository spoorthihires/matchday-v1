import { z } from 'zod';

export const respondSchema = z.object({ decision: z.enum(['grant', 'deny']) });
export type RespondPayload = z.infer<typeof respondSchema>;

export const respondOfferSchema = z.object({ response: z.enum(['Accepted', 'Declined']), declineReason: z.string().max(500).optional() });
export type RespondOfferPayload = z.infer<typeof respondOfferSchema>;
