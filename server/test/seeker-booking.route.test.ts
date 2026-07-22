import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken, hashPassword } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Slot } from '../src/models/Slot.js';
import { SlotBooking } from '../src/models/SlotBooking.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const ELIGIBILITY = { branches: ['CSE'], gradYears: [2026], sources: ['Campus'] };

async function scenario(over: Partial<{ stage: string; branch: string }> = {}) {
  const inst = await Institute.create({ name: 'CBIT', city: 'Hyd', type: 'Tier-1' });
  const emp = await Employer.create({ name: 'Acme Corp', industry: 'Tech', email: 'acme@x.test', status: 'Active' });
  const d = await Drive.create({
    name: 'Aug Drive', domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20,
    frequency: 'Weekly', eventDay: 'Wednesday', eligibility: ELIGIBILITY,
  });
  const passwordHash = await hashPassword('secret123');
  const js = await Jobseeker.create({
    name: 'Aarav', email: 'aarav@x.test', passwordHash, instituteId: inst._id,
    branch: over.branch ?? 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus',
    stage: over.stage ?? 'MatchReady',
  });
  const future = new Date(Date.now() + 7 * 24 * 3600_000);
  const slotA = await Slot.create({ driveId: d._id, employerId: emp._id, date: future, start: '10:00', end: '11:00', capacity: 2, status: 'Scheduled' });
  const slotB = await Slot.create({ driveId: d._id, employerId: emp._id, date: future, start: '11:00', end: '12:00', capacity: 2, status: 'Scheduled' });
  return { inst, emp, d, js, slotA, slotB };
}

function jsToken(js: { _id: unknown }) { return signToken({ sub: String(js._id), role: 'jobseeker' }); }
function auth(r: request.Test, tok: string) { return r.set('Authorization', `Bearer ${tok}`); }

