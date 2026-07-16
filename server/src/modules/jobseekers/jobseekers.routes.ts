import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  listController, createController, getController, patchController, bulkController, previewController, commitController,
} from './jobseekers.controller.js';

export const jobseekerRoutes = Router();
jobseekerRoutes.use(requireAuth);
jobseekerRoutes.use(requireRole('admin'));
jobseekerRoutes.get('/', asyncHandler(listController));
jobseekerRoutes.post('/', asyncHandler(createController));
jobseekerRoutes.post('/bulk', asyncHandler(bulkController));
jobseekerRoutes.post('/import/preview', asyncHandler(previewController));
jobseekerRoutes.post('/import/commit', asyncHandler(commitController));
jobseekerRoutes.get('/:id', asyncHandler(getController));
jobseekerRoutes.patch('/:id', asyncHandler(patchController));
