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
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);

describe('eval-monitor route', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/eval-monitor')).status).toBe(401);
  });
  it('returns candidates + filter option lists', async () => {
    const i = await Institute.create({ name: 'VNR', city: 'Hyderabad', type: 'Engineering', status: 'Active' });
    await Jobseeker.create({ name: 'A B', instituteId: i._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', stage: 'MatchReady', profileCompleted: true, evaluationStatus: 'completed' });
    const res = await auth(request(createApp()).get('/api/eval-monitor'));
    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0].stage).toBe(9);
    expect(res.body.contests).toHaveLength(4);
    expect(res.body.institutes).toContain('VNR');
  });
});
