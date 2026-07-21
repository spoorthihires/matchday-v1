import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { Application } from '../src/models/Application.js';
import { Slot } from '../src/models/Slot.js';
import { Interview } from '../src/models/Interview.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function institute() { return Institute.create({ name: 'Secret College', city: 'Hyderabad', type: 'Tier-1' }); }
async function drive(over: Record<string, unknown> = {}) {
  return Drive.create({
    name: 'D', domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
    eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' }, ...over,
  });
}
async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane', ...over });
}
function tokenFor(e: { _id: unknown }) { return signToken({ sub: String(e._id), role: 'employer' }); }
async function approve(e: { _id: unknown }, d: { _id: unknown }) {
  return RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: e._id, driveId: d._id, driveName: 'D', role: 'R', status: 'Approved', activity: [] });
}
async function seeker(instId: unknown, over: Record<string, unknown> = {}) {
  return Jobseeker.create({ name: 'Real Name', email: 'real@x.test', instituteId: instId, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', evaluationStatus: 'completed', stage: 'MatchReady', ...over });
}
async function slot(e: { _id: unknown }, d: { _id: unknown }, over: Record<string, unknown> = {}) {
  return Slot.create({ driveId: d._id, employerId: e._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00', capacity: 10, status: 'Scheduled', link: 'https://meet.test/x', ...over });
}
async function granted(emp: { _id: unknown }, d: { _id: unknown }, jsId: unknown) {
  const now = new Date();
  return Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: jsId, decision: 'Shortlisted',
    consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
}

describe('POST .../interviews (schedule)', () => {
  it('schedules an interview for a consent-granted candidate and returns the revealed name + slot link', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id); const sl = await slot(emp, d);
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/interviews`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '10:30', interviewers: ['Priya M'] });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Real Name');           // revealed (consent granted)
    expect(res.body.email).toBe('real@x.test');         // revealed (consent granted)
    expect(res.body.status).toBe('Scheduled');
    expect(res.body.slot.link).toBe('https://meet.test/x');
    expect(res.body.time).toBe('10:30');
    expect(res.body.interviewers).toEqual(['Priya M']);
  });

  it('rejects a candidate who has not consented (consent_required)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted' }); // no consent
    const sl = await slot(emp, d);
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/interviews`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '10:30' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('consent_required');
  });

  it('enforces slot_invalid / time_out_of_window / slot_time_taken / already_scheduled', async () => {
    const emp = await employer(); const other = await employer({ email: 'o@o.test' });
    const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id);
    const s2 = await seeker(inst._id, { email: 's2@x.test' }); await granted(emp, d, s2._id);
    const sl = await slot(emp, d);
    const app = createApp(); const tok = tokenFor(emp);
    const foreignSlot = await slot(other, d);
    // slot_invalid (another employer's slot)
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s._id), slotId: String(foreignSlot._id), time: '10:30' })).body.error.code).toBe('slot_invalid');
    // time_out_of_window (before start)
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '09:00' })).body.error.code).toBe('time_out_of_window');
    // schedule s at 10:30
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '10:30' })).status).toBe(201);
    // slot_time_taken (s2 at the same slot+time)
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s2._id), slotId: String(sl._id), time: '10:30' })).body.error.code).toBe('slot_time_taken');
    // already_scheduled (s again)
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '11:00' })).body.error.code).toBe('already_scheduled');
  });

  it('404 for an out-of-pool candidate; 400 without an approved registration; 401/403', async () => {
    const emp = await employer(); const d = await drive(); const inst = await institute();
    const s = await seeker(inst._id);
    const app = createApp();
    // no registration → 400
    const noReg = await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send({ jobseekerId: String(s._id), slotId: String(new Types.ObjectId()), time: '10:30' });
    expect(noReg.status).toBe(400);
    expect(noReg.body.error.code).toBe('registration_not_approved');
    await approve(emp, d);
    // out-of-pool jobseeker (Applied stage) → 404
    const applied = await seeker(inst._id, { email: 'ap@x.test', stage: 'Applied' });
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send({ jobseekerId: String(applied._id), slotId: String(new Types.ObjectId()), time: '10:30' })).status).toBe(404);
    // 401 / 403
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).send({ jobseekerId: String(s._id), slotId: 'x', time: '10:30' })).status).toBe(401);
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`)
      .set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`).send({ jobseekerId: String(s._id), slotId: 'x', time: '10:30' })).status).toBe(403);
  });
});

describe('GET .../interviews (list)', () => {
  it('lists this employer\'s interviews (revealed identity + slot), sorted; employer-scoped', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(a, d, s._id); const sl = await slot(a, d);
    await request(createApp()).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(a)}`)
      .send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '10:30' });
    const listA = await request(createApp()).get(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(a)}`);
    expect(listA.status).toBe(200);
    expect(listA.body.items).toHaveLength(1);
    expect(listA.body.items[0]).toMatchObject({ name: 'Real Name', time: '10:30', status: 'Scheduled' });
    expect(listA.body.items[0].slot.link).toBe('https://meet.test/x');
    const listB = await request(createApp()).get(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(listB.body.items).toHaveLength(0);
  });
});

