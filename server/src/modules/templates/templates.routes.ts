import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, createController, getController, patchController,
  cloneController, restoreController, deleteController,
} from './templates.controller.js';

export const templateRoutes = Router();
templateRoutes.use(requireAuth);
templateRoutes.get('/', asyncHandler(listController));
templateRoutes.post('/', asyncHandler(createController));
templateRoutes.post('/:id/clone', asyncHandler(cloneController));
templateRoutes.post('/:id/restore', asyncHandler(restoreController));
templateRoutes.get('/:id', asyncHandler(getController));
templateRoutes.patch('/:id', asyncHandler(patchController));
templateRoutes.delete('/:id', asyncHandler(deleteController));
