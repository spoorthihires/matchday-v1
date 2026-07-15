import type { Request, Response } from 'express';
import { actionSchema, listQuerySchema } from './registrations.schemas.js';
import {
  listRegistrations, getRegistration, applyAction,
} from './registrations.service.js';

const ACTOR = 'Platform Admin';

export async function listController(req: Request, res: Response) {
  const { status } = listQuerySchema.parse(req.query);
  res.json(await listRegistrations(status));
}
export async function getController(req: Request, res: Response) {
  res.json(await getRegistration(req.params.id));
}
export async function actionController(req: Request, res: Response) {
  res.json(await applyAction(req.params.id, actionSchema.parse(req.body), ACTOR));
}
