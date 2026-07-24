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

describe('GET /api/me/employer', () => {
  it('401s without a token; 403s for a non-employer token', async () => {
    await Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x' });

    const noTok = await request(createApp()).get('/api/me/employer');
    expect(noTok.status).toBe(401);

    const asAdmin = await request(createApp()).get('/api/me/employer')
      .set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
    expect(asAdmin.status).toBe(403);
  });

  it('returns the employer profile + dashboard shape', async () => {
    const emp = await Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Pending', passwordHash: 'x' });
    const res = await request(createApp()).get('/api/me/employer')
      .set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'employer' })}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ name: 'Acme', status: 'Pending' });
    expect(res.body.profile).not.toHaveProperty('passwordHash');
    expect(res.body.dashboard).toHaveProperty('registrations');
  });

  it('derives dashboard KPIs, activeDrives, pendingActions, and calendarEvents (no PII)', async () => {
    const emp = await Employer.create({ name: 'Acme', industry: 'Tech', email: 'acme@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane' });
    const drive = await Drive.create({
      name: 'Campus Drive 2026', domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
      eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
      eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
      visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' },
    });
    await RegistrationRequest.create({
      company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: drive._id,
      driveName: drive.name, role: 'SDE', status: 'Approved', activity: [],
    });
    const inst = await Institute.create({ name: 'Secret College', city: 'Hyderabad', type: 'Tier-1' });
    await Jobseeker.create({
      name: 'Real Name', email: 'real@x.test', instituteId: inst._id, branch: 'CSE', gradYear: 2026,
      cgpa: 8, source: 'Campus', evaluationStatus: 'completed', stage: 'MatchReady',
    });

    const res = await request(createApp()).get('/api/me/employer')
      .set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'employer' })}`);
    expect(res.status).toBe(200);

    expect(typeof res.body.dashboard.kpis.activeRegistrations).toBe('number');
    expect(res.body.dashboard.kpis.activeRegistrations).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.dashboard.kpis.upcomingMatchDays).toBe('number');

    expect(Array.isArray(res.body.dashboard.activeDrives)).toBe(true);
    expect(res.body.dashboard.activeDrives.length).toBeGreaterThan(0);
    const ad = res.body.dashboard.activeDrives[0];
    expect(ad).toMatchObject({ id: String(drive._id), name: 'Campus Drive 2026', status: 'Approved' });
    expect(typeof ad.primaryEventDate === 'string' || ad.primaryEventDate === null).toBe(true);
    expect(typeof ad.sharedCount).toBe('number');
    expect(ad.sharedCount).toBeGreaterThanOrEqual(1); // the seeded pool seeker

    expect(Array.isArray(res.body.dashboard.pendingActions)).toBe(true);
    for (const a of res.body.dashboard.pendingActions) {
      expect(a).toHaveProperty('id');
      expect(a).toHaveProperty('text');
      expect(['register', 'slot', 'shortlist']).toContain(a.kind);
      expect(['today', 'soon', 'over']).toContain(a.urgency);
    }
    // Approved reg, 0 slots booked, non-empty pool but no decisions yet → both (b) and (c) apply,
    // but the brief's rule is "if 0 slots -> slot action ELSE IF pool non-empty & 0 decisions -> shortlist action"
    expect(res.body.dashboard.pendingActions.some((a: { kind: string }) => a.kind === 'slot')).toBe(true);

    expect(Array.isArray(res.body.dashboard.calendarEvents)).toBe(true);
    expect(res.body.dashboard.calendarEvents.length).toBeGreaterThan(0);
    const ev = res.body.dashboard.calendarEvents[0];
    expect(ev).toMatchObject({ driveName: 'Campus Drive 2026', status: 'Approved' });
    expect(typeof ev.date).toBe('string');
    expect(new Date(ev.date).toISOString()).toBe(ev.date);

    // no PII anywhere in the dashboard payload
    const raw = JSON.stringify(res.body.dashboard);
    for (const pii of ['Real Name', 'real@x.test', 'Secret College', 'Hyderabad']) expect(raw).not.toContain(pii);
  });

  it('dedupes activeDrives by driveId, keeping the highest-priority (Approved) registration', async () => {
    const emp = await Employer.create({ name: 'Acme', industry: 'Tech', email: 'acme2@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane' });
    const drive = await Drive.create({
      name: 'Repeat Drive 2026', domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
      eventDates: [new Date('2026-09-10')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
      eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
      visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' },
    });
    // A Rejected reg first, then a re-Approved reg for the SAME drive — two rows, one drive.
    await RegistrationRequest.create({
      company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: drive._id,
      driveName: drive.name, role: 'SDE', status: 'Rejected', activity: [],
    });
    await RegistrationRequest.create({
      company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: drive._id,
      driveName: drive.name, role: 'SDE', status: 'Approved', activity: [],
    });

    const res = await request(createApp()).get('/api/me/employer')
      .set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'employer' })}`);
    expect(res.status).toBe(200);

    const matching = res.body.dashboard.activeDrives.filter((d: { id: string }) => d.id === String(drive._id));
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({ status: 'Approved' });

    // pendingActions urgency ordering: 'today' (slot booking, from the Approved reg
    // with 0 slots) must be present before any 'soon' action.
    const urgencies = res.body.dashboard.pendingActions.map((a: { urgency: string }) => a.urgency);
    const firstToday = urgencies.indexOf('today');
    const firstSoon = urgencies.indexOf('soon');
    if (firstToday !== -1 && firstSoon !== -1) expect(firstToday).toBeLessThan(firstSoon);
  });
});
