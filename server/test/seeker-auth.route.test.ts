import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { Jobseeker, Types } from '../src/models/Jobseeker.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(async () => {
  await clearDb();
  await Jobseeker.create({
    name: 'Seeker One', instituteId: new Types.ObjectId(), branch: 'CSE', gradYear: 2026, cgpa: 8,
    source: 'Institutes', email: 'seeker@matchday.dev', passwordHash: await hashPassword('Seeker123!'),
  });
});

describe('POST /api/auth/login (jobseeker)', () => {
  it('logs in a jobseeker and returns a jobseeker-role token', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'seeker@matchday.dev', password: 'Seeker123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'seeker@matchday.dev', role: 'jobseeker' });
  });

  it('401s on the wrong seeker password', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'seeker@matchday.dev', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('auth');
  });

  it('401s for a jobseeker without a passwordHash', async () => {
    await Jobseeker.create({
      name: 'No Pass', instituteId: new Types.ObjectId(), branch: 'IT', gradYear: 2026, cgpa: 7,
      source: 'Campus', email: 'nopass@matchday.dev',
    });
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'nopass@matchday.dev', password: 'whatever' });
    expect(res.status).toBe(401);
  });
});
