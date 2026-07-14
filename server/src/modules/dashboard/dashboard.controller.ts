import type { Request, Response } from 'express';
import { getOverview } from './dashboard.service.js';

export async function overviewController(_req: Request, res: Response) {
  const overview = await getOverview();
  res.json(overview);
}
