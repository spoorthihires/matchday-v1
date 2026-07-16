import { z } from 'zod';

export const streamRulesSchema = z.object({
  numAllowed: z.enum(['1', '2', '3', 'Unlimited']),
  requirePrimary: z.boolean(),
  defaultPrimary: z.string(),
  allowSecondary: z.boolean(),
  maxSecondary: z.coerce.number().int().min(0).max(5),
  changePolicy: z.enum(['Anytime', 'Before evaluation only', 'Requires admin approval', 'Locked after drive assignment']),
  cooldown: z.coerce.number().int().min(0).max(365),
  reuseEval: z.boolean(),
  reuseScope: z.enum(['Any stream', 'Same domain only', 'Exact match only']),
  validityDays: z.coerce.number().int().min(1).max(720),
  validityExpires: z.boolean(),
  autoSuggest: z.boolean(),
  suggestBasis: z.enum(['Skills', 'Past evaluations', 'Skills + evaluations']),
  confidence: z.coerce.number().int().min(0).max(100),
});
export type StreamRulesInput = z.infer<typeof streamRulesSchema>;
