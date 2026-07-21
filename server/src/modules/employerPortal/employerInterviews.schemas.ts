import { z } from 'zod';

const timeStr = z.string().regex(/^\d{2}:\d{2}$/);

export const scheduleInterviewSchema = z.object({
  jobseekerId: z.string().min(1),
  slotId: z.string().min(1),
  time: timeStr,
  interviewers: z.array(z.string().trim().min(1)).max(20).optional(),
});
export type ScheduleInterviewPayload = z.infer<typeof scheduleInterviewSchema>;

export const interviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('complete') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('reschedule'), slotId: z.string().min(1), time: timeStr }),
  z.object({ action: z.literal('set-interviewers'), interviewers: z.array(z.string().trim().min(1)).max(20) }),
]);
export type InterviewActionPayload = z.infer<typeof interviewActionSchema>;
