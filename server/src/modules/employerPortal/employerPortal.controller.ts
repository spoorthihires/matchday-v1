import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  getEmployerPortal, listEmployerDrives, getEmployerDrive, createEmployerRegistration,
  listEmployerRegistrations, getEmployerRegistration, listEmployerSlots, createEmployerSlot,
} from './employerPortal.service.js';
import { createRegistrationSchema, createSlotSchema } from './employerPortal.schemas.js';

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

export async function createEmployerRegistrationController(req: Request, res: Response) {
  const parsed = createRegistrationSchema.parse(req.body);
  const result = await createEmployerRegistration(req.userId as string, parsed);
  res.status(201).json(result);
}

export async function employerRegistrationsController(req: Request, res: Response) {
  res.json(await listEmployerRegistrations(req.userId as string));
}

export async function employerRegistrationController(req: Request, res: Response) {
  res.json(await getEmployerRegistration(req.userId as string, req.params.id));
}

export async function employerSlotsController(req: Request, res: Response) {
  res.json(await listEmployerSlots(req.userId as string, req.params.id));
}
export async function createEmployerSlotController(req: Request, res: Response) {
  const parsed = createSlotSchema.parse(req.body);
  res.status(201).json(await createEmployerSlot(req.userId as string, req.params.id, parsed));
}
