import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { portalController } from './seekerPortal.controller.js';

export const seekerPortalRoutes = Router();
seekerPortalRoutes.use(requireAuth);
seekerPortalRoutes.use(requireRole('jobseeker'));
seekerPortalRoutes.get('/portal', asyncHandler(portalController));
