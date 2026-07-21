import { z } from 'zod';

export const bulkDecisionSchema = z.object({
  jobseekerIds: z.array(z.string()).min(1).max(500),
  decision: z.enum(['Shortlisted', 'Hold', 'Rejected']),
});
export type BulkDecisionPayload = z.infer<typeof bulkDecisionSchema>;
