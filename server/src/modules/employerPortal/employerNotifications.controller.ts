import type { Request, Response } from 'express';
import { buildNotifications, markNotificationsRead } from './employerNotifications.service.js';

export async function notificationsController(req: Request, res: Response) {
  res.json(await buildNotifications(req.userId as string));
}
export async function markNotificationsReadController(req: Request, res: Response) {
  res.json(await markNotificationsRead(req.userId as string));
}
