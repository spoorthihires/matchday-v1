import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  listController, createController, getController, patchController, bulkController,
} from './employers.controller.js';

export const employerRoutes = Router();
employerRoutes.use(requireAuth);
employerRoutes.use(requireRole('admin'));
employerRoutes.get('/', asyncHandler(listController));
employerRoutes.post('/', asyncHandler(createController));
employerRoutes.post('/bulk', asyncHandler(bulkController));
employerRoutes.get('/:id', asyncHandler(getController));
employerRoutes.patch('/:id', asyncHandler(patchController));
