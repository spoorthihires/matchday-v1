import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { User } from '../../models/User.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Employer } from '../../models/Employer.js';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: { sub: string; role: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES as jwt.SignOptions['expiresIn'] });
}

export async function login(email: string, password: string) {
  const normalized = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalized });
  if (user) {
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid credentials', 'auth');
    const token = signToken({ sub: String(user._id), role: user.role });
    return { token, user: { id: String(user._id), name: user.name, email: user.email, role: user.role } };
  }

  const seeker = await Jobseeker.findOne({ email: normalized });
  if (seeker && seeker.passwordHash) {
    const ok = await verifyPassword(password, seeker.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid credentials', 'auth');
    const token = signToken({ sub: String(seeker._id), role: 'jobseeker' });
    return { token, user: { id: String(seeker._id), name: seeker.name, email: seeker.email ?? '', role: 'jobseeker' } };
  }

  const employer = await Employer.findOne({ email: normalized });
  if (employer && employer.passwordHash) {
    const ok = await verifyPassword(password, employer.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid credentials', 'auth');
    const token = signToken({ sub: String(employer._id), role: 'employer' });
    return { token, user: { id: String(employer._id), name: employer.name, email: employer.email ?? '', role: 'employer' } };
  }

  throw new HttpError(401, 'Invalid credentials', 'auth');
}

export async function employerSignup(input: {
  name: string; website?: string; industry: string; size?: string; hiringType?: string; workLocations?: string[];
  spoc: string; designation?: string; email: string; phone?: string; billingContact?: string; gstNumber?: string; password: string;
}) {
  const email = input.email.toLowerCase().trim();
  if (await Employer.findOne({ email })) throw new HttpError(400, 'An account with this email already exists', 'validation');
  const passwordHash = await hashPassword(input.password);
  const emp = await Employer.create({
    name: input.name, website: input.website ?? '', industry: input.industry, size: input.size ?? '51–200',
    hiringType: input.hiringType ?? '', workLocations: input.workLocations ?? [], spoc: input.spoc,
    designation: input.designation ?? '', email, phone: input.phone ?? '', billingContact: input.billingContact ?? '',
    gstNumber: input.gstNumber ?? '', status: 'Pending', passwordHash,
  });
  const token = signToken({ sub: String(emp._id), role: 'employer' });
  return { token, user: { id: String(emp._id), name: emp.name, email, role: 'employer' as const } };
}
