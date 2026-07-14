import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Drive } from '../src/models/Drive.js';

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
});
