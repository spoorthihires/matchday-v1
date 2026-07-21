import type { Request, Response } from 'express';
import { reportsQuerySchema } from './employerReports.schemas.js';
import { getReport } from './employerReports.service.js';

export async function reportsController(req: Request, res: Response) {
  const { driveId } = reportsQuerySchema.parse(req.query);
  res.json(await getReport(req.userId as string, driveId));
}
