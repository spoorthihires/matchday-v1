import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { monitorController } from './controller.js';

export const evalMonitorRoutes = Router();
evalMonitorRoutes.use(requireAuth);
evalMonitorRoutes.use(requireRole('admin'));
evalMonitorRoutes.get('/', asyncHandler(monitorController));
