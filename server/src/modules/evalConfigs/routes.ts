import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, createController, getController, patchController,
  duplicateController, deleteController,
} from './controller.js';

export const evalConfigRoutes = Router();
evalConfigRoutes.use(requireAuth);
evalConfigRoutes.get('/', asyncHandler(listController));
evalConfigRoutes.post('/', asyncHandler(createController));
evalConfigRoutes.post('/:id/duplicate', asyncHandler(duplicateController));
evalConfigRoutes.get('/:id', asyncHandler(getController));
evalConfigRoutes.patch('/:id', asyncHandler(patchController));
evalConfigRoutes.delete('/:id', asyncHandler(deleteController));
