import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const adminAuth = `Bearer ${signToken({ sub: 'a1', role: 'admin' })}`;
const seekerAuth = `Bearer ${signToken({ sub: 's1', role: 'jobseeker' })}`;

describe('admin role guard', () => {
  it('blocks a jobseeker token from a router-level admin route', async () => {
    const res = await request(createApp()).get('/api/jobseekers').set('Authorization', seekerAuth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('blocks a jobseeker token from the per-route dashboard guard', async () => {
    const res = await request(createApp()).get('/api/dashboard/overview').set('Authorization', seekerAuth);
    expect(res.status).toBe(403);
  });

  it('allows an admin token through the admin route', async () => {
    const res = await request(createApp()).get('/api/jobseekers').set('Authorization', adminAuth);
    expect(res.status).toBe(200);
  });
});
