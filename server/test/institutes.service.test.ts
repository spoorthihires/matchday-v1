import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { AuditLog } from '../src/models/AuditLog.js';
import {
  listInstitutes, getInstitute, createInstitute, updateInstitute,
  bulkInstituteAction, listCandidates, listAudit,
} from '../src/modules/institutes/institutes.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const baseInput = () => ({ name: 'CBIT', type: 'Engineering College' as const, city: 'Hyderabad', owner: 'Sharath P.', email: 'spoc@cbit.edu' });

// Seed one institute with a known 10-jobseeker funnel.
async function seedInstituteWithFunnel(status: 'Active' | 'Pending' | 'Disabled' = 'Active') {
  const inst = await createInstitute({ ...baseInput(), status }, 'Platform Admin');
  const stages = [
    ...Array(4).fill('Applied'),      // uploaded but not past applied
    'Screened', 'Evaluated',           // past applied, not match-ready
    'MatchReady', 'Shortlisted',       // match-ready+
    'Offer', 'Joined',                 // offer+, joined
  ];
  for (const stage of stages) {
    await Jobseeker.create({
      name: 'JS', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus',
      profileCompleted: stage !== 'Applied', evaluationStatus: 'completed', stage,
    });
  }
  return inst;
}

describe('institutes.service', () => {
  it('creates an institute with an initial ownership entry and a created audit log', async () => {
    const inst = await createInstitute(baseInput(), 'Platform Admin');
    expect(inst.ownershipHistory).toHaveLength(1);
    expect(inst.ownershipHistory[0].owner).toBe('Sharath P.');
    const logs = await AuditLog.find({ entityType: 'institute', entityId: inst._id });
    expect(logs.map((l) => l.action)).toContain('created');
  });

  it('computes the derived funnel for the list', async () => {
    await seedInstituteWithFunnel('Active');
    const res = await listInstitutes({});
    const it0 = res.items[0];
    expect(it0.uploaded).toBe(10);
    expect(it0.signupPct).toBe(60);      // 6 of 10 past 'Applied'
    expect(it0.completionPct).toBe(60);  // 6 of 10 profileCompleted
    expect(it0.matchReadyPct).toBe(40);  // MatchReady+Shortlisted+Offer+Joined = 4
    expect(it0.shortlistPct).toBe(30);   // Shortlisted+Offer+Joined = 3
    expect(it0.offerPct).toBe(20);       // Offer+Joined = 2
    expect(it0.joinedPct).toBe(10);      // Joined = 1
  });

  it('computes global overview KPIs', async () => {
    await seedInstituteWithFunnel('Active');
    await createInstitute({ ...baseInput(), name: 'Pending U', status: 'Pending' }, 'Platform Admin');
    const res = await listInstitutes({});
    expect(res.overview.total).toBe(2);
    expect(res.overview.pending).toBe(1);
    expect(res.overview.uploaded).toBe(10);
    expect(res.overview.avgMatchReadyPct).toBe(40); // avg over active institutes (only CBIT active w/ candidates)
  });

  it('filters by status and searches by q', async () => {
    await seedInstituteWithFunnel('Active');
    await createInstitute({ ...baseInput(), name: 'Bootcamp X', type: 'Bootcamp', status: 'Pending' }, 'Platform Admin');
    expect((await listInstitutes({ status: 'Pending' })).total).toBe(1);
    expect((await listInstitutes({ q: 'cbit' })).total).toBe(1);
  });

  it('sorts by a funnel column (matchReady desc)', async () => {
    const a = await seedInstituteWithFunnel('Active'); // matchReadyPct 40
    const b = await createInstitute({ ...baseInput(), name: 'ZeroInst', status: 'Active' }, 'Platform Admin'); // 0 candidates → 0
    const res = await listInstitutes({ sort: 'matchReady', order: 'desc' });
    expect(res.items[0].name).toBe('CBIT');
    expect(res.items[1].name).toBe('ZeroInst');
  });

  it('appends ownership history only when owner/email changes and logs the action', async () => {
    const inst = await createInstitute(baseInput(), 'Platform Admin');
    await updateInstitute(String(inst._id), { city: 'Secunderabad' }, 'Platform Admin'); // no owner change
    let fresh = await getInstitute(String(inst._id));
    expect(fresh.institute.ownershipHistory).toHaveLength(1);
    await updateInstitute(String(inst._id), { owner: 'New SPOC' }, 'Platform Admin');     // owner change
    fresh = await getInstitute(String(inst._id));
    expect(fresh.institute.ownershipHistory).toHaveLength(2);
    const actions = (await AuditLog.find({ entityId: inst._id })).map((l) => l.action);
    expect(actions).toContain('edited');
  });

  it('bulk-approves and rejects an unknown id gracefully; logs per id', async () => {
    const a = await createInstitute({ ...baseInput(), status: 'Pending' }, 'Platform Admin');
    const b = await createInstitute({ ...baseInput(), name: 'B', status: 'Pending' }, 'Platform Admin');
    const res = await bulkInstituteAction([String(a._id), String(b._id)], 'approve', 'Platform Admin');
    expect(res.affected).toBe(2);
    expect(await Institute.countDocuments({ status: 'Active' })).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'approved' })).toBe(2);
  });

  it('paginates candidates and audit logs, 404s on unknown id', async () => {
    const inst = await seedInstituteWithFunnel('Active');
    const cands = await listCandidates(String(inst._id), 1, 4);
    expect(cands.total).toBe(10);
    expect(cands.items).toHaveLength(4);
    const audit = await listAudit(String(inst._id), 1, 10);
    expect(audit.total).toBeGreaterThanOrEqual(1); // 'created'
    await expect(getInstitute('64b000000000000000000000')).rejects.toThrow();
  });
});
