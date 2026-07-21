import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Application } from '../src/models/Application.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function scenario(consentOver: Record<string, unknown>) {
  const inst = await Institute.create({ name: 'CBIT', city: 'Hyd', type: 'Tier-1' });
  const emp = await Employer.create({ name: 'Acme Corp', industry: 'Tech', email: 'a@a.test', status: 'Active' });
  const d = await Drive.create({ name: 'Aug Drive', domain: 'Data / ML', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday' });
  const js = await Jobseeker.create({ name: 'Aarav', email: 'aarav@x.test', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', stage: 'MatchReady' });
  const now = new Date();
  const app = await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: js._id, decision: 'Shortlisted',
    consent: { status: 'requested', requestedAt: now, expiresAt: new Date(now.getTime() + 3600_000), ...consentOver } });
  return { emp, d, js, app };
}
function jsToken(js: { _id: unknown }) { return signToken({ sub: String(js._id), role: 'jobseeker' }); }

describe('GET /api/me/portal/reveal-requests', () => {
  it('lists only this jobseeker\'s requests, with the requesting company', async () => {
    const { js } = await scenario({});
    const other = await Jobseeker.create({ name: 'Bob', instituteId: (await Institute.create({ name: 'X', city: 'Y', type: 'Z' }))._id, branch: 'ECE', gradYear: 2026, cgpa: 7, source: 'Campus', stage: 'MatchReady' });
    const res = await request(createApp()).get('/api/me/portal/reveal-requests').set('Authorization', `Bearer ${jsToken(js)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ company: 'Acme Corp', driveName: 'Aug Drive', status: 'requested', expired: false });
    // the other jobseeker sees nothing
    const none = await request(createApp()).get('/api/me/portal/reveal-requests').set('Authorization', `Bearer ${jsToken(other)}`);
    expect(none.body.items).toHaveLength(0);
  });

  it('401 without a token, 403 for an employer token', async () => {
    const { js, emp } = await scenario({});
    expect((await request(createApp()).get('/api/me/portal/reveal-requests')).status).toBe(401);
    const empTok = signToken({ sub: String(emp._id), role: 'employer' });
    expect((await request(createApp()).get('/api/me/portal/reveal-requests').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);
  });
});

describe('POST /api/me/portal/reveal-requests/:applicationId/respond', () => {
  it('grant sets the consent to granted', async () => {
    const { js, app } = await scenario({});
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'grant' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('granted');
    const read = await Application.findById(app._id).lean();
    expect(read?.consent?.status).toBe('granted');
    expect(read?.consent?.respondedAt).toBeTruthy();
  });

  it('deny sets the consent to declined', async () => {
    const { js, app } = await scenario({});
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'deny' });
    expect(res.body.status).toBe('declined');
  });

  it('404 for another jobseeker\'s application (no oracle)', async () => {
    const { app } = await scenario({});
    const other = await Jobseeker.create({ name: 'Bob', instituteId: (await Institute.create({ name: 'X', city: 'Y', type: 'Z' }))._id, branch: 'ECE', gradYear: 2026, cgpa: 7, source: 'Campus', stage: 'MatchReady' });
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(other)}`).send({ decision: 'grant' });
    expect(res.status).toBe(404);
  });

  it('400 already_responded when already granted', async () => {
    const { js, app } = await scenario({ status: 'granted', respondedAt: new Date() });
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'grant' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('already_responded');
  });

  it('400 request_expired for an expired request', async () => {
    const past = new Date(Date.now() - 3600_000);
    const { js, app } = await scenario({ requestedAt: past, expiresAt: past });
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'grant' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('request_expired');
  });

  it('400 on an invalid decision', async () => {
    const { js, app } = await scenario({});
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'maybe' });
    expect(res.status).toBe(400);
  });
});
