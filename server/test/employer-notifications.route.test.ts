import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Institute } from '../src/models/Institute.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { Application } from '../src/models/Application.js';
import { Slot } from '../src/models/Slot.js';
import { SlotBooking } from '../src/models/SlotBooking.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane', ...over });
}
function tokenFor(e: { _id: unknown }) { return signToken({ sub: String(e._id), role: 'employer' }); }
async function drive(name = 'Data Drive') {
  return Drive.create({
    name, domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
    eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' },
  });
}
async function seeker(email: string, name: string) {
  const inst = await Institute.create({ name: 'Smoke College', city: 'Hyderabad', type: 'Tier-1' });
  return Jobseeker.create({ name, email, instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', evaluationStatus: 'completed', stage: 'MatchReady' });
}

describe('GET /api/me/employer/notifications', () => {
  it('derives the feed (3 categories, newest-first, PII-free) + unread flags', async () => {
    const emp = await employer(); const d = await drive();
    const t0 = new Date('2026-07-01T10:00:00Z'), t1 = new Date('2026-07-02T10:00:00Z'), t2 = new Date('2026-07-03T10:00:00Z'), t3 = new Date('2026-07-04T10:00:00Z');
    // registration events (Submitted excluded; Approved + Rejected included)
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: d.name, role: 'SDE', status: 'Approved', activity: [{ action: 'Approved', by: 'admin', at: t2 }, { action: 'Submitted', by: 'Jane', at: t0 }] });
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: d.name, role: 'DA', status: 'Rejected', activity: [{ action: 'Rejected — off cycle', by: 'admin', at: t1 }] });
    // consent events
    const sG = await seeker('grant@x.test', 'Grant Name');
    const sD = await seeker('deny@x.test', 'Deny Name');
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: sG._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: t0, expiresAt: t3, respondedAt: t3 } });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: sD._id, decision: 'Shortlisted', consent: { status: 'declined', requestedAt: t0, expiresAt: t3, respondedAt: t1 } });
    // slot booking
    const sB = await seeker('book@x.test', 'Book Name');
    const slot = await Slot.create({ driveId: d._id, employerId: emp._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00', capacity: 10, status: 'Scheduled' });
    await SlotBooking.create({ slotId: slot._id, jobseekerId: sB._id, status: 'Booked', createdAt: t2 });

    const res = await request(createApp()).get('/api/me/employer/notifications').set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    const items = res.body.items as { category: string; at: string; read: boolean; body: string }[];
    expect(items).toHaveLength(5); // Approved, Rejected, granted, declined, booking (Submitted excluded)
    expect(items.filter((i) => i.category === 'registration')).toHaveLength(2);
    expect(items.filter((i) => i.category === 'candidate')).toHaveLength(2);
    expect(items.filter((i) => i.category === 'slot')).toHaveLength(1);
    // newest-first
    const times = items.map((i) => i.at);
    expect(times).toEqual([...times].sort().reverse());
    // unread: cursor unset → all unread
    expect(res.body.unreadCount).toBe(5);
    expect(items.every((i) => i.read === false)).toBe(true);
    expect(res.body.lastReadAt).toBeNull();
    // NO PII
    const raw = JSON.stringify(res.body);
    for (const n of ['Grant Name', 'Deny Name', 'Book Name', 'grant@x.test', 'deny@x.test', 'book@x.test']) expect(raw).not.toContain(n);
    // codes present
    expect(raw).toContain('C-');
  });

  it('mark-read sets the cursor: unread→0, items read, persisted', async () => {
    const emp = await employer(); const d = await drive();
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: d.name, role: 'SDE', status: 'Approved', activity: [{ action: 'Approved', by: 'admin', at: new Date('2026-07-02T10:00:00Z') }] });
    const app = createApp(); const auth = { Authorization: `Bearer ${tokenFor(emp)}` };
    expect((await request(app).get('/api/me/employer/notifications').set(auth)).body.unreadCount).toBe(1);
    const marked = await request(app).post('/api/me/employer/notifications/read').set(auth);
    expect(marked.status).toBe(200);
    expect(marked.body.unreadCount).toBe(0);
    expect(typeof marked.body.lastReadAt).toBe('string');
    const after = await request(app).get('/api/me/employer/notifications').set(auth);
    expect(after.body.unreadCount).toBe(0);
    expect((after.body.items as { read: boolean }[]).every((i) => i.read)).toBe(true);
    expect(after.body.lastReadAt).not.toBeNull();
  });

  it('is employer-scoped; aggregate exposes counts; 401/403', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive();
    await RegistrationRequest.create({ company: 'Beta', industry: 'Tech', submittedBy: 'Bob', employerId: b._id, driveId: d._id, driveName: d.name, role: 'SDE', status: 'Approved', activity: [{ action: 'Approved', by: 'admin', at: new Date() }] });
    const app = createApp();
    // A sees none of B's
    expect((await request(app).get('/api/me/employer/notifications').set('Authorization', `Bearer ${tokenFor(a)}`)).body.items).toHaveLength(0);
    // aggregate for B includes the count + recent
    const agg = await request(app).get('/api/me/employer').set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(agg.body.dashboard.notificationsUnread).toBe(1);
    expect(agg.body.dashboard.notifications).toHaveLength(1);
    // 401 / 403
    expect((await request(app).get('/api/me/employer/notifications')).status).toBe(401);
    expect((await request(app).post('/api/me/employer/notifications/read').set('Authorization', `Bearer ${signToken({ sub: String(a._id), role: 'admin' })}`)).status).toBe(403);
  });
});
