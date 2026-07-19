import type { Request, Response } from 'express';
import { getEmployerPortal } from './employerPortal.service.js';

export async function employerPortalController(req: Request, res: Response) {
  res.json(await getEmployerPortal(req.userId as string));
}
