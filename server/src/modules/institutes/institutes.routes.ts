import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  listController, createController, getController, patchController, bulkController, candidatesController, auditController,
} from './institutes.controller.js';

export const instituteRoutes = Router();
instituteRoutes.use(requireAuth);
instituteRoutes.use(requireRole('admin'));
instituteRoutes.get('/', asyncHandler(listController));
instituteRoutes.post('/', asyncHandler(createController));
instituteRoutes.post('/bulk', asyncHandler(bulkController));
instituteRoutes.get('/:id/candidates', asyncHandler(candidatesController));
instituteRoutes.get('/:id/audit', asyncHandler(auditController));
instituteRoutes.get('/:id', asyncHandler(getController));
instituteRoutes.patch('/:id', asyncHandler(patchController));
