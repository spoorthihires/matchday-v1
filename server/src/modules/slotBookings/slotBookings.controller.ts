import type { Request, Response } from 'express';
import { createBookingSchema, confirmBookingSchema, eligibleQuerySchema } from './slotBookings.schemas.js';
import {
  createBooking, confirmBooking, releaseBooking, getSlotRoster, listEligibleCandidates,
} from './slotBookings.service.js';

export async function rosterController(req: Request, res: Response) {
  res.json(await getSlotRoster(req.params.id));
}
export async function eligibleController(req: Request, res: Response) {
  const { q } = eligibleQuerySchema.parse(req.query);
  res.json(await listEligibleCandidates(req.params.id, q));
}
export async function createBookingController(req: Request, res: Response) {
  const { jobseekerId, status } = createBookingSchema.parse(req.body);
  res.status(201).json(await createBooking(req.params.id, jobseekerId, status));
}
export async function confirmBookingController(req: Request, res: Response) {
  confirmBookingSchema.parse(req.body);
  res.json(await confirmBooking(req.params.id, req.params.bookingId));
}
export async function releaseBookingController(req: Request, res: Response) {
  res.json(await releaseBooking(req.params.id, req.params.bookingId));
}
