import type { Request, Response } from 'express';
import { candidatesQuerySchema } from './employerCandidates.schemas.js';
import { listCandidates } from './employerCandidates.service.js';

export async function candidatesController(req: Request, res: Response) {
  res.json(await listCandidates(req.userId as string, req.params.id, candidatesQuerySchema.parse(req.query)));
}
