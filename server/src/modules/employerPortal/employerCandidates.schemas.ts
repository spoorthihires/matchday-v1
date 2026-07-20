import { z } from 'zod';

export const candidatesQuerySchema = z.object({
  q: z.string().optional(),
  decision: z.enum(['Shortlisted', 'Hold', 'Rejected', 'undecided']).optional(),
  evaluation: z.enum(['Strong', 'Qualified']).optional(),
});
export const decisionSchema = z.object({ decision: z.enum(['Shortlisted', 'Hold', 'Rejected']).nullable() });
export const noteInputSchema = z.object({ text: z.string().trim().min(1) });

export type CandidatesQuery = z.infer<typeof candidatesQuerySchema>;
