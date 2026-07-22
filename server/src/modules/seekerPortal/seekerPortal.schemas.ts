import { z } from 'zod';

export const respondSchema = z.object({ decision: z.enum(['grant', 'deny']) });
export type RespondPayload = z.infer<typeof respondSchema>;

export const respondOfferSchema = z.object({ response: z.enum(['Accepted', 'Declined']), declineReason: z.string().max(500).optional() });
export type RespondOfferPayload = z.infer<typeof respondOfferSchema>;

export const updateAccountSchema = z.object({ name: z.string().trim().min(1).optional(), branch: z.string().trim().min(1).optional(), source: z.string().trim().min(1).optional() });
export type UpdateAccountPayload = z.infer<typeof updateAccountSchema>;

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) });
export type ChangePasswordPayload = z.infer<typeof changePasswordSchema>;
