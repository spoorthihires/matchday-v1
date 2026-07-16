import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { Drive } from '../src/models/Drive.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
const mkInst = () => Institute.create({ name: 'VNR', city: 'Hyderabad', type: 'Engineering', status: 'Active', owner: 'A', email: 'a@b.io', ownershipHistory: [] });
const mkDrive = (n: string) => Drive.create({ name: n, domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });

describe('institute-drives routes', () => {
  it('401s without a token', async () => {
    const i = await mkInst();
    expect((await request(createApp()).get(`/api/institutes/${i._id}/drives`)).status).toBe(401);
  });
  it('assigns, lists (with count on detail), unassigns, bulk-assigns', async () => {
    const i = await mkInst(); const d1 = await mkDrive('FE'); const d2 = await mkDrive('BE');
    const a = await auth(request(createApp()).post(`/api/institutes/${i._id}/drives`).send({ driveIds: [String(d1._id), String(d2._id)] }));
    expect(a.status).toBe(200);
    expect(a.body.items).toHaveLength(2);
    const list = await auth(request(createApp()).get(`/api/institutes/${i._id}/drives`));
    expect(list.body.items).toHaveLength(2);
    const detail = await auth(request(createApp()).get(`/api/institutes/${i._id}`));
    expect(detail.body.assignedDrives).toBe(2);
    const del = await auth(request(createApp()).delete(`/api/institutes/${i._id}/drives/${d1._id}`));
    expect(del.body).toEqual({ deleted: true });
    expect((await auth(request(createApp()).get(`/api/institutes/${i._id}/drives`))).body.items).toHaveLength(1);
    const i2 = await mkInst();
    const bulk = await auth(request(createApp()).post('/api/institutes/assign-drives').send({ instituteIds: [String(i._id), String(i2._id)], driveIds: [String(d2._id)] }));
    expect(bulk.status).toBe(200);
    expect(bulk.body.assigned).toBe(1);   // (i,d2) already existed; only (i2,d2) is new
  });
});
