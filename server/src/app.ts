import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { driveRoutes } from './modules/drives/drives.routes.js';
import { employerRoutes } from './modules/employers/employers.routes.js';
import { instituteRoutes } from './modules/institutes/institutes.routes.js';
import { jobseekerRoutes } from './modules/jobseekers/jobseekers.routes.js';
import { registrationRoutes } from './modules/registrations/registrations.routes.js';

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Route modules mounted in later tasks:
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/drives', driveRoutes);
  app.use('/api/employers', employerRoutes);
  app.use('/api/institutes', instituteRoutes);
  app.use('/api/jobseekers', jobseekerRoutes);
  app.use('/api/registrations', registrationRoutes);

  app.use(errorHandler);
  return app;
}
