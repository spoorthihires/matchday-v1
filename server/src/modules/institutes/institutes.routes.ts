import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, createController, getController, patchController, bulkController, candidatesController, auditController,
} from './institutes.controller.js';

export const instituteRoutes = Router();
instituteRoutes.use(requireAuth);
instituteRoutes.get('/', asyncHandler(listController));
instituteRoutes.post('/', asyncHandler(createController));
instituteRoutes.post('/bulk', asyncHandler(bulkController));
instituteRoutes.get('/:id/candidates', asyncHandler(candidatesController));
instituteRoutes.get('/:id/audit', asyncHandler(auditController));
instituteRoutes.get('/:id', asyncHandler(getController));
instituteRoutes.patch('/:id', asyncHandler(patchController));
