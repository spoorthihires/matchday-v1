import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { message: 'Invalid request', code: 'validation' } });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { message: 'Internal server error', code: 'internal' } });
}
