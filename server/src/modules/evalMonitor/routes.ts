import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { monitorController } from './controller.js';

export const evalMonitorRoutes = Router();
evalMonitorRoutes.use(requireAuth);
evalMonitorRoutes.get('/', asyncHandler(monitorController));
