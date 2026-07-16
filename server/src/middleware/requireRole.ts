import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errorHandler.js';

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return next(new HttpError(403, 'Forbidden', 'forbidden'));
    }
    return next();
  };
}
