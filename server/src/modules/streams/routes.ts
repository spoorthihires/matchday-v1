import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { listController, createController, getController, patchController, restoreController } from './controller.js';

export const streamRoutes = Router();
streamRoutes.use(requireAuth);
streamRoutes.get('/', asyncHandler(listController));
streamRoutes.post('/', asyncHandler(createController));
streamRoutes.post('/:id/restore', asyncHandler(restoreController));
streamRoutes.get('/:id', asyncHandler(getController));
streamRoutes.patch('/:id', asyncHandler(patchController));
