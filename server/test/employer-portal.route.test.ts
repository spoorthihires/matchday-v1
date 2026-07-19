import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('GET /api/me/employer', () => {
  it('401s without a token; 403s for a non-employer token', async () => {
    await Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x' });

    const noTok = await request(createApp()).get('/api/me/employer');
    expect(noTok.status).toBe(401);

    const asAdmin = await request(createApp()).get('/api/me/employer')
      .set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
    expect(asAdmin.status).toBe(403);
  });

  it('returns the employer profile + dashboard shape', async () => {
    const emp = await Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Pending', passwordHash: 'x' });
    const res = await request(createApp()).get('/api/me/employer')
      .set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'employer' })}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ name: 'Acme', status: 'Pending' });
    expect(res.body.profile).not.toHaveProperty('passwordHash');
    expect(res.body.dashboard).toHaveProperty('registrations');
  });
});
