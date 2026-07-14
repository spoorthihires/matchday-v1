import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Slot } from '../src/models/Slot.js';
import { getOverview } from '../src/modules/dashboard/dashboard.service.js';

const NOW = new Date('2026-07-12T10:00:00.000Z'); // a Sunday; next Wed is Jul 15

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function seedFixture() {
  const recent = new Date('2026-07-01T00:00:00.000Z'); // within 30d of NOW
  const old = new Date('2026-05-20T00:00:00.000Z');    // in prior 30d window

  const cbit = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering', status: 'Active', createdAt: old });
  const vnr = await Institute.create({ name: 'VNR', city: 'Hyderabad', type: 'Engineering', status: 'Active', createdAt: recent });

  await Employer.create({ name: 'Nexatech', industry: 'Product', status: 'Active', offersExtended: 19, slotsFillRate: 95, createdAt: old });
  await Employer.create({ name: 'Aetherverse', industry: 'ML', status: 'Active', offersExtended: 14, slotsFillRate: 87, createdAt: recent });
  await Employer.create({ name: 'Pending Co', industry: 'SaaS', status: 'Pending', offersExtended: 0, slotsFillRate: 0, createdAt: recent });

  await Drive.create({ name: 'Frontend Cohort', domain: 'Web', stream: 'Frontend', status: 'Active', eventDate: new Date('2026-07-15T04:30:00.000Z'), candCap: 500, empCap: 9, slotCap: 360, createdAt: old });
  await Drive.create({ name: 'Fullstack Cohort', domain: 'Web', stream: 'Fullstack', status: 'Active', eventDate: new Date('2026-07-22T04:30:00.000Z'), candCap: 280, empCap: 7, slotCap: 280, createdAt: recent });
  await Drive.create({ name: 'Old Draft', domain: 'Data', stream: 'DE', status: 'Draft', eventDate: new Date('2026-06-01T04:30:00.000Z'), candCap: 100, empCap: 3, slotCap: 90, createdAt: old });
  await Drive.create({ name: 'Thursday Drive', domain: 'Data', stream: 'DE', status: 'Active', eventDate: new Date('2026-07-16T04:30:00.000Z'), candCap: 100, empCap: 3, slotCap: 90, createdAt: recent });

  // 10 jobseekers with known stages/flags. 6 created recent, 4 old.
  const mk = (over: Record<string, unknown>, createdAt: Date, inst = cbit._id) =>
    Jobseeker.create({ name: 'JS', instituteId: inst, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', ...over, createdAt });

  // CBIT: 3 match-ready, VNR: 1 match-ready
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'MatchReady' }, recent, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'MatchReady' }, recent, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'Shortlisted' }, recent, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'MatchReady' }, recent, vnr._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'Offer' }, recent, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'Joined' }, recent, vnr._id);
  await mk({ profileCompleted: true, evaluationStatus: 'pending', stage: 'Evaluated' }, old, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'pending', stage: 'Screened' }, old, cbit._id);
  await mk({ profileCompleted: false, evaluationStatus: 'na', stage: 'Applied' }, old, vnr._id);
  await mk({ profileCompleted: false, evaluationStatus: 'na', stage: 'DroppedOff' }, old, vnr._id);

  const drive = await Drive.findOne({ name: 'Frontend Cohort' });
  const emp = await Employer.findOne({ name: 'Nexatech' });
  // slots for next matchday (Jul 15): 6 booked, 2 held, 2 available => total 10, util 60%
  for (let i = 0; i < 6; i++) await Slot.create({ driveId: drive!._id, employerId: emp!._id, date: new Date('2026-07-15T04:30:00.000Z'), start: '10:00', end: '12:00', status: 'booked' });
  for (let i = 0; i < 2; i++) await Slot.create({ driveId: drive!._id, employerId: emp!._id, date: new Date('2026-07-15T04:30:00.000Z'), start: '14:00', end: '16:00', status: 'held' });
  for (let i = 0; i < 2; i++) await Slot.create({ driveId: drive!._id, employerId: null, date: new Date('2026-07-15T04:30:00.000Z'), start: '16:30', end: '18:00', status: 'available' });
}

describe('getOverview', () => {
  it('computes KPI counts from the fixture', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    const kpi = (k: string) => o.kpis.find((x) => x.key === k)!;
    expect(kpi('activeDrives').value).toBe(3);
    expect(kpi('upcomingWednesdays').value).toBe(2);
    expect(kpi('employerRegistrations').value).toBe(3);
    expect(kpi('instituteParticipation').value).toBe(2);
    expect(kpi('jobseekersAdded').value).toBe(10);
    expect(kpi('profilesCompleted').value).toBe(8);
    expect(kpi('evaluationsCompleted').value).toBe(6);
    expect(kpi('matchReady').value).toBe(6);   // reached match-ready or beyond (MatchReady 3 + Shortlisted 1 + Offer 1 + Joined 1)
    expect(kpi('shortlisted').value).toBe(3);  // Shortlisted 1 + Offer 1 + Joined 1
    expect(kpi('offersSent').value).toBe(2);   // Offer 1 + Joined 1
    expect(kpi('joined').value).toBe(1);       // unchanged
  });

  it('computes slot utilization', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    expect(o.slotUtilization).toMatchObject({ booked: 6, held: 2, available: 2, total: 10, utilizedPct: 60 });
  });

  it('computes readiness score and pillars', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    // supply pillar = matchReady(3)/target * 100 (small on tiny fixture), slots = 60, evals = completed6/(6+2)=75
    const slots = o.readiness.pillars.find((p) => p.key === 'slots')!;
    const evals = o.readiness.pillars.find((p) => p.key === 'evaluations')!;
    expect(slots.pct).toBe(60);
    expect(evals.pct).toBe(75);
    expect(o.readiness.score).toBeGreaterThanOrEqual(0);
    expect(o.readiness.score).toBeLessThanOrEqual(100);
    expect(['ontrack', 'at-risk', 'off-track']).toContain(o.readiness.verdict.tone);
  });

  it('builds the institute leaderboard ranked by match-ready', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    expect(o.leaderboards.institutes[0].name).toBe('CBIT');
    expect(o.leaderboards.institutes[0].ready).toBe(4);
    expect(o.leaderboards.institutes[0].rank).toBe(1);
  });

  it('builds the employer leaderboard ranked by offers', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    expect(o.leaderboards.employers[0].name).toBe('Nexatech');
    expect(o.leaderboards.employers[0].offers).toBe(19);
  });

  it('lists upcoming matchday events and picks the next matchday', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    expect(o.readiness.nextMatchDay.startsWith('2026-07-15')).toBe(true);
    expect(o.schedule.events.length).toBeGreaterThanOrEqual(1);
    expect(o.schedule.events[0].title).toContain('Frontend');
    expect(o.schedule.events[0].status).toBe('prep');
  });
});
