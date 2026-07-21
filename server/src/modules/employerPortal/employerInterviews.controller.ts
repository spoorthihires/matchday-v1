import type { Request, Response } from 'express';
import { scheduleInterviewSchema, interviewActionSchema } from './employerInterviews.schemas.js';
import { listInterviews, scheduleInterview, interviewAction } from './employerInterviews.service.js';

export async function interviewsController(req: Request, res: Response) {
  res.json(await listInterviews(req.userId as string, req.params.id));
}
export async function scheduleInterviewController(req: Request, res: Response) {
  const input = scheduleInterviewSchema.parse(req.body);
  res.status(201).json(await scheduleInterview(req.userId as string, req.params.id, input));
}
export async function interviewActionController(req: Request, res: Response) {
  const payload = interviewActionSchema.parse(req.body);
  res.json(await interviewAction(req.userId as string, req.params.id, req.params.interviewId, payload));
}
