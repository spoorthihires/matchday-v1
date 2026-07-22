import { z } from 'zod';
import { TEAM_ROLES, TEAM_STATUSES } from '../../models/TeamMember.js';

export const addMemberSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(TEAM_ROLES),
  password: z.string().min(8).max(200),
});
export const updateMemberSchema = z.object({
  role: z.enum(TEAM_ROLES).optional(),
  status: z.enum(TEAM_STATUSES).optional(),
}).refine((v) => v.role !== undefined || v.status !== undefined, { message: 'Nothing to update' });

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
