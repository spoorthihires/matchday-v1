import type { Request, Response } from 'express';
import { createInstituteSchema, updateInstituteSchema, listQuerySchema, bulkSchema, pageQuerySchema } from './institutes.schemas.js';
import {
  listInstitutes, getInstitute, createInstitute, updateInstitute, bulkInstituteAction, listCandidates, listAudit,
} from './institutes.service.js';

const ACTOR = 'Platform Admin';

export async function listController(req: Request, res: Response) {
  res.json(await listInstitutes(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createInstitute(createInstituteSchema.parse(req.body), ACTOR));
}
export async function getController(req: Request, res: Response) {
  res.json(await getInstitute(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateInstitute(req.params.id, updateInstituteSchema.parse(req.body), ACTOR));
}
export async function bulkController(req: Request, res: Response) {
  const { ids, action } = bulkSchema.parse(req.body);
  res.json(await bulkInstituteAction(ids, action, ACTOR));
}
export async function candidatesController(req: Request, res: Response) {
  const { page, limit } = pageQuerySchema.parse(req.query);
  res.json(await listCandidates(req.params.id, page, limit));
}
export async function auditController(req: Request, res: Response) {
  const { page, limit } = pageQuerySchema.parse(req.query);
  res.json(await listAudit(req.params.id, page, limit));
}
