import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('GET /api/dashboard/overview', () => {
  it('401s without a token', async () => {
    const res = await request(createApp()).get('/api/dashboard/overview');
    expect(res.status).toBe(401);
  });

  it('200s with a valid token and returns the DTO shape', async () => {
    await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering' });
    const token = signToken({ sub: 'u1', role: 'admin' });
    const res = await request(createApp())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('readiness.score');
    expect(Array.isArray(res.body.kpis)).toBe(true);
    expect(res.body).toHaveProperty('funnels.supply');
    expect(res.body).toHaveProperty('slotUtilization.total');
    expect(res.body).toHaveProperty('leaderboards.institutes');
  });
});
