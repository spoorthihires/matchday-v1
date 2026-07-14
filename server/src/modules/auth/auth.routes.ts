import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { loginController } from './auth.controller.js';

export const authRoutes = Router();
authRoutes.post('/login', asyncHandler(loginController));
