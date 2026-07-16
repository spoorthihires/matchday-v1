import type { Request, Response } from 'express';
import { z } from 'zod';
import { getEvalMonitor } from './eval-monitor.service.js';

const querySchema = z.object({
  contest: z.string().optional(), employer: z.string().optional(),
  institute: z.string().optional(), date: z.string().optional(),
});

export async function monitorController(req: Request, res: Response) {
  res.json(await getEvalMonitor(querySchema.parse(req.query)));
}
