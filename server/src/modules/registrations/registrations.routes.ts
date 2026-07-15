import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, getController, actionController,
} from './registrations.controller.js';

export const registrationRoutes = Router();
registrationRoutes.use(requireAuth);
registrationRoutes.get('/', asyncHandler(listController));
registrationRoutes.get('/:id', asyncHandler(getController));
registrationRoutes.post('/:id/action', asyncHandler(actionController));
