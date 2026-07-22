import { z } from 'zod';
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES } from '../../models/SupportRequest.js';

export const createSupportSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(4000),
  priority: z.enum(SUPPORT_PRIORITIES).default('Normal'),
});
export type CreateSupportInput = z.infer<typeof createSupportSchema>;
