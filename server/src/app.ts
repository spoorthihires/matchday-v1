import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Route modules mounted in later tasks:
  // app.use('/api/auth', authRoutes);
  // app.use('/api/dashboard', dashboardRoutes);

  app.use(errorHandler);
  return app;
}
