import type { Request, Response } from 'express';
import { createTemplateSchema, updateTemplateSchema, restoreSchema, listQuerySchema } from './templates.schemas.js';
import {
  listTemplates, getTemplate, createTemplate, updateTemplate,
  cloneTemplate, restoreTemplate, deleteTemplate,
} from './templates.service.js';

export async function listController(req: Request, res: Response) {
  res.json(await listTemplates(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createTemplate(createTemplateSchema.parse(req.body)));
}
export async function getController(req: Request, res: Response) {
  res.json(await getTemplate(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateTemplate(req.params.id, updateTemplateSchema.parse(req.body)));
}
export async function cloneController(req: Request, res: Response) {
  res.status(201).json(await cloneTemplate(req.params.id));
}
export async function restoreController(req: Request, res: Response) {
  res.json(await restoreTemplate(req.params.id, restoreSchema.parse(req.body).v));
}
export async function deleteController(req: Request, res: Response) {
  res.json(await deleteTemplate(req.params.id));
}
