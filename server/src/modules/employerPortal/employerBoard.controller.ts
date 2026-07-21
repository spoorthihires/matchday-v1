import type { Request, Response } from 'express';
import { getBoard } from './employerBoard.service.js';

export async function boardController(req: Request, res: Response) {
  res.json(await getBoard(req.userId as string, req.params.id));
}
