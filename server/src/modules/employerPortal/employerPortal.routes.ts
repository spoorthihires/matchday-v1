import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  employerPortalController, employerDrivesController, employerDriveController, createEmployerRegistrationController,
} from './employerPortal.controller.js';

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
employerPortalRoutes.get('/employer', asyncHandler(employerPortalController));
