import type { Request, Response } from 'express';
import { createSupportSchema } from './employerSupport.schemas.js';
import { createSupportRequest, listSupportRequests } from './employerSupport.service.js';

export async function createSupportController(req: Request, res: Response) {
  const input = createSupportSchema.parse(req.body);
  res.status(201).json(await createSupportRequest(req.userId as string, input));
}
export async function supportListController(req: Request, res: Response) {
  res.json(await listSupportRequests(req.userId as string));
}
