import type { Request, Response } from 'express';
import { streamRulesSchema } from './stream-rules.schemas.js';
import { getStreamRules, saveStreamRules } from './service.js';

export async function getController(_req: Request, res: Response) {
  res.json(await getStreamRules());
}
export async function putController(req: Request, res: Response) {
  res.json(await saveStreamRules(streamRulesSchema.parse(req.body)));
}
