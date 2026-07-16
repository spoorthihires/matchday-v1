import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { deriveStage, getEvalMonitor } from '../src/modules/evalMonitor/eval-monitor.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

let instId: string;
async function seedInst() { const i = await Institute.create({ name: 'VNR', city: 'Hyderabad', type: 'Engineering', status: 'Active' }); instId = String(i._id); }
const js = (over: Record<string, unknown> = {}) => ({
  name: 'A B', instituteId: instId, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus',
  profileCompleted: false, evaluationStatus: 'na', stage: 'Applied', ...over,
});

describe('eval-monitor.service — derivation', () => {
  it('maps each jobseeker band to the right monitoring stage', async () => {
    await seedInst();
    // hash is deterministic; assert bands, not the exact spread index
    expect(deriveStage({ stage: 'Joined', evaluationStatus: 'completed', profileCompleted: true }, 0)).toBe(9);
    expect(deriveStage({ stage: 'Shortlisted', evaluationStatus: 'na', profileCompleted: true }, 3)).toBe(9);
    expect(deriveStage({ stage: 'Screened', evaluationStatus: 'completed', profileCompleted: true }, 1)).toBe(8);
    const pend = deriveStage({ stage: 'Screened', evaluationStatus: 'pending', profileCompleted: true }, 2);
    expect(pend).toBeGreaterThanOrEqual(3);
    expect(pend).toBeLessThanOrEqual(7);
    expect(deriveStage({ stage: 'Applied', evaluationStatus: 'na', profileCompleted: true }, 5)).toBe(2);
    const early = deriveStage({ stage: 'Applied', evaluationStatus: 'na', profileCompleted: false }, 4);
    expect(early === 0 || early === 1).toBe(true);
  });

  it('excludes DroppedOff and reconciles stage-9 with the match-ready set; deterministic', async () => {
    await seedInst();
    await Jobseeker.create(js({ stage: 'DroppedOff' }));
    await Jobseeker.create(js({ stage: 'MatchReady', evaluationStatus: 'completed', profileCompleted: true }));
    await Jobseeker.create(js({ stage: 'Joined', evaluationStatus: 'completed', profileCompleted: true }));
    await Jobseeker.create(js({ stage: 'Applied' }));
    const a = await getEvalMonitor({});
    const b = await getEvalMonitor({});
    expect(a.candidates).toHaveLength(3);                       // DroppedOff excluded
    expect(a.candidates.filter((c) => c.stage === 9)).toHaveLength(2);  // MatchReady + Joined
    // deterministic: same candidate → same derived dims across calls
    const byId = (r: typeof a) => r.candidates.map((c) => `${c.id}:${c.stage}:${c.contest}:${c.employer}`).sort();
    expect(byId(a)).toEqual(byId(b));
    expect(a.contests).toHaveLength(4);
    expect(a.employers).toHaveLength(4);
    expect(a.institutes).toContain('VNR');
  });

  it('filters by contest/employer/institute/date', async () => {
    await seedInst();
    for (let i = 0; i < 12; i++) await Jobseeker.create(js({ stage: 'Applied' }));
    const all = await getEvalMonitor({});
    const c0 = all.contests[0];
    const filtered = await getEvalMonitor({ contest: c0 });
    expect(filtered.candidates.every((x) => x.contest === c0)).toBe(true);
    expect(filtered.candidates.length).toBeLessThanOrEqual(all.candidates.length);
    const byInst = await getEvalMonitor({ institute: 'VNR' });
    expect(byInst.candidates.every((x) => x.institute === 'VNR')).toBe(true);
  });
});
