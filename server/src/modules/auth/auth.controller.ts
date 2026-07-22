import type { Request, Response } from 'express';
import { z } from 'zod';
import { login, employerSignup, jobseekerSignup, listPublicInstitutes } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginController(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const result = await login(email, password);
  res.json(result);
}

const employerSignupSchema = z.object({
  name: z.string().trim().min(1), website: z.string().trim().optional(),
  industry: z.string().trim().min(1), size: z.string().optional(), hiringType: z.string().optional(),
  workLocations: z.array(z.string()).optional(), spoc: z.string().trim().min(1), designation: z.string().optional(),
  email: z.string().email(), phone: z.string().optional(), billingContact: z.string().optional(),
  gstNumber: z.string().optional(), acceptTerms: z.literal(true), acceptPrivacy: z.literal(true),
  password: z.string().min(6),
});

export async function employerSignupController(req: Request, res: Response) {
  const parsed = employerSignupSchema.parse(req.body);
  res.status(201).json(await employerSignup(parsed));
}

const jobseekerSignupSchema = z.object({
  name: z.string().trim().min(1), email: z.string().email(), password: z.string().min(8),
  instituteId: z.string().min(1), branch: z.string().trim().min(1), gradYear: z.number().int(),
  source: z.string().trim().min(1), cgpa: z.number().min(0).max(10),
});

export async function jobseekerSignupController(req: Request, res: Response) {
  const parsed = jobseekerSignupSchema.parse(req.body);
  res.json(await jobseekerSignup(parsed));
}

export async function institutesController(_req: Request, res: Response) {
  res.json(await listPublicInstitutes());
}
