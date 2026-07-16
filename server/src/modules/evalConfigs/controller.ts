import type { Request, Response } from 'express';
import { createEvalConfigSchema, updateEvalConfigSchema, listQuerySchema } from './eval-configs.schemas.js';
import {
  listEvalConfigs, getEvalConfig, createEvalConfig, updateEvalConfig,
  duplicateEvalConfig, deleteEvalConfig,
} from './service.js';

export async function listController(req: Request, res: Response) {
  res.json(await listEvalConfigs(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createEvalConfig(createEvalConfigSchema.parse(req.body)));
}
export async function getController(req: Request, res: Response) {
  res.json(await getEvalConfig(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateEvalConfig(req.params.id, updateEvalConfigSchema.parse(req.body)));
}
export async function duplicateController(req: Request, res: Response) {
  res.status(201).json(await duplicateEvalConfig(req.params.id));
}
export async function deleteController(req: Request, res: Response) {
  res.json(await deleteEvalConfig(req.params.id));
}
