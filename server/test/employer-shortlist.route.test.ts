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

describe('POST .../candidates/bulk-decision', () => {
  it('bulk-upserts a decision for pool members and returns updated count', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const a = await seeker(inst._id); const b = await seeker(inst._id, { email: 'b@x.test' });
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [String(a._id), String(b._id)], decision: 'Shortlisted' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(await Application.countDocuments({ employerId: emp._id, driveId: d._id, decision: 'Shortlisted' })).toBe(2);
  });

  it('skips non-pool / unknown ids (no oracle) and excludes them from the count', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const a = await seeker(inst._id);                                   // in pool
    const notReady = await seeker(inst._id, { email: 'n@x.test', stage: 'Applied' }); // not Match-Ready → not in pool
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send({ jobseekerIds: [String(a._id), String(notReady._id), String(new Types.ObjectId())], decision: 'Hold' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(await Application.countDocuments({ employerId: emp._id, driveId: d._id })).toBe(1);
  });

  it('preserves notes/consent on an existing row when bulk-changing its decision', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const a = await seeker(inst._id);
    const now = new Date();
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: a._id, decision: 'Shortlisted',
      notes: [{ text: 'keep', by: 'Jane', at: now }], consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [String(a._id)], decision: 'Rejected' });
    const app = await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: a._id }).lean();
    expect(app?.decision).toBe('Rejected');
    expect(app?.notes).toHaveLength(1);
    expect(app?.consent?.status).toBe('granted');
  });

  it('gated on an approved registration; 400 on bad body; 401/403', async () => {
    const emp = await employer(); const d = await drive(); const inst = await institute();
    const a = await seeker(inst._id);
    const app = createApp();
    // no registration → 400 registration_not_approved
    const noReg = await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [String(a._id)], decision: 'Shortlisted' });
    expect(noReg.status).toBe(400);
    expect(noReg.body.error.code).toBe('registration_not_approved');
    await approve(emp, d);
    // bad decision → 400 validation
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [String(a._id)], decision: 'Maybe' })).status).toBe(400);
    // empty ids → 400
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [], decision: 'Shortlisted' })).status).toBe(400);
    // 401 no token
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`).send({ jobseekerIds: [String(a._id)], decision: 'Shortlisted' })).status).toBe(401);
    // 403 admin token
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`).send({ jobseekerIds: [String(a._id)], decision: 'Shortlisted' })).status).toBe(403);
  });

  it('is employer-scoped: employer B\'s bulk does not touch employer A\'s rows', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const s = await seeker(inst._id);
    await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(a)}`).send({ jobseekerIds: [String(s._id)], decision: 'Shortlisted' });
    await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(b)}`).send({ jobseekerIds: [String(s._id)], decision: 'Rejected' });
    expect((await Application.findOne({ employerId: a._id, driveId: d._id, jobseekerId: s._id }).lean())?.decision).toBe('Shortlisted');
    expect((await Application.findOne({ employerId: b._id, driveId: d._id, jobseekerId: s._id }).lean())?.decision).toBe('Rejected');
  });
});
