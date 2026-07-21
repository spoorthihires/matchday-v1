import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  employerPortalController, employerDrivesController, employerDriveController, createEmployerRegistrationController,
  employerRegistrationsController, employerRegistrationController, employerSlotsController, createEmployerSlotController,
  updateEmployerSlotController, deleteEmployerSlotController,
} from './employerPortal.controller.js';
import { candidatesController, passportController, decisionController, noteController } from './employerCandidates.controller.js';
import { requestRevealController, remindRevealController, withdrawRevealController } from './employerConsent.controller.js';
import { bulkDecisionController, shortlistPackController } from './employerShortlist.controller.js';

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
employerPortalRoutes.get('/employer/drives/:id/candidates/:jobseekerId', asyncHandler(passportController));
employerPortalRoutes.put('/employer/drives/:id/candidates/:jobseekerId/decision', asyncHandler(decisionController));
employerPortalRoutes.post('/employer/drives/:id/candidates/:jobseekerId/notes', asyncHandler(noteController));
employerPortalRoutes.post('/employer/drives/:id/candidates/:jobseekerId/reveal-request', asyncHandler(requestRevealController));
employerPortalRoutes.post('/employer/drives/:id/candidates/:jobseekerId/reveal-request/remind', asyncHandler(remindRevealController));
employerPortalRoutes.delete('/employer/drives/:id/candidates/:jobseekerId/reveal-request', asyncHandler(withdrawRevealController));
employerPortalRoutes.post('/employer/drives/:id/candidates/bulk-decision', asyncHandler(bulkDecisionController));
employerPortalRoutes.get('/employer/drives/:id/shortlist/pack', asyncHandler(shortlistPackController));
employerPortalRoutes.get('/employer', asyncHandler(employerPortalController));
