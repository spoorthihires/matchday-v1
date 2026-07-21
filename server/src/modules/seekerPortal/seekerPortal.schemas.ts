import { z } from 'zod';

export const respondSchema = z.object({ decision: z.enum(['grant', 'deny']) });
export type RespondPayload = z.infer<typeof respondSchema>;
