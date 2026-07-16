import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { deriveStage, getEvalMonitor } from '../src/modules/evalMonitor/eval-monitor.service.js';
import { getOverview } from '../src/modules/dashboard/dashboard.service.js';

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

    // employer filter
    const e0 = all.employers[0];
    const byEmp = await getEvalMonitor({ employer: e0 });
    expect(byEmp.candidates.every((x) => x.employer === e0)).toBe(true);

    // date filter — 'Today' caps minsAgo at 1440; every returned candidate must be within the cap,
    // and the result is a (non-strict) subset of the unfiltered set.
    const byDate = await getEvalMonitor({ date: 'Today' });
    expect(byDate.candidates.every((x) => x.minsAgo <= 1440)).toBe(true);
    expect(byDate.candidates.length).toBeLessThanOrEqual(all.candidates.length);

    // 'All time' applies no cap → returns everything
    const allTime = await getEvalMonitor({ date: 'All time' });
    expect(allTime.candidates.length).toBe(all.candidates.length);
  });

  // Cross-service reconciliation: the monitor's stage-9 count MUST equal the Command Center's
  // matchReady KPI computed by the dashboard service over the same DB. If anyone later changes
  // the CC's terminal-stage set, the two figures diverge and this test fails loudly.
  it('stage-9 count reconciles with the Command Center matchReady KPI over the same DB', async () => {
    await seedInst();
    // In BOTH the monitor stage-9 set and the CC matchReady set:
    await Jobseeker.create(js({ stage: 'MatchReady', evaluationStatus: 'completed', profileCompleted: true }));
    await Jobseeker.create(js({ stage: 'Shortlisted', evaluationStatus: 'completed', profileCompleted: true }));
    await Jobseeker.create(js({ stage: 'Offer', evaluationStatus: 'completed', profileCompleted: true }));
    await Jobseeker.create(js({ stage: 'Joined', evaluationStatus: 'completed', profileCompleted: true }));
    // Excluded from both:
    await Jobseeker.create(js({ stage: 'DroppedOff' }));
    // In neither (pre-terminal):
    await Jobseeker.create(js({ stage: 'Applied' }));
    await Jobseeker.create(js({ stage: 'Screened', evaluationStatus: 'pending', profileCompleted: true }));

    const monitor = await getEvalMonitor({});
    const stage9 = monitor.candidates.filter((c) => c.stage === 9).length;

    const overview = await getOverview();
    const matchReadyKpi = overview.kpis.find((k) => k.key === 'matchReady');
    expect(matchReadyKpi).toBeDefined();

    // Both must see exactly the 4 terminal-stage jobseekers.
    expect(stage9).toBe(4);
    expect(stage9).toBe(matchReadyKpi!.value);
  });
});
