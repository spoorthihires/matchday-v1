import type { Request, Response } from 'express';
import { changePassword, getAccount, getPortal, listInterviews, listOffers, listRevealRequests, respondOffer, respondReveal, updateAccount } from './seekerPortal.service.js';
import { changePasswordSchema, respondOfferSchema, respondSchema, updateAccountSchema } from './seekerPortal.schemas.js';

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

export async function accountController(req: Request, res: Response) {
  res.json(await getAccount(req.userId as string));
}

export async function updateAccountController(req: Request, res: Response) {
  const input = updateAccountSchema.parse(req.body);
  res.json(await updateAccount(req.userId as string, input));
}

export async function changePasswordController(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  res.json(await changePassword(req.userId as string, input));
}
