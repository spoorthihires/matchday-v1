import type { Request, Response } from 'express';
import { createSlotSchema, updateSlotSchema, listQuerySchema } from './slots.schemas.js';
import {
  listSlots, getSlot, createSlot, updateSlot, deleteSlot,
} from './slots.service.js';

const ACTOR = 'Platform Admin';

export async function listController(req: Request, res: Response) {
  res.json(await listSlots(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createSlot(createSlotSchema.parse(req.body)));
}
export async function getController(req: Request, res: Response) {
  res.json(await getSlot(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateSlot(req.params.id, updateSlotSchema.parse(req.body)));
}
export async function deleteController(req: Request, res: Response) {
  res.json(await deleteSlot(req.params.id));
}
