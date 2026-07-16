import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function makeSeeker() {
  const inst = await Institute.create({ name: 'CBIT', city: 'Hyd', type: 'Engineering College' });
  return Jobseeker.create({
    name: 'Aarav', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8,
    source: 'Campus', stage: 'Applied',
  });
}

describe('GET /api/me/portal', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/me/portal')).status).toBe(401);
  });

  it('403s for an admin token', async () => {
    const res = await request(createApp()).get('/api/me/portal')
      .set('Authorization', `Bearer ${signToken({ sub: 'admin1', role: 'admin' })}`);
    expect(res.status).toBe(403);
  });

  it('returns the portal for a jobseeker token', async () => {
    const seeker = await makeSeeker();
    const res = await request(createApp()).get('/api/me/portal')
      .set('Authorization', `Bearer ${signToken({ sub: String(seeker._id), role: 'jobseeker' })}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ name: 'Aarav', branch: 'CSE' });
    expect(res.body.journey.stage).toBe('Applied');
    expect(Array.isArray(res.body.drives)).toBe(true);
  });
});
