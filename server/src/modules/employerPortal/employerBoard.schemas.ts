import { z } from 'zod';
import { KANBAN_STAGES } from '../../constants/kanban.js';

export const setStageSchema = z.object({ stage: z.enum(KANBAN_STAGES) });
export type SetStagePayload = z.infer<typeof setStageSchema>;
