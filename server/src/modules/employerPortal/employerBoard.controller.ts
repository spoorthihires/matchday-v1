import type { Request, Response } from 'express';
import { getBoard, setStage } from './employerBoard.service.js';
import { setStageSchema } from './employerBoard.schemas.js';

export async function boardController(req: Request, res: Response) {
  res.json(await getBoard(req.userId as string, req.params.id));
}

export async function setStageController(req: Request, res: Response) {
  const { stage } = setStageSchema.parse(req.body);
  res.json(await setStage(req.userId as string, req.params.id, req.params.jobseekerId, stage));
}
