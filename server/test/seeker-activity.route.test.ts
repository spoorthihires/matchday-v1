import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Application } from '../src/models/Application.js';
import { Slot } from '../src/models/Slot.js';
import { Interview } from '../src/models/Interview.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function scenario() {
  const inst = await Institute.create({ name: 'CBIT', city: 'Hyd', type: 'Tier-1' });
  const emp = await Employer.create({ name: 'Acme Corp', industry: 'Tech', email: 'a@a.test', status: 'Active' });
  const d = await Drive.create({ name: 'Aug Drive', domain: 'Data / ML', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday' });
  const js = await Jobseeker.create({ name: 'Aarav', email: 'aarav@x.test', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', stage: 'Shortlisted', passwordHash: 'hash' });

  const slot = await Slot.create({ driveId: d._id, employerId: emp._id, date: new Date('2026-08-05'), start: '10:00', end: '10:30', link: 'https://meet.example.test/abc' });

  const app = await Application.create({
    employerId: emp._id, driveId: d._id, jobseekerId: js._id, decision: 'Shortlisted',
    offer: { status: 'Sent', response: 'Pending', ctc: 900000, location: 'Hyderabad', mode: 'Hybrid', joinDate: new Date('2026-09-01'), declineReason: '' },
  });

  const interview = await Interview.create({
    employerId: emp._id, driveId: d._id, jobseekerId: js._id, slotId: slot._id,
    time: '10:15', interviewers: ['Priya', 'Rahul'], status: 'Scheduled',
  });

  return { inst, emp, d, js, slot, app, interview };
}

function jsToken(js: { _id: unknown }) { return signToken({ sub: String(js._id), role: 'jobseeker' }); }

describe('GET /api/me/portal/interviews', () => {
  it('lists only this jobseeker\'s interviews, with company/drive/slot details', async () => {
    const { js, emp, d, slot, interview } = await scenario();
    const res = await request(createApp()).get('/api/me/portal/interviews').set('Authorization', `Bearer ${jsToken(js)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      interviewId: String(interview._id),
      company: emp.name,
      driveName: d.name,
      date: new Date(slot.date).toISOString(),
      start: slot.start,
      end: slot.end,
      time: '10:15',
      status: 'Scheduled',
      link: slot.link,
      interviewers: ['Priya', 'Rahul'],
    });

    const otherInst = await Institute.create({ name: 'X', city: 'Y', type: 'Z' });
    const other = await Jobseeker.create({ name: 'Bob', instituteId: otherInst._id, branch: 'ECE', gradYear: 2026, cgpa: 7, source: 'Campus', stage: 'MatchReady', passwordHash: 'hash' });
    const none = await request(createApp()).get('/api/me/portal/interviews').set('Authorization', `Bearer ${jsToken(other)}`);
    expect(none.status).toBe(200);
    expect(none.body.items).toHaveLength(0);
  });

  it('401 without a token, 403 for admin/employer tokens', async () => {
    const { emp } = await scenario();
    expect((await request(createApp()).get('/api/me/portal/interviews')).status).toBe(401);
    const adminTok = signToken({ sub: 'u1', role: 'admin' });
    expect((await request(createApp()).get('/api/me/portal/interviews').set('Authorization', `Bearer ${adminTok}`)).status).toBe(403);
    const empTok = signToken({ sub: String(emp._id), role: 'employer' });
    expect((await request(createApp()).get('/api/me/portal/interviews').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);
  });
});

describe('GET /api/me/portal/offers', () => {
  it('lists only offers in a seeker-facing state, hiding Draft offers', async () => {
    const { js, emp, d, app } = await scenario();

    // second application, offer still Draft -> must be absent
    const emp2 = await Employer.create({ name: 'Beta Inc', industry: 'Tech', email: 'b@b.test', status: 'Active' });
    const d2 = await Drive.create({ name: 'Sep Drive', domain: 'Data / ML', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-09-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday' });
    await Application.create({ employerId: emp2._id, driveId: d2._id, jobseekerId: js._id, decision: 'Shortlisted', offer: { status: 'Draft', response: 'Pending' } });

    const res = await request(createApp()).get('/api/me/portal/offers').set('Authorization', `Bearer ${jsToken(js)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      applicationId: String(app._id),
      company: emp.name,
      driveName: d.name,
      status: 'Sent',
      response: 'Pending',
      ctc: 900000,
      location: 'Hyderabad',
      mode: 'Hybrid',
      joinDate: new Date('2026-09-01').toISOString(),
      declineReason: '',
    });
    expect(res.body.items[0]).not.toHaveProperty('passwordHash');
  });

  it('401 without a token, 403 for admin/employer tokens', async () => {
    const { emp } = await scenario();
    expect((await request(createApp()).get('/api/me/portal/offers')).status).toBe(401);
    const adminTok = signToken({ sub: 'u1', role: 'admin' });
    expect((await request(createApp()).get('/api/me/portal/offers').set('Authorization', `Bearer ${adminTok}`)).status).toBe(403);
    const empTok = signToken({ sub: String(emp._id), role: 'employer' });
    expect((await request(createApp()).get('/api/me/portal/offers').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);
  });
});

describe('POST /api/me/portal/offers/:applicationId/respond', () => {
  it('Accepted sets response only, status stays Sent', async () => {
    const { js, app } = await scenario();
    const res = await request(createApp()).post(`/api/me/portal/offers/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ response: 'Accepted' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ response: 'Accepted' });

    const read = await Application.findById(app._id).lean();
    expect(read?.offer?.response).toBe('Accepted');
    expect(read?.offer?.status).toBe('Sent');

    const getRes = await request(createApp()).get('/api/me/portal/offers').set('Authorization', `Bearer ${jsToken(js)}`);
    expect(getRes.body.items[0]).toMatchObject({ response: 'Accepted', status: 'Sent' });
  });

  it('Declined with a reason sets both response and declineReason', async () => {
    const { js, app } = await scenario();
    const res = await request(createApp()).post(`/api/me/portal/offers/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ response: 'Declined', declineReason: 'x' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ response: 'Declined' });

    const read = await Application.findById(app._id).lean();
    expect(read?.offer?.response).toBe('Declined');
    expect(read?.offer?.declineReason).toBe('x');
    expect(read?.offer?.status).toBe('Sent');
  });

  it('400 offer_not_actionable when the offer is still Draft', async () => {
    const { js, emp, d } = await scenario();
    // Application schema enforces a unique (employerId, driveId, jobseekerId) triple, and scenario()
    // already created one for (emp, d, js) with a Sent offer — so use a second employer/drive here.
    const emp2 = await Employer.create({ name: 'Beta Inc', industry: 'Tech', email: 'b@b.test', status: 'Active' });
    const d2 = await Drive.create({ name: 'Sep Drive', domain: 'Data / ML', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-09-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday' });
    const draftApp = await Application.create({ employerId: emp2._id, driveId: d2._id, jobseekerId: js._id, decision: 'Shortlisted', offer: { status: 'Draft', response: 'Pending' } });
    const res = await request(createApp()).post(`/api/me/portal/offers/${draftApp._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ response: 'Accepted' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('offer_not_actionable');
  });

  it('404 for a foreign application id (no oracle)', async () => {
    const { app } = await scenario();
    const otherInst = await Institute.create({ name: 'X', city: 'Y', type: 'Z' });
    const other = await Jobseeker.create({ name: 'Bob', instituteId: otherInst._id, branch: 'ECE', gradYear: 2026, cgpa: 7, source: 'Campus', stage: 'MatchReady', passwordHash: 'hash' });
    const res = await request(createApp()).post(`/api/me/portal/offers/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(other)}`).send({ response: 'Accepted' });
    expect(res.status).toBe(404);
  });

  it('401 without a token, 403 for admin/employer tokens', async () => {
    const { js, emp, app } = await scenario();
    expect((await request(createApp()).post(`/api/me/portal/offers/${app._id}/respond`).send({ response: 'Accepted' })).status).toBe(401);
    const adminTok = signToken({ sub: 'u1', role: 'admin' });
    expect((await request(createApp()).post(`/api/me/portal/offers/${app._id}/respond`).set('Authorization', `Bearer ${adminTok}`).send({ response: 'Accepted' })).status).toBe(403);
    const empTok = signToken({ sub: String(emp._id), role: 'employer' });
    expect((await request(createApp()).post(`/api/me/portal/offers/${app._id}/respond`).set('Authorization', `Bearer ${empTok}`).send({ response: 'Accepted' })).status).toBe(403);
    void js;
  });
});
