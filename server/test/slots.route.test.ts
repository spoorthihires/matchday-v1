import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Drive } from '../src/models/Drive.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);

describe('slots routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/slots')).status).toBe(401);
  });
  it('creates (201), lists in range, patches, deletes; 400 when attended on a fresh slot; 404 on unknown', async () => {
    const d = await Drive.create({ name: 'FE', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });
    const body = { date: '2026-07-15', start: '10:00', end: '12:00', capacity: 10, driveId: String(d._id) };
    const c = await auth(request(createApp()).post('/api/slots').send(body));
    expect(c.status).toBe(201);
    const list = await auth(request(createApp()).get('/api/slots?from=2026-07-01&to=2026-07-31'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].employerName).toBe('(Unallocated)');
    const bad = await auth(request(createApp()).post('/api/slots').send({ ...body, attended: 5 }));
    expect(bad.status).toBe(400);
    const id = c.body._id;
    const upd = await auth(request(createApp()).patch(`/api/slots/${id}`).send({ status: 'Cancelled' }));
    expect(upd.body.status).toBe('Cancelled');
    const del = await auth(request(createApp()).delete(`/api/slots/${id}`));
    expect(del.body).toEqual({ deleted: true });
    const miss = await auth(request(createApp()).get('/api/slots/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
