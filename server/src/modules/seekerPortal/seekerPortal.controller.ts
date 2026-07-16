import type { Request, Response } from 'express';
import { getPortal } from './seekerPortal.service.js';

export async function portalController(req: Request, res: Response) {
  res.json(await getPortal(req.userId as string));
}
