import type { Request, Response } from 'express';
import { upsertOfferSchema } from './employerOffers.schemas.js';
import { upsertOffer } from './employerOffers.service.js';

export async function upsertOfferController(req: Request, res: Response) {
  const input = upsertOfferSchema.parse(req.body);
  res.json(await upsertOffer(req.userId as string, req.params.id, req.params.jobseekerId, input));
}
