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
async function approve(e: { _id: unknown }, d: { _id: unknown }) {
  return RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: e._id, driveId: d._id, driveName: 'D', role: 'R', status: 'Approved', activity: [] });
}
async function seeker(instId: unknown, over: Record<string, unknown> = {}) {
  return Jobseeker.create({ name: 'Real Name', email: 'real@x.test', instituteId: instId, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', evaluationStatus: 'completed', stage: 'MatchReady', ...over });
}

describe('GET /api/me/employer/drives/:id/candidates', () => {
  it('returns a redacted pool (no name/email) of eligible + Match-Ready jobseekers', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    await seeker(inst._id);                                   // eligible + MatchReady → included
    await seeker(inst._id, { email: 'b@x.test', branch: 'ECE' });   // not eligible (branch) → excluded
    await seeker(inst._id, { email: 'c@x.test', stage: 'Applied' }); // not Match-Ready → excluded
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const c = res.body.items[0];
    expect(c).not.toHaveProperty('name');
    expect(c).not.toHaveProperty('email');
    expect(c).not.toHaveProperty('phone');
    expect(c).not.toHaveProperty('passwordHash');
    expect(c).not.toHaveProperty('instituteName');
    expect(c.code).toMatch(/^C-/);
    expect(c.instituteCategory).toBe('Tier-1');   // Institute.type, NOT its name/city
    expect(c.matchScore).toBe(82);                // cgpa8/completed/MatchReady → 100*(.5*.8+.3*1+.2*.6)
    expect(c.evalPill).toBe('Strong');
    expect(c.decision).toBeNull();
    // the spec's promise: NO identity/institute PII anywhere in the raw payload
    const raw = JSON.stringify(res.body);
    for (const pii of ['Real Name', 'real@x.test', 'Secret College', 'Hyderabad']) expect(raw).not.toContain(pii);
  });

  it('rejects without an approved registration (Pending does not unlock)', async () => {
    const emp = await employer(); const d = await drive();
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: 'D', role: 'R', status: 'Pending review', activity: [] });
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('registration_not_approved');
  });

  it('sorts by matchScore desc and filters by evaluation', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    await seeker(inst._id, { email: 's1@x.test', cgpa: 9, evaluationStatus: 'completed', stage: 'Shortlisted' }); // high
    await seeker(inst._id, { email: 's2@x.test', cgpa: 6, evaluationStatus: 'pending', stage: 'MatchReady' });     // low → Qualified
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.body.items[0].matchScore).toBeGreaterThanOrEqual(res.body.items[1].matchScore);
    const q = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates?evaluation=Qualified`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(q.body.items.every((c: { evalPill: string }) => c.evalPill === 'Qualified')).toBe(true);
  });

  it('401 no token, 403 admin token', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/candidates`)).status).toBe(401);
    const adminTok = signToken({ sub: String(emp._id), role: 'admin' });
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${adminTok}`)).status).toBe(403);
  });
});

async function poolSeekerId(instId: unknown) {
  const s = await seeker(instId);
  return String(s._id);
}

describe('GET .../candidates/:jobseekerId (passport)', () => {
  it('returns the redacted passport with factor breakdown + notes', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates/${jsId}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('name');
    expect(res.body.code).toMatch(/^C-/);
    expect(res.body.factors.cgpa.weight).toBe(0.5);
    expect(Array.isArray(res.body.notes)).toBe(true);
  });

  it('404 for a jobseeker not in the pool (Applied stage)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id, { stage: 'Applied' });
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates/${s._id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('PUT .../candidates/:jobseekerId/decision', () => {
  it('upserts an Application and is employer-scoped', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const app = createApp();
    const put = await request(app).put(`/api/me/employer/drives/${d._id}/candidates/${jsId}/decision`).set('Authorization', `Bearer ${tokenFor(a)}`).send({ decision: 'Shortlisted' });
    expect(put.status).toBe(200);
    expect(put.body.decision).toBe('Shortlisted');
    expect(await Application.countDocuments({ employerId: a._id, driveId: d._id, jobseekerId: jsId })).toBe(1);
    // employer B sees NO decision on the same candidate
    const bList = await request(app).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(bList.body.items.find((c: { jobseekerId: string }) => c.jobseekerId === jsId).decision).toBeNull();
  });

  it('clearing the decision to null with no notes deletes the row', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const app = createApp();
    await request(app).put(`/api/me/employer/drives/${d._id}/candidates/${jsId}/decision`).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ decision: 'Hold' });
    await request(app).put(`/api/me/employer/drives/${d._id}/candidates/${jsId}/decision`).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ decision: null });
    expect(await Application.countDocuments({ employerId: emp._id, driveId: d._id, jobseekerId: jsId })).toBe(0);
  });

  it('clearing the decision to null while a note exists keeps the row (decision null, note preserved)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const app = createApp();
    await request(app).put(`/api/me/employer/drives/${d._id}/candidates/${jsId}/decision`).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ decision: 'Shortlisted' });
    await request(app).post(`/api/me/employer/drives/${d._id}/candidates/${jsId}/notes`).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ text: 'keep me' });
    const cleared = await request(app).put(`/api/me/employer/drives/${d._id}/candidates/${jsId}/decision`).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ decision: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.decision).toBeNull();
    const rows = await Application.find({ employerId: emp._id, driveId: d._id, jobseekerId: jsId }).lean();
    expect(rows).toHaveLength(1);              // row NOT deleted — a note still lives on it
    expect(rows[0].decision).toBeNull();
    expect(rows[0].notes).toHaveLength(1);
    expect(rows[0].notes[0].text).toBe('keep me');
  });
});

describe('POST .../candidates/:jobseekerId/notes', () => {
  it('appends a private note visible only to that employer', async () => {
    const a = await employer(); const b = await employer({ email: 'b2@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const app = createApp();
    const note = await request(app).post(`/api/me/employer/drives/${d._id}/candidates/${jsId}/notes`).set('Authorization', `Bearer ${tokenFor(a)}`).send({ text: 'Strong SQL' });
    expect(note.status).toBe(200);
    expect(note.body.notes[0].text).toBe('Strong SQL');
    expect(note.body.notes[0].by).toBe('Jane'); // employer spoc
    const bPass = await request(app).get(`/api/me/employer/drives/${d._id}/candidates/${jsId}`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(bPass.body.notes).toHaveLength(0);
  });

  it('rejects an empty note (400)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/${jsId}/notes`).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ text: '' });
    expect(res.status).toBe(400);
  });
});
