import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Drive } from '../src/models/Drive.js';
import { Employer } from '../src/models/Employer.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Slot } from '../src/models/Slot.js';
import { getPortal, isEligible, statusTag } from '../src/modules/seekerPortal/seekerPortal.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('statusTag', () => {
  it('maps stages to Selected / In progress / Closed', () => {
    expect(statusTag('Applied')).toBe('In progress');
    expect(statusTag('MatchReady')).toBe('In progress');
    expect(statusTag('Shortlisted')).toBe('Selected');
    expect(statusTag('Joined')).toBe('Selected');
    expect(statusTag('DroppedOff')).toBe('Closed');
  });
});

describe('isEligible', () => {
  const seeker = { branch: 'CSE', gradYear: 2026, source: 'Campus' };
  it('treats empty constraints as no constraint', () => {
    expect(isEligible({ branches: [], gradYears: [], sources: [] }, seeker)).toBe(true);
    expect(isEligible(undefined, seeker)).toBe(true);
  });
  it('rejects on any mismatched non-empty constraint', () => {
    expect(isEligible({ branches: ['IT'] }, seeker)).toBe(false);
    expect(isEligible({ gradYears: [2025] }, seeker)).toBe(false);
    expect(isEligible({ sources: ['Institutes'] }, seeker)).toBe(false);
  });
  it('accepts when all non-empty constraints match', () => {
    expect(isEligible({ branches: ['CSE'], gradYears: [2026], sources: ['Campus'] }, seeker)).toBe(true);
  });
});

describe('getPortal', () => {
  it('returns profile, journey, and eligible drives with employers + status tag', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College' });
    const emp = await Employer.create({ name: 'Acme Corp', industry: 'Tech' });
    const drive = await Drive.create({
      name: 'CSE Drive', domain: 'Backend', status: 'Active',
      eventDates: [new Date('2026-08-05T04:30:00.000Z')],
      eligibility: { sources: [], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    });
    await Slot.create({ driveId: drive._id, employerId: emp._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00' });
    await Drive.create({
      name: 'ECE only', domain: 'Hardware', status: 'Active',
      eligibility: { sources: [], branches: ['ECE'], gradYears: [2026], expType: '' },
    });
    await Drive.create({ name: 'Draft drive', status: 'Draft', eligibility: { branches: ['CSE'], gradYears: [2026], sources: [] } });
    const seeker = await Jobseeker.create({
      name: 'Aarav K', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8,
      source: 'Campus', email: 's@x.edu', stage: 'Offer', evaluationStatus: 'completed',
    });

    const res = await getPortal(String(seeker._id));
    expect(res.profile).toMatchObject({ name: 'Aarav K', institute: 'CBIT', branch: 'CSE', gradYear: 2026 });
    expect(res.profile.code).toMatch(/^C-/);
    expect(res.journey.stage).toBe('Offer');
    expect(res.journey.stages).toContain('MatchReady');
    expect(res.journey.stages).not.toContain('DroppedOff');
    expect(res.journey.offerStatus).toBe('Offer sent');
    expect(res.drives).toHaveLength(1);                        // ECE-only excluded, Draft excluded
    expect(res.drives[0]).toMatchObject({ name: 'CSE Drive', statusTag: 'Selected', employers: ['Acme Corp'] });
    expect(res.drives[0].eventDates[0]).toContain('2026-08-05');
  });

  it('404s for an unknown or malformed id', async () => {
    await expect(getPortal('64b000000000000000000000')).rejects.toThrow();
    await expect(getPortal('not-an-id')).rejects.toThrow();
  });
});
