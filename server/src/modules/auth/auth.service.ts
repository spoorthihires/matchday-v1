import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { User } from '../../models/User.js';
import { Jobseeker } from '../../models/Jobseeker.js';

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

  throw new HttpError(401, 'Invalid credentials', 'auth');
}
