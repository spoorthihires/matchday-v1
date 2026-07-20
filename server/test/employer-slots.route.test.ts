import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Slot } from '../src/models/Slot.js';
import { SlotBooking } from '../src/models/SlotBooking.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const EVENT_DATE = '2026-08-05T00:00:00.000Z';

async function drive(over: Record<string, unknown> = {}) {
  return Drive.create({
    name: 'D', domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date(EVENT_DATE)], candCap: 100, empCap: 8, slotCap: 20,
    frequency: 'Weekly', eventDay: 'Wednesday',
    eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' },
    ...over,
  });
}
async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane', ...over });
}
function tokenFor(emp: { _id: unknown }) { return signToken({ sub: String(emp._id), role: 'employer' }); }
async function approve(emp: { _id: unknown }, d: { _id: unknown }) {
  return RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: 'D', role: 'Data Analyst', status: 'Approved', activity: [] });
}
const body = (over: Record<string, unknown> = {}) => ({ date: EVENT_DATE, start: '10:00', end: '12:00', capacity: 8, linkMode: 'auto', ...over });

describe('POST /api/me/employer/drives/:id/slots', () => {
  it('creates a slot with server-authoritative employerId + a stub auto link', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send(body());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Scheduled');
    expect(res.body.booked).toBe(0);
    expect(res.body.link).toMatch(/^https:\/\/meet\.hiringhood\.test\//);
    const slot = await Slot.findOne({ driveId: d._id });
    expect(slot).not.toBeNull();
    expect(String(slot!.employerId)).toBe(String(emp._id)); // server-authoritative, not from body
  });

  it('stores the employer-supplied link when linkMode=own', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send(body({ linkMode: 'own', link: 'https://zoom.example/abc' }));
    expect(res.status).toBe(201);
    expect(res.body.link).toBe('https://zoom.example/abc');
  });

  it('rejects when the employer has no approved registration for the drive', async () => {
    const emp = await employer(); const d = await drive(); // no approve()
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('registration_not_approved');
  });

  it('a Pending-only registration does NOT unlock slot creation', async () => {
    const emp = await employer(); const d = await drive();
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: 'D', role: 'X', status: 'Pending review', activity: [] });
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('registration_not_approved');
  });

  it('rejects a date not in the drive schedule', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send(body({ date: '2026-09-09T00:00:00.000Z' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('date_not_in_schedule');
  });

  it('rejects end <= start (400 validation) and capacity out of range', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const bad1 = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body({ start: '12:00', end: '10:00' }));
    expect(bad1.status).toBe(400);
    const bad2 = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body({ capacity: 99 }));
    expect(bad2.status).toBe(400);
  });

  it('rejects a duplicate slot at the same date+start (slot_exists)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    const dup = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    expect(dup.status).toBe(400);
    expect(dup.body.error.code).toBe('slot_exists');
  });

  it('enforces slotCap when > 0 (slot_cap_reached)', async () => {
    const emp = await employer(); const d = await drive({ slotCap: 1 }); await approve(emp, d);
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body({ start: '10:00', end: '12:00' }));
    const over = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body({ start: '12:00', end: '14:00' }));
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('slot_cap_reached');
  });

  it('401 without a token, 403 for an admin token', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const noTok = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).send(body());
    expect(noTok.status).toBe(401);
    const adminTok = signToken({ sub: String(emp._id), role: 'admin' });
    const admin = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${adminTok}`).send(body());
    expect(admin.status).toBe(403);
  });
});

describe('GET /api/me/employer/drives/:id/slots', () => {
  it('lists only the caller-employer own slots for the drive', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    const res = await request(app).get(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].start).toBe('10:00');
    expect(res.body.items[0].booked).toBe(0);
  });

  it('does not leak another employer slots (isolation)', async () => {
    const a = await employer({ email: 'a2@a.test' }); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d);
    await RegistrationRequest.create({ company: 'Beta', industry: 'Tech', submittedBy: 'B', employerId: b._id, driveId: d._id, driveName: 'D', role: 'X', status: 'Approved', activity: [] });
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(a)}`).send(body());
    const res = await request(app).get(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0); // B is approved but sees none of A's slots
  });

  it('surfaces a new slot in the dashboard aggregate', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    const dash = await request(app).get('/api/me/employer').set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(dash.status).toBe(200);
    expect(dash.body.dashboard.kpis.totalSlots).toBe(1);
  });
});

async function makeSlot(app: ReturnType<typeof createApp>, emp: { _id: unknown }, d: { _id: unknown }, over: Record<string, unknown> = {}) {
  const res = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body(over));
  return res.body.id as string;
}

describe('PATCH /api/me/employer/drives/:id/slots/:slotId', () => {
  it('reschedules a slot in place', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const id = await makeSlot(app, emp, d);
    const res = await request(app).patch(`/api/me/employer/drives/${d._id}/slots/${id}`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ start: '14:00', end: '16:00' });
    expect(res.status).toBe(200);
    expect(res.body.start).toBe('14:00');
    expect(res.body.end).toBe('16:00');
  });

  it('returns 404 for another employer slot (no oracle)', async () => {
    const a = await employer({ email: 'a3@a.test' }); const b = await employer({ email: 'b2@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d);
    await RegistrationRequest.create({ company: 'Beta', industry: 'Tech', submittedBy: 'B', employerId: b._id, driveId: d._id, driveName: 'D', role: 'X', status: 'Approved', activity: [] });
    const app = createApp();
    const id = await makeSlot(app, a, d);
    const res = await request(app).patch(`/api/me/employer/drives/${d._id}/slots/${id}`)
      .set('Authorization', `Bearer ${tokenFor(b)}`).send({ start: '14:00', end: '16:00' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('rejects lowering capacity below existing bookings', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const id = await makeSlot(app, emp, d, { capacity: 8 });
    // seed two candidate bookings directly (the candidate flow is a later slice)
    await SlotBooking.create({ slotId: id, jobseekerId: emp._id, status: 'Booked' });
    await SlotBooking.create({ slotId: id, jobseekerId: d._id, status: 'Held' });
    const res = await request(app).patch(`/api/me/employer/drives/${d._id}/slots/${id}`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ capacity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });
});

describe('DELETE /api/me/employer/drives/:id/slots/:slotId', () => {
  it('removes a slot with no bookings', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const id = await makeSlot(app, emp, d);
    const res = await request(app).delete(`/api/me/employer/drives/${d._id}/slots/${id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(await Slot.countDocuments({ _id: id })).toBe(0);
  });

  it('refuses to remove a slot that has candidate bookings', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const id = await makeSlot(app, emp, d);
    await SlotBooking.create({ slotId: id, jobseekerId: emp._id, status: 'Booked' });
    const res = await request(app).delete(`/api/me/employer/drives/${d._id}/slots/${id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('slot_has_bookings');
  });

  it('returns 404 for another employer slot on delete', async () => {
    const a = await employer({ email: 'a4@a.test' }); const b = await employer({ email: 'b3@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d);
    await RegistrationRequest.create({ company: 'Beta', industry: 'Tech', submittedBy: 'B', employerId: b._id, driveId: d._id, driveName: 'D', role: 'X', status: 'Approved', activity: [] });
    const app = createApp();
    const id = await makeSlot(app, a, d);
    const res = await request(app).delete(`/api/me/employer/drives/${d._id}/slots/${id}`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(res.status).toBe(404);
  });
});