describe('GET /api/me/portal/drives/:driveId/slots', () => {
  it('lists the drive\'s non-Cancelled slots with booked/mine derived', async () => {
    const { js, d, slotA, slotB } = await scenario();
    await Slot.create({ driveId: d._id, date: new Date(), start: '09:00', end: '10:00', capacity: 2, status: 'Cancelled' });
    const res = await auth(request(createApp()).get(`/api/me/portal/drives/${d._id}/slots`), jsToken(js));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([String(slotA._id), String(slotB._id)]));
    for (const item of res.body.items) {
      expect(item).toMatchObject({ booked: 0, mine: false });
      expect(item).toHaveProperty('date');
      expect(item).toHaveProperty('start');
      expect(item).toHaveProperty('end');
      expect(item).toHaveProperty('capacity');
    }
  });

  it('404s for a drive the seeker is not eligible for (no oracle)', async () => {
    const { js, d } = await scenario({ branch: 'ECE' });
    const res = await auth(request(createApp()).get(`/api/me/portal/drives/${d._id}/slots`), jsToken(js));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('401 without a token, 403 with an admin token', async () => {
    const { d } = await scenario();
    expect((await request(createApp()).get(`/api/me/portal/drives/${d._id}/slots`)).status).toBe(401);
    const adminTok = signToken({ sub: 'u1', role: 'admin' });
    const res = await auth(request(createApp()).get(`/api/me/portal/drives/${d._id}/slots`), adminTok);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/me/portal/slots/:slotId/book', () => {
  it('books the CALLER (ignoring a spoofed jobseekerId in the body); re-booking 400s; re-GET shows mine/booked', async () => {
    const { js, d, slotA } = await scenario();
    const spoofedId = String((await Institute.create({ name: 'Spoof', city: 'X', type: 'Y' }))._id);
    const res = await auth(request(createApp()).post(`/api/me/portal/slots/${slotA._id}/book`), jsToken(js))
      .send({ jobseekerId: spoofedId });
    expect([200, 201]).toContain(res.status);

    const bookings = await SlotBooking.find({ slotId: slotA._id }).lean();
    expect(bookings).toHaveLength(1);
    expect(String(bookings[0].jobseekerId)).toBe(String(js._id));
    expect(String(bookings[0].jobseekerId)).not.toBe(spoofedId);

    const relist = await auth(request(createApp()).get(`/api/me/portal/drives/${d._id}/slots`), jsToken(js));
    const mine = relist.body.items.find((i: { id: string }) => i.id === String(slotA._id));
    expect(mine).toMatchObject({ mine: true, booked: 1 });

    const again = await auth(request(createApp()).post(`/api/me/portal/slots/${slotA._id}/book`), jsToken(js));
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('already_booked');
  });

  it('400s over capacity', async () => {
    const { js, slotA } = await scenario();
    const other = await Jobseeker.create({
      name: 'Other', instituteId: (await Institute.create({ name: 'X', city: 'Y', type: 'Z' }))._id,
      branch: 'CSE', gradYear: 2026, cgpa: 7, source: 'Campus', stage: 'MatchReady',
    });
    const fillerA = await Jobseeker.create({
      name: 'Filler', instituteId: (await Institute.create({ name: 'X2', city: 'Y', type: 'Z' }))._id,
      branch: 'CSE', gradYear: 2026, cgpa: 7, source: 'Campus', stage: 'MatchReady',
    });
    await SlotBooking.create({ slotId: slotA._id, jobseekerId: other._id, status: 'Booked' });
    await SlotBooking.create({ slotId: slotA._id, jobseekerId: fillerA._id, status: 'Booked' });

    const res = await auth(request(createApp()).post(`/api/me/portal/slots/${slotA._id}/book`), jsToken(js));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('slot_full');
  });

  it('404s booking into a drive the seeker is not eligible for (no oracle)', async () => {
    const { js, slotA } = await scenario({ branch: 'ECE' });
    const res = await auth(request(createApp()).post(`/api/me/portal/slots/${slotA._id}/book`), jsToken(js));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('400s not_match_ready for a non-MatchReady seeker', async () => {
    const { js, slotA } = await scenario({ stage: 'Applied' });
    const res = await auth(request(createApp()).post(`/api/me/portal/slots/${slotA._id}/book`), jsToken(js));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('not_match_ready');
  });

  it('401 without a token, 403 with an admin token', async () => {
    const { slotA } = await scenario();
    expect((await request(createApp()).post(`/api/me/portal/slots/${slotA._id}/book`)).status).toBe(401);
    const adminTok = signToken({ sub: 'u1', role: 'admin' });
    const res = await auth(request(createApp()).post(`/api/me/portal/slots/${slotA._id}/book`), adminTok);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/me/portal/slots/:slotId/book', () => {
  it('removes the seeker\'s own booking; re-GET shows mine:false, booked:0; 404 when none', async () => {
    const { js, d, slotA } = await scenario();
    await auth(request(createApp()).post(`/api/me/portal/slots/${slotA._id}/book`), jsToken(js));

    const del = await auth(request(createApp()).delete(`/api/me/portal/slots/${slotA._id}/book`), jsToken(js));
    expect(del.status).toBe(200);

    const relist = await auth(request(createApp()).get(`/api/me/portal/drives/${d._id}/slots`), jsToken(js));
    const mine = relist.body.items.find((i: { id: string }) => i.id === String(slotA._id));
    expect(mine).toMatchObject({ mine: false, booked: 0 });

    const again = await auth(request(createApp()).delete(`/api/me/portal/slots/${slotA._id}/book`), jsToken(js));
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('not_found');
  });

  it('401 without a token, 403 with an admin token', async () => {
    const { slotA } = await scenario();
    expect((await request(createApp()).delete(`/api/me/portal/slots/${slotA._id}/book`)).status).toBe(401);
    const adminTok = signToken({ sub: 'u1', role: 'admin' });
    const res = await auth(request(createApp()).delete(`/api/me/portal/slots/${slotA._id}/book`), adminTok);
    expect(res.status).toBe(403);
  });
});
