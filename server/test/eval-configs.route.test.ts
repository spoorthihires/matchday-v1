import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
const body = { name: 'Standard MCQ round', type: 'MCQ', passing: 60, attempts: 2, retake: 'After cooldown', cooldown: 2, validity: 90, autoQual: true, threshold: 70 };

describe('eval-configs routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/eval-configs')).status).toBe(401);
  });
  it('creates (201), lists+filters, duplicates, patches, deletes; 400 bad type; 404 unknown', async () => {
    const c = await auth(request(createApp()).post('/api/eval-configs').send(body));
    expect(c.status).toBe(201);
    expect(c.body.contests).toBe(0);
    const id = c.body._id;
    const list = await auth(request(createApp()).get('/api/eval-configs?type=MCQ'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].code).toMatch(/^EVC-/);
    const dup = await auth(request(createApp()).post(`/api/eval-configs/${id}/duplicate`));
    expect(dup.status).toBe(201);
    expect(dup.body.name).toBe('Standard MCQ round (Copy)');
    expect(dup.body.enabled).toBe(false);
    const patched = await auth(request(createApp()).patch(`/api/eval-configs/${id}`).send({ enabled: false }));
    expect(patched.body.enabled).toBe(false);
    const bad = await auth(request(createApp()).post('/api/eval-configs').send({ ...body, type: 'Nope' }));
    expect(bad.status).toBe(400);
    const del = await auth(request(createApp()).delete(`/api/eval-configs/${id}`));
    expect(del.body).toEqual({ deleted: true });
    const miss = await auth(request(createApp()).get('/api/eval-configs/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
