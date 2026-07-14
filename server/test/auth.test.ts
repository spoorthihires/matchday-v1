import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { User } from '../src/models/User.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(async () => {
  await clearDb();
  await User.create({
    email: 'admin@matchday.dev', name: 'Platform Admin', role: 'admin',
    passwordHash: await hashPassword('Password123!'),
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token and user for valid credentials', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'admin@matchday.dev', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'admin@matchday.dev', role: 'admin' });
  });

  it('401s on wrong password', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'admin@matchday.dev', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('auth');
  });

  it('400s on malformed body', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });
});
