import type { Request, Response } from 'express';
import { getPortal, listInterviews, listOffers, listRevealRequests, respondOffer, respondReveal } from './seekerPortal.service.js';
import { respondOfferSchema, respondSchema } from './seekerPortal.schemas.js';

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

export async function interviewsController(req: Request, res: Response) { res.json(await listInterviews(req.userId as string)); }
export async function offersController(req: Request, res: Response) { res.json(await listOffers(req.userId as string)); }
export async function respondOfferController(req: Request, res: Response) {
  const input = respondOfferSchema.parse(req.body);
  res.json(await respondOffer(req.userId as string, req.params.applicationId, input));
}
