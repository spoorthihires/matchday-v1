import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { applyAction } from '../src/modules/registrations/registrations.service.js';
import { getEmployerPortal } from '../src/modules/employerPortal/employerPortal.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function drive(over: Record<string, unknown> = {}) {
  return Drive.create({
    name: 'D',
    domain: 'Data / ML',
    stream: 'B.Tech',
    status: 'Active',
    eventDates: [new Date('2026-08-05')],
    candCap: 100,
    empCap: 8,
    slotCap: 20,
    frequency: 'Weekly',
    eventDay: 'Wednesday',
    eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    evaluation: [{ key: 'mcq', enabled: true, config: {} }],
    visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' },
    ...over,
  });
}

async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Pending', passwordHash: 'x', spoc: 'Jane SPOC', ...over });
}

const ACTOR = 'Platform Admin';

describe('admin approval reuses the linked employer (employerId-aware upsertEmployerFrom)', () => {
  it('approving an employerId-linked registration does NOT create a duplicate Employer, and activates a Pending one', async () => {
    const emp = await employer({ status: 'Pending' });
    const d = await drive();
    const reg = await RegistrationRequest.create({
      company: emp.name, industry: emp.industry, submittedBy: emp.spoc, employerId: emp._id,
      driveId: d._id, driveName: d.name, role: 'Data Analyst', openings: 3, status: 'Pending review',
      activity: [{ action: 'Submitted', by: emp.spoc, at: new Date() }],
    });

    const before = await Employer.countDocuments({});
    const updated = await applyAction(String(reg._id), { action: 'approve' }, ACTOR);
    const after = await Employer.countDocuments({});

    expect(updated.status).toBe('Approved');
    expect(after).toBe(before); // no duplicate created
    const refreshed = await Employer.findById(emp._id);
    expect(refreshed!.status).toBe('Active'); // Pending -> Active
  });

  it('a null-employerId registration still name-matches/creates via the fallback path', async () => {
    const reg = await RegistrationRequest.create({
      company: 'Vaultline Systems', industry: 'Fintech', role: 'Backend Engineer (Go)',
      submittedBy: 'D. Sharma', employerId: null, status: 'Pending review',
      activity: [{ action: 'Submitted', by: 'D. Sharma', at: new Date() }],
    });
    const before = await Employer.countDocuments({});
    await applyAction(String(reg._id), { action: 'approve' }, ACTOR);
    const after = await Employer.countDocuments({});
    expect(after).toBe(before + 1);
    const created = await Employer.findOne({ name: 'Vaultline Systems' });
    expect(created).toBeTruthy();
    expect(created!.status).toBe('Active');
  });

  it('a null-employerId registration matching an existing employer by name does NOT create a duplicate', async () => {
    await Employer.create({ name: 'Northpeak Cloud', industry: 'SaaS', status: 'Active' });
    const reg = await RegistrationRequest.create({
      company: 'NORTHPEAK CLOUD', industry: 'SaaS', role: 'SRE',
      submittedBy: 'Someone', employerId: null, status: 'Pending review',
      activity: [{ action: 'Submitted', by: 'Someone', at: new Date() }],
    });
    const before = await Employer.countDocuments({});
    await applyAction(String(reg._id), { action: 'approve' }, ACTOR);
    const after = await Employer.countDocuments({});
    expect(after).toBe(before);
  });

  it('reaches the same behavior through the admin HTTP endpoint', async () => {
    const emp = await employer({ status: 'Pending', name: 'Ecomm Nexus' });
    const d = await drive();
    const reg = await RegistrationRequest.create({
      company: emp.name, industry: emp.industry, submittedBy: emp.spoc, employerId: emp._id,
      driveId: d._id, driveName: d.name, role: 'Data Analyst', openings: 3, status: 'Pending review',
      activity: [{ action: 'Submitted', by: emp.spoc, at: new Date() }],
    });
    const app = createApp();
    const adminTok = signToken({ sub: 'admin1', role: 'admin' });
    const before = await Employer.countDocuments({});
    const res = await request(app).post(`/api/registrations/${reg._id}/action`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
    const after = await Employer.countDocuments({});
    expect(after).toBe(before);
    expect((await Employer.findById(emp._id))!.status).toBe('Active');
  });
});

describe('employer dashboard registrations (live data)', () => {
  it('getEmployerPortal returns non-empty dashboard.registrations for an employer with a registration', async () => {
    const emp = await employer({ status: 'Active' });
    const d = await drive();
    await RegistrationRequest.create({
      company: emp.name, industry: emp.industry, submittedBy: emp.spoc, employerId: emp._id,
      driveId: d._id, driveName: d.name, role: 'Data Analyst', openings: 3, status: 'Pending review',
      activity: [{ action: 'Submitted', by: emp.spoc, at: new Date() }],
    });

    const portal = await getEmployerPortal(String(emp._id));
    expect(portal.dashboard.registrations.length).toBeGreaterThan(0);
    expect(portal.dashboard.registrations[0]).toMatchObject({ driveName: 'D', role: 'Data Analyst', status: 'Pending review' });
    expect(portal.dashboard.registrations[0]).toHaveProperty('id');
  });

  it('returns an empty array when the employer has no registrations', async () => {
    const emp = await employer();
    const portal = await getEmployerPortal(String(emp._id));
    expect(portal.dashboard.registrations).toEqual([]);
  });
});
