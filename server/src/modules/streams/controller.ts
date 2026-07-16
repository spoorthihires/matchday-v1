import type { Request, Response } from 'express';
import { createStreamSchema, updateStreamSchema, restoreSchema, listQuerySchema } from './streams.schemas.js';
import { listStreams, getStream, createStream, updateStream, restoreStream } from './service.js';

export async function listController(req: Request, res: Response) {
  res.json(await listStreams(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createStream(createStreamSchema.parse(req.body)));
}
export async function getController(req: Request, res: Response) {
  res.json(await getStream(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateStream(req.params.id, updateStreamSchema.parse(req.body)));
}
export async function restoreController(req: Request, res: Response) {
  res.json(await restoreStream(req.params.id, restoreSchema.parse(req.body).v));
}
