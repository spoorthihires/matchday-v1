import request from 'supertest';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Slot } from '../src/models/Slot.js';
import { Drive } from '../src/models/Drive.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Institute } from '../src/models/Institute.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);

async function institute(name = 'VNR') {
  return Institute.create({ name, city: 'Hyderabad', type: 'Engineering', status: 'Active', owner: 'A', email: 'a@b.io', ownershipHistory: [] });
}
async function drive(eligibility?: object) {
  return Drive.create({
    name: 'Drive', domain: 'Web', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date('2026-07-15T00:00:00.000Z')],
    ...(eligibility ? { eligibility } : {}),
  });
}
async function slot(driveId: unknown, capacity = 3) {
  return Slot.create({ driveId, date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity });
}
async function seeker(instId: unknown, over: Partial<{ stage: string; branch: string; gradYear: number; source: string; name: string }> = {}) {
  return Jobseeker.create({
    name: over.name ?? 'Asha', instituteId: instId, branch: over.branch ?? 'CSE', gradYear: over.gradYear ?? 2026,
    cgpa: 8, source: over.source ?? 'Campus', stage: over.stage ?? 'MatchReady',
  });
}

describe('slot bookings routes', () => {
  it('401s without a token', async () => {
    const res = await request(createApp()).get(`/api/slots/${new Types.ObjectId()}/bookings`);
    expect(res.status).toBe(401);
  });

  it('books, lists the roster, confirms, and releases', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    const js = await seeker(i._id);
    const create = await auth(request(createApp()).post(`/api/slots/${s._id}/bookings`)
      .send({ jobseekerId: String(js._id), status: 'Held' }));
    expect(create.status).toBe(201);
    const bookingId = create.body.id;

    const roster = await auth(request(createApp()).get(`/api/slots/${s._id}/bookings`));
    expect(roster.status).toBe(200);
    expect(roster.body.held).toHaveLength(1);

    const confirm = await auth(request(createApp()).patch(`/api/slots/${s._id}/bookings/${bookingId}`)
      .send({ status: 'Booked' }));
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('Booked');

    const del = await auth(request(createApp()).delete(`/api/slots/${s._id}/bookings/${bookingId}`));
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ deleted: true });
  });

  it('400s when booking an ineligible candidate', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    const js = await seeker(i._id, { stage: 'Applied' });
    const res = await auth(request(createApp()).post(`/api/slots/${s._id}/bookings`)
      .send({ jobseekerId: String(js._id), status: 'Booked' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('not_match_ready');
  });

  it('lists eligible candidates', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    await seeker(i._id, { name: 'Pickable' });
    const res = await auth(request(createApp()).get(`/api/slots/${s._id}/eligible-candidates`));
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { name: string }) => c.name)).toContain('Pickable');
  });
});
