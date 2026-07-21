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

describe('reveal gating (read side)', () => {
  it('candidates/passport carry consent:null + revealed:null when no request exists', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    const list = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(list.body.items[0].consent).toBeNull();
    expect(list.body.items[0].revealed).toBeNull();
    const pp = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates/${s._id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(pp.body.consent).toBeNull();
    expect(pp.body.revealed).toBeNull();
    expect(pp.body).not.toHaveProperty('name');
  });

  it('reveals identity ONLY when consent.status is granted', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    const now = new Date();
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted',
      consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    const pp = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates/${s._id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(pp.body.consent.status).toBe('granted');
    expect(pp.body.revealed).toEqual({ name: 'Real Name', email: 'real@x.test', institute: 'Secret College', city: 'Hyderabad' });
    const list = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(list.body.items[0].revealed.name).toBe('Real Name');
  });

  it('does NOT reveal for requested / declined (identity stays masked)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s1 = await seeker(inst._id);
    const s2 = await seeker(inst._id, { email: 's2@x.test' });
    const now = new Date();
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s1._id, decision: 'Shortlisted',
      consent: { status: 'requested', requestedAt: now, expiresAt: new Date(now.getTime() + 3600_000) } });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s2._id, decision: 'Shortlisted',
      consent: { status: 'declined', requestedAt: now, expiresAt: now, respondedAt: now } });
    const list = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    for (const item of list.body.items) expect(item.revealed).toBeNull();
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain('Real Name');
    expect(raw).not.toContain('s2@x.test');
  });
});
