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
function stageOf(items: any[], jsId: unknown) { return items.find((i) => i.jobseekerId === String(jsId))?.stage; }

describe('GET .../board', () => {
  it('derives effective stages from decision / consent / interview', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const now = new Date();
    const undecided = await seeker(inst._id, { email: 'u@x.test' });                                    // → Recommended
    const short = await seeker(inst._id, { email: 's@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: short._id, decision: 'Shortlisted' }); // → Shortlisted
    const confirmed = await seeker(inst._id, { email: 'c@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: confirmed._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } }); // granted, no interview → Candidate Confirmed
    const scheduled = await seeker(inst._id, { email: 'sc@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: scheduled._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    const sl = await Slot.create({ driveId: d._id, employerId: emp._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00', capacity: 10, status: 'Scheduled', link: 'x' });
    await Interview.create({ employerId: emp._id, driveId: d._id, jobseekerId: scheduled._id, slotId: sl._id, time: '10:30', status: 'Scheduled' }); // granted + interview → Scheduled
    const declined = await seeker(inst._id, { email: 'dec@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: declined._id, decision: 'Shortlisted', consent: { status: 'declined', requestedAt: now, expiresAt: now, respondedAt: now } }); // → Withdrawn
    const pinned = await seeker(inst._id, { email: 'p@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: pinned._id, decision: 'Shortlisted', stage: 'L2' }); // pinned overrides

    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    const items = res.body.items;
    expect(stageOf(items, undecided._id)).toBe('Recommended');
    expect(stageOf(items, short._id)).toBe('Shortlisted');
    expect(stageOf(items, confirmed._id)).toBe('Candidate Confirmed');
    expect(stageOf(items, scheduled._id)).toBe('Scheduled');
    expect(stageOf(items, declined._id)).toBe('Withdrawn');
    expect(stageOf(items, pinned._id)).toBe('L2');
  });

  it('reveals identity only for consent-granted cards', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const now = new Date();
    const g = await seeker(inst._id, { email: 'g@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: g._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    const m = await seeker(inst._id, { email: 'm@x.test' });
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    const gc = res.body.items.find((i: any) => i.jobseekerId === String(g._id));
    const mc = res.body.items.find((i: any) => i.jobseekerId === String(m._id));
    expect(gc.revealed).toEqual({ name: 'Real Name', email: 'g@x.test' });
    expect(mc.revealed).toBeNull();
  });

  it('gated + employer-scoped + 401/403', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); const inst = await institute(); await seeker(inst._id);
    const app = createApp();
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tokenFor(a)}`)).status).toBe(400); // no reg
    await approve(a, d);
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/board`)).status).toBe(401);
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${signToken({ sub: String(a._id), role: 'admin' })}`)).status).toBe(403);
  });
});

describe('PATCH .../candidates/:jobseekerId/stage', () => {
  it('pins the stage on an existing Application without touching decision', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted' });
    const res = await request(createApp()).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ stage: 'L2' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('L2');
    expect(res.body.decision).toBe('Shortlisted'); // decision untouched
    const app = await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: s._id }).lean();
    expect(app?.stage).toBe('L2');
    expect(app?.decision).toBe('Shortlisted');
  });

  it('creates an Application (decision null) for a pure-pool candidate then pins the stage', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    expect(await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: s._id })).toBeNull();
    const res = await request(createApp()).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ stage: 'Shortlisted' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('Shortlisted');
    const app = await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: s._id }).lean();
    expect(app?.stage).toBe('Shortlisted');
    expect(app?.decision ?? null).toBeNull(); // decision NOT set by a stage move
  });

  it('rejects an invalid stage (400); out-of-pool → 404; 401/403', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    const applied = await seeker(inst._id, { email: 'ap@x.test', stage: 'Applied' }); // out of pool
    const app = createApp(); const tok = tokenFor(emp);
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`).set('Authorization', `Bearer ${tok}`).send({ stage: 'Nope' })).status).toBe(400);
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${applied._id}/stage`).set('Authorization', `Bearer ${tok}`).send({ stage: 'L1' })).status).toBe(404);
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`).send({ stage: 'L1' })).status).toBe(401);
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`).set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`).send({ stage: 'L1' })).status).toBe(403);
  });
});
