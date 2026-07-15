import { z } from 'zod';

export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), reason: z.string().optional() }),
  z.object({ action: z.literal('request-changes'), note: z.string().optional() }),
  z.object({ action: z.literal('move-drive'), driveId: z.string().min(1) }),
  z.object({ action: z.literal('change-slot'), slot: z.string().trim().min(1) }),
]);
export const listQuerySchema = z.object({ status: z.string().optional() });
export type ActionPayload = z.infer<typeof actionSchema>;
