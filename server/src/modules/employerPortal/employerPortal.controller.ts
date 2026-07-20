import type { Request, Response } from 'express';
import { z } from 'zod';
import { getEmployerPortal, listEmployerDrives, getEmployerDrive } from './employerPortal.service.js';

export async function employerPortalController(req: Request, res: Response) {
  res.json(await getEmployerPortal(req.userId as string));
}

const drivesQuerySchema = z.object({ q: z.string().optional(), domain: z.string().optional() });

export async function employerDrivesController(req: Request, res: Response) {
  res.json(await listEmployerDrives(drivesQuerySchema.parse(req.query)));
}

export async function employerDriveController(req: Request, res: Response) {
  res.json(await getEmployerDrive(req.params.id));
}
