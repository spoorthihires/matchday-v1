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
function fstage(funnel: any[], stage: string) { return funnel.find((f) => f.stage === stage); }

describe('GET /api/me/employer/reports', () => {
  it('derives the monotonic funnel + KPIs for a drive', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const now = new Date();
    const plain = await seeker(inst._id, { email: 'p@x.test' });                     // pool only → Recommended
    const short = await seeker(inst._id, { email: 's@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: short._id, decision: 'Shortlisted' });   // Shortlisted
    const confirmed = await seeker(inst._id, { email: 'c@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: confirmed._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });   // Confirmed
    const interviewed = await seeker(inst._id, { email: 'i@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: interviewed._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    const sl = await Slot.create({ driveId: d._id, employerId: emp._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00', capacity: 10, status: 'Scheduled', link: 'x' });
    await Interview.create({ employerId: emp._id, driveId: d._id, jobseekerId: interviewed._id, slotId: sl._id, time: '10:30', status: 'Scheduled' });   // Interviewed
    const joined = await seeker(inst._id, { email: 'j@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: joined._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now }, offer: { status: 'Joined', response: 'Accepted', ctc: 10, mode: 'Hybrid' } });   // Offered+Accepted+Joined

    const res = await request(createApp()).get(`/api/me/employer/drives`).set('Authorization', `Bearer ${tokenFor(emp)}`); // warm (unrelated) — ignore
    const rep = await request(createApp()).get(`/api/me/employer/reports?driveId=${d._id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(rep.status).toBe(200);
    const f = rep.body.funnel;
    expect(fstage(f, 'Recommended').count).toBe(5);
    expect(fstage(f, 'Shortlisted').count).toBe(4);   // short, confirmed, interviewed, joined
    expect(fstage(f, 'Confirmed').count).toBe(3);      // confirmed, interviewed, joined (consent granted)
    expect(fstage(f, 'Interviewed').count).toBe(2);    // interviewed (flowIdx>=Scheduled) + joined (Joined>=Scheduled)
    expect(fstage(f, 'Offered').count).toBe(1);        // joined (Joined>=Offer Sent)
    expect(fstage(f, 'Joined').count).toBe(1);
    // monotonic + conversion
    expect(fstage(f, 'Recommended').conversionPct).toBe(100);
    expect(fstage(f, 'Shortlisted').conversionPct).toBe(80);   // 4/5
    expect(rep.body.kpis).toMatchObject({ recommended: 5, shortlisted: 4, interviewsScheduled: 1, offersSent: 1, offersAccepted: 1 });
    expect(rep.body.kpis.avgMatchScore).toBeGreaterThan(0);
    // no PII
    const raw = JSON.stringify(rep.body);
    expect(raw).not.toContain('Real Name');
    expect(raw).not.toContain('real@x.test');
    // drives list for the selector
    expect(rep.body.drives.some((x: { id: string }) => x.id === String(d._id))).toBe(true);
  });

  it('driveId=all aggregates across the employer\'s approved drives', async () => {
    const emp = await employer(); const inst = await institute();
    const d1 = await drive(); const d2 = await drive({ name: 'D2' });
    await approve(emp, d1); await approve(emp, d2);
    const s1 = await seeker(inst._id, { email: 'a1@x.test' }); await Application.create({ employerId: emp._id, driveId: d1._id, jobseekerId: s1._id, decision: 'Shortlisted' });
    const s2 = await seeker(inst._id, { email: 'a2@x.test' }); await Application.create({ employerId: emp._id, driveId: d2._id, jobseekerId: s2._id, decision: 'Shortlisted' });
    const rep = await request(createApp()).get(`/api/me/employer/reports?driveId=all`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(rep.status).toBe(200);
    expect(rep.body.scope).toBe('all');
    // both drives share the same pool (same eligibility), so recommended = 2 × pool; shortlisted sums to 2
    expect(fstage(rep.body.funnel, 'Shortlisted').count).toBe(2);
    expect(rep.body.drives).toHaveLength(2);
  });

  it('gates: non-approved drive → 400; unknown/invalid → 404; employer-scoped; 401/403', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); const inst = await institute();
    const s = await seeker(inst._id); await Application.create({ employerId: b._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted' }); // B's data
    const app = createApp();
    // A has no registration for d → 400
    expect((await request(app).get(`/api/me/employer/reports?driveId=${d._id}`).set('Authorization', `Bearer ${tokenFor(a)}`)).body.error.code).toBe('registration_not_approved');
    await approve(a, d);
    // A's report over d counts none of B's applications
    const repA = await request(app).get(`/api/me/employer/reports?driveId=${d._id}`).set('Authorization', `Bearer ${tokenFor(a)}`);
    expect(fstage(repA.body.funnel, 'Shortlisted').count).toBe(0);
    // unknown id → 404
    expect((await request(app).get(`/api/me/employer/reports?driveId=${new Types.ObjectId()}`).set('Authorization', `Bearer ${tokenFor(a)}`)).status).toBe(404);
    // 401 / 403
    expect((await request(app).get(`/api/me/employer/reports?driveId=all`)).status).toBe(401);
    expect((await request(app).get(`/api/me/employer/reports?driveId=all`).set('Authorization', `Bearer ${signToken({ sub: String(a._id), role: 'admin' })}`)).status).toBe(403);
  });
});
