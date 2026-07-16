import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { getController, putController } from './controller.js';

export const streamRulesRoutes = Router();
streamRulesRoutes.use(requireAuth);
streamRulesRoutes.use(requireRole('admin'));
streamRulesRoutes.get('/', asyncHandler(getController));
streamRulesRoutes.put('/', asyncHandler(putController));
