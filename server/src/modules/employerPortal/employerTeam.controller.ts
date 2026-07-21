import type { Request, Response } from 'express';
import { addMemberSchema, updateMemberSchema } from './employerTeam.schemas.js';
import { listTeam, addTeamMember, updateTeamMember, removeTeamMember } from './employerTeam.service.js';

export async function teamListController(req: Request, res: Response) {
  res.json(await listTeam(req.userId as string, req.memberId));
}
export async function addTeamMemberController(req: Request, res: Response) {
  const input = addMemberSchema.parse(req.body);
  res.status(201).json(await addTeamMember(req.userId as string, req.memberId, input));
}
export async function updateTeamMemberController(req: Request, res: Response) {
  const input = updateMemberSchema.parse(req.body);
  res.json(await updateTeamMember(req.userId as string, req.memberId, req.params.memberId, input));
}
export async function removeTeamMemberController(req: Request, res: Response) {
  res.json(await removeTeamMember(req.userId as string, req.memberId, req.params.memberId));
}
