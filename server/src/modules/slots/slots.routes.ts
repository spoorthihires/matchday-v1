import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  listController, createController, getController, patchController, deleteController,
} from './slots.controller.js';

export const slotRoutes = Router();
slotRoutes.use(requireAuth);
slotRoutes.use(requireRole('admin'));
slotRoutes.get('/', asyncHandler(listController));
slotRoutes.post('/', asyncHandler(createController));
slotRoutes.get('/:id', asyncHandler(getController));
slotRoutes.patch('/:id', asyncHandler(patchController));
slotRoutes.delete('/:id', asyncHandler(deleteController));
