import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import {
  listJobseekers, addJobseeker, getJobseeker, updateJobseeker, blockJobseekers,
} from '../src/modules/jobseekers/jobseekers.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

let instId: string;
async function seed() {
  const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College', status: 'Active' });
  instId = String(inst._id);
  const mk = (over: Record<string, unknown>) => Jobseeker.create({
    name: 'JS', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus',
    profileCompleted: true, evaluationStatus: 'completed', ...over,
  });
  await mk({ name: 'Aarav', stage: 'MatchReady', email: 'dup@x.edu', consent: 'Granted' });
  await mk({ name: 'Diya', stage: 'Shortlisted', email: 'dup@x.edu', consent: 'Granted' });  // shares email → dup risk
  await mk({ name: 'Vihaan', stage: 'Offer', email: 'v@x.edu', consent: 'Pending' });
  await mk({ name: 'Ananya', stage: 'Joined', email: 'a@x.edu', consent: 'Granted' });
  await mk({ name: 'Rohan', stage: 'Applied', email: 'r@x.edu', evaluationStatus: 'na', profileCompleted: false });
  await mk({ name: 'Meera', stage: 'DroppedOff', email: 'm@x.edu' });
}

describe('jobseekers.service', () => {
  it('lists with derived display fields and code', async () => {
    await seed();
    const res = await listJobseekers({ sort: 'name', order: 'asc' });
    expect(res.total).toBe(6);
    const aarav = res.items.find((x) => x.name === 'Aarav')!;
    expect(aarav.offerStatus).toBe('None');          // MatchReady → None
    expect(aarav.matchReadinessPct).toBe(75);        // MatchReady → 75
    expect(aarav.evaluationLabel).toBe('Completed');
    expect(aarav.instituteName).toBe('CBIT');
    expect(aarav.code).toMatch(/^C-[0-9A-F]{6}$/);
    expect(aarav.dupRisk).toBe('High');              // shares dup@x.edu with Diya
    const rohan = res.items.find((x) => x.name === 'Rohan')!;
    expect(rohan.dupRisk).toBe('Low');
    expect(rohan.evaluationLabel).toBe('Not started');
    expect(res.items.find((x) => x.name === 'Vihaan')!.offerStatus).toBe('Offer sent');
    expect(res.items.find((x) => x.name === 'Meera')!.offerStatus).toBe('Rejected');
  });

  it('filters by offer status (derived → stage)', async () => {
    await seed();
    expect((await listJobseekers({ offer: 'Joined' })).total).toBe(1);           // Ananya
    expect((await listJobseekers({ offer: 'None' })).total).toBe(2);             // MatchReady(Aarav) + Applied(Rohan)
    expect((await listJobseekers({ offer: 'Rejected' })).total).toBe(1);         // Meera
  });

  it('filters by matchBucket, consent, and institute', async () => {
    await seed();
    expect((await listJobseekers({ matchBucket: 'high' })).total).toBe(4);       // MatchReady/Shortlisted/Offer/Joined
    expect((await listJobseekers({ matchBucket: 'low' })).total).toBe(2);        // Applied + DroppedOff
    expect((await listJobseekers({ consent: 'Pending' })).total).toBe(1);        // Vihaan
    expect((await listJobseekers({ instituteId: instId })).total).toBe(6);
  });

  it('sorts by matchReady descending (stage ordinal)', async () => {
    await seed();
    const res = await listJobseekers({ sort: 'matchReady', order: 'desc' });
    expect(res.items[0].name).toBe('Ananya');   // Joined = 100
  });

  it('adds a jobseeker with Applied defaults', async () => {
    await seed();
    const js = await addJobseeker({ name: 'New', instituteId: instId, branch: 'IT', gradYear: 2026, cgpa: 7 });
    expect(js.stage).toBe('Applied');
    expect(js.consent).toBe('Granted');
  });

  it('updates, blocks (consent → Revoked), and 404s', async () => {
    await seed();
    const one = await Jobseeker.findOne({ name: 'Aarav' });
    const upd = await updateJobseeker(String(one!._id), { branch: 'ECE' });
    expect(upd.branch).toBe('ECE');
    const two = await Jobseeker.find({}).limit(2);
    const res = await blockJobseekers(two.map((j) => String(j._id)));
    expect(res.affected).toBe(2);
    expect(await Jobseeker.countDocuments({ consent: 'Revoked' })).toBe(2);
    await expect(getJobseeker('64b000000000000000000000')).rejects.toThrow();
  });
});
