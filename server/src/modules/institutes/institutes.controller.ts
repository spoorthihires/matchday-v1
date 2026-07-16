import type { Request, Response } from 'express';
import {
  createInstituteSchema, updateInstituteSchema, listQuerySchema, bulkSchema, pageQuerySchema,
  assignDrivesSchema, bulkAssignDrivesSchema,
} from './institutes.schemas.js';
import {
  listInstitutes, getInstitute, createInstitute, updateInstitute, bulkInstituteAction, listCandidates, listAudit,
  listInstituteDrives, assignDrives, unassignDrive, bulkAssignDrives,
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
export async function instituteDrivesController(req: Request, res: Response) {
  res.json(await listInstituteDrives(req.params.id));
}
export async function assignDrivesController(req: Request, res: Response) {
  res.json(await assignDrives(req.params.id, assignDrivesSchema.parse(req.body).driveIds));
}
export async function unassignDriveController(req: Request, res: Response) {
  res.json(await unassignDrive(req.params.id, req.params.driveId));
}
export async function bulkAssignDrivesController(req: Request, res: Response) {
  const { instituteIds, driveIds } = bulkAssignDrivesSchema.parse(req.body);
  res.json(await bulkAssignDrives(instituteIds, driveIds));
}
