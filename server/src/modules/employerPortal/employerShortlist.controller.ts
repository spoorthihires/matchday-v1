import type { Request, Response } from 'express';
import { bulkDecisionSchema } from './employerShortlist.schemas.js';
import { bulkDecision } from './employerShortlist.service.js';

export async function bulkDecisionController(req: Request, res: Response) {
  const { jobseekerIds, decision } = bulkDecisionSchema.parse(req.body);
  res.json(await bulkDecision(req.userId as string, req.params.id, jobseekerIds, decision));
}
