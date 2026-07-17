import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  listController, createController, getController, patchController, deleteController,
} from './slots.controller.js';
import {
  rosterController, eligibleController, createBookingController, confirmBookingController, releaseBookingController,
} from '../slotBookings/slotBookings.controller.js';

export const slotRoutes = Router();
slotRoutes.use(requireAuth);
slotRoutes.use(requireRole('admin'));
slotRoutes.get('/', asyncHandler(listController));
slotRoutes.post('/', asyncHandler(createController));
slotRoutes.get('/:id/bookings', asyncHandler(rosterController));
slotRoutes.get('/:id/eligible-candidates', asyncHandler(eligibleController));
slotRoutes.post('/:id/bookings', asyncHandler(createBookingController));
slotRoutes.patch('/:id/bookings/:bookingId', asyncHandler(confirmBookingController));
slotRoutes.delete('/:id/bookings/:bookingId', asyncHandler(releaseBookingController));
slotRoutes.get('/:id', asyncHandler(getController));
slotRoutes.patch('/:id', asyncHandler(patchController));
slotRoutes.delete('/:id', asyncHandler(deleteController));
