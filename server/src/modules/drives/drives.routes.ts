import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, createController, getController, patchController, cloneController, bulkController,
} from './drives.controller.js';

export const driveRoutes = Router();
driveRoutes.use(requireAuth);
driveRoutes.get('/', asyncHandler(listController));
driveRoutes.post('/', asyncHandler(createController));
driveRoutes.post('/bulk', asyncHandler(bulkController));
driveRoutes.get('/:id', asyncHandler(getController));
driveRoutes.patch('/:id', asyncHandler(patchController));
driveRoutes.post('/:id/clone', asyncHandler(cloneController));
