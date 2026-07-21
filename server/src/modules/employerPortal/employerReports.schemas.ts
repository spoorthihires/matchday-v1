import { z } from 'zod';
export const reportsQuerySchema = z.object({ driveId: z.string().optional() });
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
