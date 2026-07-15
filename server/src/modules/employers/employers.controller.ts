import type { Request, Response } from 'express';
import { createEmployerSchema, updateEmployerSchema, listQuerySchema, bulkSchema } from './employers.schemas.js';
import {
  listEmployers, getEmployer, createEmployer, updateEmployer, bulkEmployerAction,
} from './employers.service.js';

const ACTOR = 'Platform Admin';

export async function listController(req: Request, res: Response) {
  res.json(await listEmployers(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createEmployer(createEmployerSchema.parse(req.body), ACTOR));
}
export async function getController(req: Request, res: Response) {
  res.json(await getEmployer(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateEmployer(req.params.id, updateEmployerSchema.parse(req.body), ACTOR));
}
export async function bulkController(req: Request, res: Response) {
  const { ids, action } = bulkSchema.parse(req.body);
  res.json(await bulkEmployerAction(ids, action, ACTOR));
}
