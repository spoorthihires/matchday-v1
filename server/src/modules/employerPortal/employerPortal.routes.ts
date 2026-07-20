import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  employerPortalController, employerDrivesController, employerDriveController, createEmployerRegistrationController,
  employerRegistrationsController, employerRegistrationController, employerSlotsController, createEmployerSlotController,
  updateEmployerSlotController, deleteEmployerSlotController,
} from './employerPortal.controller.js';
import { candidatesController } from './employerCandidates.controller.js';

// Scoped to the '/employer' path (not a bare `.use()`) because this router
// shares the '/api/me' mount prefix with seekerPortalRoutes, which gates
// ALL sub-paths under that prefix via its own unscoped `.use(requireRole('jobseeker'))`.
// An unscoped `.use()` here would symmetrically clobber seekerPortalRoutes'
// '/portal' route (and vice versa) regardless of mount order.
export const employerPortalRoutes = Router();
employerPortalRoutes.use('/employer', requireAuth, requireRole('employer'));
employerPortalRoutes.get('/employer/drives', asyncHandler(employerDrivesController));
employerPortalRoutes.get('/employer/drives/:id', asyncHandler(employerDriveController));
employerPortalRoutes.post('/employer/registrations', asyncHandler(createEmployerRegistrationController));
employerPortalRoutes.get('/employer/registrations', asyncHandler(employerRegistrationsController));
employerPortalRoutes.get('/employer/registrations/:id', asyncHandler(employerRegistrationController));
employerPortalRoutes.get('/employer/drives/:id/slots', asyncHandler(employerSlotsController));
employerPortalRoutes.post('/employer/drives/:id/slots', asyncHandler(createEmployerSlotController));
employerPortalRoutes.patch('/employer/drives/:id/slots/:slotId', asyncHandler(updateEmployerSlotController));
employerPortalRoutes.delete('/employer/drives/:id/slots/:slotId', asyncHandler(deleteEmployerSlotController));
employerPortalRoutes.get('/employer/drives/:id/candidates', asyncHandler(candidatesController));
employerPortalRoutes.get('/employer', asyncHandler(employerPortalController));
