import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Drive } from '../src/models/Drive.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Employer } from '../src/models/Employer.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('models', () => {
  it('persists an institute and a jobseeker referencing it', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering' });
    const js = await Jobseeker.create({
      name: 'Aarav Sharma', instituteId: inst._id, branch: 'CSE',
      gradYear: 2026, cgpa: 8.4, source: 'Campus',
      profileCompleted: true, evaluationStatus: 'completed', stage: 'MatchReady',
    });
    expect(js.stage).toBe('MatchReady');
    expect(String(js.instituteId)).toBe(String(inst._id));
    expect(inst.status).toBe('Active');
  });

  it('rejects an invalid stage', async () => {
    const inst = await Institute.create({ name: 'X', city: 'Y', type: 'Z' });
    await expect(
      Jobseeker.create({ name: 'Bad', instituteId: inst._id, branch: 'CSE',
        gradYear: 2026, cgpa: 8, source: 'Campus', stage: 'Nonsense' as never }),
    ).rejects.toThrow();
  });

  it('persists an expanded drive with nested eligibility, evaluation, visibility', async () => {
    const d = await Drive.create({
      name: 'FE Cohort', domain: 'Frontend', stream: 'B.Tech', status: 'Draft',
      candType: 'Freshers', mode: 'Hybrid', frequency: 'One-time', eventDay: 'Wednesday',
      eventDates: [new Date('2026-07-15T04:30:00.000Z')],
      candCap: 500, empCap: 9, slotCap: 360,
      eligibility: { sources: ['Institutes'], branches: ['CSE', 'IT'], gradYears: [2026], expType: 'Freshers only' },
      evaluation: [{ key: 'mcq', enabled: true, config: { questions: 30, durationMin: 30 } }],
      visibility: { employerReg: 'Invite-only', instituteVis: 'Selected institutes', candidateAccess: 'Eligible only' },
      createdBy: 'Platform Admin',
    });
    expect(d.eventDates).toHaveLength(1);
    expect(d.eligibility.branches).toEqual(['CSE', 'IT']);
    expect(d.evaluation[0].key).toBe('mcq');
    expect(d.visibility.employerReg).toBe('Invite-only');
  });

  it('rejects an invalid drive mode', async () => {
    await expect(
      Drive.create({ name: 'X', domain: 'Frontend', stream: 'B.Tech', mode: 'Telepathic' as never }),
    ).rejects.toThrow();
  });

  it('persists an institute with owner/email/ownershipHistory', async () => {
    const inst = await Institute.create({
      name: 'CBIT', city: 'Hyderabad', type: 'Engineering College', status: 'Active',
      owner: 'Sharath P.', email: 'spoc@cbit.edu',
      ownershipHistory: [{ owner: 'Sharath P.', email: 'spoc@cbit.edu', changedBy: 'Platform Admin' }],
    });
    expect(inst.owner).toBe('Sharath P.');
    expect(inst.ownershipHistory).toHaveLength(1);
    expect(inst.ownershipHistory[0].changedAt).toBeInstanceOf(Date);
  });

  it('accepts a legacy institute without owner/email (additive defaults)', async () => {
    const inst = await Institute.create({ name: 'X', city: 'Y', type: 'Engineering' });
    expect(inst.owner).toBe('');
    expect(inst.ownershipHistory).toEqual([]);
  });

  it('writes an audit log', async () => {
    const log = await AuditLog.create({ entityType: 'institute', entityId: '64b000000000000000000000', action: 'created', actor: 'Platform Admin', detail: 'Created CBIT' });
    expect(log.action).toBe('created');
    expect(log.at).toBeInstanceOf(Date);
  });

  it('persists a jobseeker with email and consent, defaulting consent to Granted', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College' });
    const withEmail = await Jobseeker.create({ name: 'A', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', email: 'a@cbit.edu' });
    expect(withEmail.email).toBe('a@cbit.edu');
    expect(withEmail.consent).toBe('Granted');
    const noEmail = await Jobseeker.create({ name: 'B', instituteId: inst._id, branch: 'IT', gradYear: 2026, cgpa: 7, source: 'Campus' });
    expect(noEmail.email).toBe('');
    expect(noEmail.consent).toBe('Granted');
  });

  it('rejects an invalid consent value', async () => {
    const inst = await Institute.create({ name: 'X', city: 'Y', type: 'Bootcamp' });
    await expect(
      Jobseeker.create({ name: 'C', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', consent: 'Maybe' as never }),
    ).rejects.toThrow();
  });

  it('persists employer additive fields with defaults', async () => {
    const e = await Employer.create({ name: 'Nexatech', industry: 'Product · SaaS' });
    expect(e.size).toBe('51–200');
    expect(e.respHours).toBe(0);
    const f = await Employer.create({ name: 'Full', industry: 'Fintech', size: '1000+', spoc: 'A B', email: 't@x.com', activeDrives: 3, candidatesViewed: 120, shortlistRate: 40, offerRate: 15, respHours: 12 });
    expect(f.size).toBe('1000+');
    expect(f.shortlistRate).toBe(40);
  });

  it('persists a registration request with panel and activity', async () => {
    const r = await RegistrationRequest.create({
      company: 'Vaultline Systems', industry: 'Fintech', role: 'Backend Engineer (Go)',
      openings: 6, ctcRange: '₹18–26 LPA', skills: ['Go', 'PostgreSQL'],
      slot: 'Wed, Jul 16 · 10:00–12:00', panel: [{ name: 'A. Khanna', role: 'Engineering Manager' }],
      jd: 'We are hiring…', submittedBy: 'D. Sharma',
      activity: [{ action: 'Submitted for review', by: 'D. Sharma (Vaultline)' }],
    });
    expect(r.status).toBe('Pending review');
    expect(r.panel[0].name).toBe('A. Khanna');
    expect(r.activity[0].at).toBeInstanceOf(Date);
    await expect(RegistrationRequest.create({ company: 'X', industry: 'Y', role: 'Z', status: 'Maybe' as never })).rejects.toThrow();
  });
});
