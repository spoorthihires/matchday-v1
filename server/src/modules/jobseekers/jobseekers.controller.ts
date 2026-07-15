import type { Request, Response } from 'express';
import { z } from 'zod';
import { createJobseekerSchema, updateJobseekerSchema, listQuerySchema, bulkSchema } from './jobseekers.schemas.js';
import { listJobseekers, addJobseeker, getJobseeker, updateJobseeker, blockJobseekers } from './jobseekers.service.js';
import { previewImport, commitImport } from './jobseekers.import.js';

const rowsSchema = z.object({ rows: z.array(z.record(z.unknown())).max(5000) });

export async function listController(req: Request, res: Response) {
  res.json(await listJobseekers(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await addJobseeker(createJobseekerSchema.parse(req.body)));
}
export async function getController(req: Request, res: Response) {
  res.json(await getJobseeker(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateJobseeker(req.params.id, updateJobseekerSchema.parse(req.body)));
}
export async function bulkController(req: Request, res: Response) {
  const { ids } = bulkSchema.parse(req.body);
  res.json(await blockJobseekers(ids));
}
export async function previewController(req: Request, res: Response) {
  const { rows } = rowsSchema.parse(req.body);
  res.json(await previewImport(rows as never));
}
export async function commitController(req: Request, res: Response) {
  const { rows } = rowsSchema.parse(req.body);
  res.json(await commitImport(rows as never));
}
