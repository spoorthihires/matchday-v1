import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { Application } from '../src/models/Application.js';
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
async function approve(e: { _id: unknown }, d: { _id: unknown }, details: Record<string, unknown> = {}) {
  return RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: e._id, driveId: d._id, driveName: 'D', role: 'R', status: 'Approved', activity: [], details });
}
async function seeker(instId: unknown, over: Record<string, unknown> = {}) {
  return Jobseeker.create({ name: 'Real Name', email: 'real@x.test', instituteId: instId, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', evaluationStatus: 'completed', stage: 'MatchReady', ...over });
}
async function granted(emp: { _id: unknown }, d: { _id: unknown }, jsId: unknown, over: Record<string, unknown> = {}) {
  const now = new Date();
  return Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: jsId, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now }, ...over });
}
const offerUrl = (d: { _id: unknown }, jsId: unknown) => `/api/me/employer/drives/${d._id}/candidates/${jsId}/offer`;

describe('PUT .../offer', () => {
  it('creates an offer for a consent-granted candidate, defaulting ctc/location/mode from the registration', async () => {
    const emp = await employer(); const d = await drive();
    await approve(emp, d, { ctcMax: 18, cities: ['Bengaluru'], workMode: 'Remote' });
    const inst = await institute(); const s = await seeker(inst._id); await granted(emp, d, s._id);
    const res = await request(createApp()).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ status: 'Sent' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'Sent', response: 'Pending', ctc: 18, location: 'Bengaluru', mode: 'Remote' });
    expect(res.body.revealed).toEqual({ name: 'Real Name', email: 'real@x.test' });
    const app = await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: s._id }).lean();
    expect(app?.offer?.status).toBe('Sent');
  });

  it('requires consent granted (offer_requires_consent)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const inst = await institute(); const s = await seeker(inst._id);
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted' }); // no consent
    const res = await request(createApp()).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ status: 'Sent' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('offer_requires_consent');
  });

  it('updates only provided fields; the kanban board derives the offer stage; a pin still overrides', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d, { ctcMax: 12 });
    const inst = await institute(); const s = await seeker(inst._id); await granted(emp, d, s._id);
    const app = createApp(); const tok = tokenFor(emp);
    await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Sent', ctc: 20 });
    // board derives Offer Sent
    const board1 = await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tok}`);
    expect(board1.body.items.find((i: { jobseekerId: string }) => i.jobseekerId === String(s._id)).stage).toBe('Offer Sent');
    // update to Accepted (only status changes; ctc stays 20)
    const upd = await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Accepted' });
    expect(upd.body).toMatchObject({ status: 'Accepted', ctc: 20 });
    const board2 = await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tok}`);
    expect(board2.body.items.find((i: { jobseekerId: string }) => i.jobseekerId === String(s._id)).stage).toBe('Offer Accepted');
    // a Declined offer → Withdrawn; a Draft offer does NOT change the derived stage
    await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Declined', declineReason: 'competing offer' });
    const board3 = await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tok}`);
    expect(board3.body.items.find((i: { jobseekerId: string }) => i.jobseekerId === String(s._id)).stage).toBe('Withdrawn');
    // manual pin overrides the offer-derived stage
    await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`).set('Authorization', `Bearer ${tok}`).send({ stage: 'HR' });
    const board4 = await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tok}`);
    expect(board4.body.items.find((i: { jobseekerId: string }) => i.jobseekerId === String(s._id)).stage).toBe('HR');
  });

  it('validates enums (400); out-of-pool → 404; 401/403', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const inst = await institute(); const s = await seeker(inst._id); await granted(emp, d, s._id);
    const applied = await seeker(inst._id, { email: 'ap@x.test', stage: 'Applied' });
    const app = createApp(); const tok = tokenFor(emp);
    expect((await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Nope' })).status).toBe(400);
    expect((await request(app).put(offerUrl(d, applied._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Sent' })).status).toBe(404);
    expect((await request(app).put(offerUrl(d, s._id)).send({ status: 'Sent' })).status).toBe(401);
    expect((await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`).send({ status: 'Sent' })).status).toBe(403);
  });
});
