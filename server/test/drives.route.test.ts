import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const token = () => signToken({ sub: 'u1', role: 'admin' });
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);
const validBody = {
  name: 'FE Cohort', domain: 'Frontend', stream: 'B.Tech', candType: 'Freshers', mode: 'Hybrid',
  frequency: 'One-time', eventDay: 'Wednesday', eventDates: ['2026-07-15T04:30:00.000Z'],
  candCap: 500, empCap: 9, slotCap: 360,
  eligibility: { sources: ['Institutes'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
  evaluation: [{ key: 'mcq', enabled: true, config: { questions: 30 } }],
  visibility: { employerReg: 'Invite-only', instituteVis: 'Selected institutes', candidateAccess: 'Eligible only' },
};

describe('drives routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/drives')).status).toBe(401);
  });

  it('creates then lists a drive', async () => {
    const created = await auth(request(createApp()).post('/api/drives').send(validBody));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('Draft');
    const list = await auth(request(createApp()).get('/api/drives'));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].name).toBe('FE Cohort');
  });

  it('400s on invalid body (no enabled evaluation stage)', async () => {
    const bad = { ...validBody, evaluation: [{ key: 'mcq', enabled: false, config: {} }] };
    const res = await auth(request(createApp()).post('/api/drives').send(bad));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });

  it('patches status (publish) and 404s on unknown id', async () => {
    const created = await auth(request(createApp()).post('/api/drives').send(validBody));
    const id = created.body._id;
    const pub = await auth(request(createApp()).patch(`/api/drives/${id}`).send({ status: 'Published' }));
    expect(pub.body.status).toBe('Published');
    const miss = await auth(request(createApp()).get('/api/drives/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });

  it('bulk-archives', async () => {
    const c1 = await auth(request(createApp()).post('/api/drives').send(validBody));
    const c2 = await auth(request(createApp()).post('/api/drives').send(validBody));
    const res = await auth(request(createApp()).post('/api/drives/bulk').send({ ids: [c1.body._id, c2.body._id], action: 'archive' }));
    expect(res.body.affected).toBe(2);
  });
});
