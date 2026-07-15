import type { Request, Response } from 'express';
import { z } from 'zod';
import { createDriveSchema, draftDriveSchema, updateDriveSchema, listQuerySchema } from './drives.schemas.js';
import { listDrives, createDrive, getDrive, updateDrive, cloneDrive, bulkAction } from './drives.service.js';

const CREATED_BY = 'Platform Admin';

export async function listController(req: Request, res: Response) {
  const params = listQuerySchema.parse(req.query);
  res.json(await listDrives(params));
}
export async function createController(req: Request, res: Response) {
  const isDraft = (req.body?.status ?? 'Draft') === 'Draft';
  const input = (isDraft ? draftDriveSchema : createDriveSchema).parse(req.body);
  res.status(201).json(await createDrive(input, CREATED_BY));
}
export async function getController(req: Request, res: Response) {
  res.json(await getDrive(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  const patch = updateDriveSchema.parse(req.body);
  res.json(await updateDrive(req.params.id, patch));
}
export async function cloneController(req: Request, res: Response) {
  res.status(201).json(await cloneDrive(req.params.id));
}
const bulkSchema = z.object({ ids: z.array(z.string()).min(1), action: z.enum(['publish', 'clone', 'archive']) });
export async function bulkController(req: Request, res: Response) {
  const { ids, action } = bulkSchema.parse(req.body);
  res.json(await bulkAction(ids, action));
}
