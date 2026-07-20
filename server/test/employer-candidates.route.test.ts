import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
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
    expect(c.code).toMatch(/^C-/);
    expect(c.instituteCategory).toBe('Tier-1');   // Institute.type, NOT its name/city
    expect(c.matchScore).toBe(82);                // cgpa8/completed/MatchReady → 100*(.5*.8+.3*1+.2*.6)
    expect(c.evalPill).toBe('Strong');
    expect(c.decision).toBeNull();
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