async function schedule(emp: { _id: unknown }, d: { _id: unknown }, jsId: unknown, slId: unknown, time: string) {
  return request(createApp()).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(emp)}`)
    .send({ jobseekerId: String(jsId), slotId: String(slId), time });
}

describe('PATCH .../interviews/:interviewId (actions)', () => {
  it('confirm / complete / cancel transition the status', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id); const sl = await slot(emp, d);
    const id = (await schedule(emp, d, s._id, sl._id, '10:30')).body.id;
    const app = createApp(); const tok = tokenFor(emp); const url = `/api/me/employer/drives/${d._id}/interviews/${id}`;
    const confirmRes = await request(app).patch(url).set('Authorization', `Bearer ${tok}`).send({ action: 'confirm' });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('Confirmed');
    const completeRes = await request(app).patch(url).set('Authorization', `Bearer ${tok}`).send({ action: 'complete' });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('Completed');
    const cancelRes = await request(app).patch(url).set('Authorization', `Bearer ${tok}`).send({ action: 'cancel' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('Cancelled');
  });

  it('reschedule re-validates and resets status to Scheduled; set-interviewers replaces', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id);
    const s2 = await seeker(inst._id, { email: 's2@x.test' }); await granted(emp, d, s2._id);
    const sl = await slot(emp, d);
    const app = createApp(); const tok = tokenFor(emp);
    const id = (await schedule(emp, d, s._id, sl._id, '10:30')).body.id;
    await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`).send({ action: 'confirm' });
    // second interview holds 11:00
    await schedule(emp, d, s2._id, sl._id, '11:00');
    // reschedule s to a taken time → slot_time_taken
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`)
      .send({ action: 'reschedule', slotId: String(sl._id), time: '11:00' })).body.error.code).toBe('slot_time_taken');
    // reschedule to a free time → status back to Scheduled at the new time
    const ok = await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`)
      .send({ action: 'reschedule', slotId: String(sl._id), time: '11:30' });
    expect(ok.body.status).toBe('Scheduled');
    expect(ok.body.time).toBe('11:30');
    // reschedule to its OWN currently-held time must succeed (excludeIvId self-exclusion) — a regression
    // that dropped excludeIvId from the clash filter would wrongly return slot_time_taken here.
    const self = await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`)
      .send({ action: 'reschedule', slotId: String(sl._id), time: '11:30' });
    expect(self.status).toBe(200);
    expect(self.body.status).toBe('Scheduled');
    expect(self.body.time).toBe('11:30');
    // set-interviewers
    const iv = await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`)
      .send({ action: 'set-interviewers', interviewers: ['A B', 'C D'] });
    expect(iv.body.interviewers).toEqual(['A B', 'C D']);
  });

  it('404 for a foreign/unknown interview id; 400 on a bad action', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(a, d, s._id); const sl = await slot(a, d);
    const id = (await schedule(a, d, s._id, sl._id, '10:30')).body.id;
    const app = createApp();
    // employer B cannot act on A's interview → 404 (no oracle)
    const foreignRes = await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tokenFor(b)}`).send({ action: 'confirm' });
    expect(foreignRes.status).toBe(404);
    expect(foreignRes.body.error.code).toBe('not_found');
    // unknown id → 404 (same body shape as the foreign-employer case — no oracle)
    const unknownRes = await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${new Types.ObjectId()}`).set('Authorization', `Bearer ${tokenFor(a)}`).send({ action: 'confirm' });
    expect(unknownRes.status).toBe(404);
    expect(unknownRes.body.error.code).toBe('not_found');
    // bad action → 400
    const badActionRes = await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tokenFor(a)}`).send({ action: 'nope' });
    expect(badActionRes.status).toBe(400);
    expect(badActionRes.body.error.code).toBe('validation');
  });
});

describe('Cancelled interview: reuse on reschedule-via-schedule + blocked transitions', () => {
  it('schedule -> cancel -> schedule the same candidate again reactivates the interview (not already_scheduled)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id); const sl = await slot(emp, d);
    const app = createApp(); const tok = tokenFor(emp);
    const first = await schedule(emp, d, s._id, sl._id, '10:30');
    expect(first.status).toBe(201);
    const id = first.body.id;
    const cancelRes = await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`).send({ action: 'cancel' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('Cancelled');
    // re-schedule the SAME candidate -- must reuse the Cancelled row, not hit already_scheduled/E11000
    const second = await schedule(emp, d, s._id, sl._id, '11:00');
    expect(second.status).toBe(201);
    expect(second.body.status).toBe('Scheduled');
    expect(second.body.id).toBe(id); // reactivated the same document
    expect(second.body.time).toBe('11:00');
    expect(await Interview.countDocuments({ employerId: emp._id, driveId: d._id, jobseekerId: s._id })).toBe(1);
  });

  it('PATCH confirm on a Cancelled interview -> 400 invalid_transition; cancel itself stays idempotent', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id); const sl = await slot(emp, d);
    const app = createApp(); const tok = tokenFor(emp);
    const id = (await schedule(emp, d, s._id, sl._id, '10:30')).body.id;
    const url = `/api/me/employer/drives/${d._id}/interviews/${id}`;
    await request(app).patch(url).set('Authorization', `Bearer ${tok}`).send({ action: 'cancel' });
    const confirmRes = await request(app).patch(url).set('Authorization', `Bearer ${tok}`).send({ action: 'confirm' });
    expect(confirmRes.status).toBe(400);
    expect(confirmRes.body.error.code).toBe('invalid_transition');
    const cancelAgain = await request(app).patch(url).set('Authorization', `Bearer ${tok}`).send({ action: 'cancel' });
    expect(cancelAgain.status).toBe(200);
    expect(cancelAgain.body.status).toBe('Cancelled');
  });
});
