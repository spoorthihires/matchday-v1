import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { loginController, employerSignupController } from './auth.controller.js';

export const authRoutes = Router();
authRoutes.post('/login', asyncHandler(loginController));
authRoutes.post('/employer-signup', asyncHandler(employerSignupController));
