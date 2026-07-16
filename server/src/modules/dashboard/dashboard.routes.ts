import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { overviewController } from './dashboard.controller.js';

export const dashboardRoutes = Router();
dashboardRoutes.get('/overview', requireAuth, requireRole('admin'), asyncHandler(overviewController));
