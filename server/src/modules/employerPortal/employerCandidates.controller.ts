import type { Request, Response } from 'express';
import { candidatesQuerySchema, decisionSchema, noteInputSchema } from './employerCandidates.schemas.js';
import { listCandidates, getPassport, setDecision, addNote } from './employerCandidates.service.js';

export async function candidatesController(req: Request, res: Response) {
  res.json(await listCandidates(req.userId as string, req.params.id, candidatesQuerySchema.parse(req.query)));
}

export async function passportController(req: Request, res: Response) {
  res.json(await getPassport(req.userId as string, req.params.id, req.params.jobseekerId));
}
export async function decisionController(req: Request, res: Response) {
  const { decision } = decisionSchema.parse(req.body);
  res.json(await setDecision(req.userId as string, req.params.id, req.params.jobseekerId, decision));
}
export async function noteController(req: Request, res: Response) {
  const { text } = noteInputSchema.parse(req.body);
  res.json(await addNote(req.userId as string, req.params.id, req.params.jobseekerId, text));
}
