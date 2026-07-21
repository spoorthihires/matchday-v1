import type { Request, Response } from 'express';
import { getPortal, listRevealRequests, respondReveal } from './seekerPortal.service.js';
import { respondSchema } from './seekerPortal.schemas.js';

export async function portalController(req: Request, res: Response) {
  res.json(await getPortal(req.userId as string));
}

export async function revealRequestsController(req: Request, res: Response) {
  res.json(await listRevealRequests(req.userId as string));
}

export async function respondRevealController(req: Request, res: Response) {
  const { decision } = respondSchema.parse(req.body);
  res.json(await respondReveal(req.userId as string, req.params.applicationId, decision));
}
