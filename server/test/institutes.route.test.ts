import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
const body = { name: 'CBIT', type: 'Engineering College', city: 'Hyderabad', owner: 'Sharath P.', email: 'spoc@cbit.edu' };

describe('institutes routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/institutes')).status).toBe(401);
  });
  it('creates then lists with overview', async () => {
    const c = await auth(request(createApp()).post('/api/institutes').send(body));
    expect(c.status).toBe(201);
    expect(c.body.status).toBe('Pending');
    const list = await auth(request(createApp()).get('/api/institutes'));
    expect(list.body.total).toBe(1);
    expect(list.body.overview.total).toBe(1);
    expect(list.body.items[0].uploaded).toBe(0);
  });
  it('400s on invalid create (bad email) and on bulk action "assign"', async () => {
    const bad = await auth(request(createApp()).post('/api/institutes').send({ ...body, email: 'nope' }));
    expect(bad.status).toBe(400);
    const c = await auth(request(createApp()).post('/api/institutes').send(body));
    const asg = await auth(request(createApp()).post('/api/institutes/bulk').send({ ids: [c.body._id], action: 'assign' }));
    expect(asg.status).toBe(400);
  });
  it('patch approve + detail + candidates + audit + 404', async () => {
    const c = await auth(request(createApp()).post('/api/institutes').send(body));
    const id = c.body._id;
    const pub = await auth(request(createApp()).patch(`/api/institutes/${id}`).send({ status: 'Active' }));
    expect(pub.body.status).toBe('Active');
    const det = await auth(request(createApp()).get(`/api/institutes/${id}`));
    expect(det.body).toHaveProperty('funnel.uploaded', 0);
    expect(det.body).toHaveProperty('performance');
    const cand = await auth(request(createApp()).get(`/api/institutes/${id}/candidates`));
    expect(cand.body.total).toBe(0);
    const aud = await auth(request(createApp()).get(`/api/institutes/${id}/audit`));
    expect(aud.body.total).toBeGreaterThanOrEqual(1);
    const miss = await auth(request(createApp()).get('/api/institutes/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
