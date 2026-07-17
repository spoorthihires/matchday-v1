import { z } from 'zod';
import { Types } from 'mongoose';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const slotFields = z.object({
  date: z.coerce.date(),
  start: z.string().regex(TIME_RE),
  end: z.string().regex(TIME_RE),
  capacity: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['Scheduled', 'Completed', 'Cancelled']).default('Scheduled'),
  employerId: objectId.or(z.literal('')).nullish(),
  driveId: objectId,
  link: z.string().url().or(z.literal('')).default(''),
  attended: z.coerce.number().int().min(0).default(0),
  noShow: z.coerce.number().int().min(0).default(0),
});
export const createSlotSchema = slotFields;
export const updateSlotSchema = slotFields.partial();  // cross-field rules re-checked in the service on the merged doc

export const listQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  employerId: z.string().optional(),
});
export type CreateSlotInput = z.infer<typeof createSlotSchema>;
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>;
