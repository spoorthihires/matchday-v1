import type { Request, Response } from 'express';
import { requestReveal, remindReveal, withdrawReveal } from './employerConsent.service.js';

export async function requestRevealController(req: Request, res: Response) {
  res.json(await requestReveal(req.userId as string, req.params.id, req.params.jobseekerId));
}
export async function remindRevealController(req: Request, res: Response) {
  res.json(await remindReveal(req.userId as string, req.params.id, req.params.jobseekerId));
}
export async function withdrawRevealController(req: Request, res: Response) {
  res.json(await withdrawReveal(req.userId as string, req.params.id, req.params.jobseekerId));
}
