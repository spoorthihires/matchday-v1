import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Employer } from '../src/models/Employer.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { listEmployers, createEmployer, getEmployer, updateEmployer, bulkEmployerAction } from '../src/modules/employers/employers.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const input = (over = {}) => ({ name: 'Nexatech Labs', industry: 'Product · SaaS' as const, size: '201–1000' as const, spoc: 'R. Iyer', email: 'talent@nexatech.com', status: 'Active' as const, ...over });

describe('employers.service', () => {
  it('creates with audit and lists with stat columns', async () => {
    const e = await createEmployer(input(), 'Platform Admin');
    await Employer.updateOne({ _id: e._id }, { $set: { activeDrives: 3, candidatesViewed: 240, shortlistRate: 44, offerRate: 18, respHours: 9 } });
    expect((await AuditLog.find({ entityType: 'employer', entityId: e._id })).map((l) => l.action)).toContain('created');
    const res = await listEmployers({});
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({ name: 'Nexatech Labs', activeDrives: 3, shortlistRate: 44, respHours: 9 });
  });

  it('filters by q/industry/status and sorts by a stat column', async () => {
    await createEmployer(input(), 'Platform Admin');
    await createEmployer(input({ name: 'Quantbridge', industry: 'Fintech' as const, status: 'Pending' as const }), 'Platform Admin');
    await Employer.updateOne({ name: 'Quantbridge' }, { $set: { respHours: 40 } });
    expect((await listEmployers({ q: 'quant' })).total).toBe(1);
    expect((await listEmployers({ industry: 'Fintech' })).total).toBe(1);
    expect((await listEmployers({ status: 'Pending' })).total).toBe(1);
    const sorted = await listEmployers({ sort: 'respHours', order: 'desc' });
    expect(sorted.items[0].name).toBe('Quantbridge');
  });

  it('updates with the right audit action, bulk-approves, and 404s', async () => {
    const a = await createEmployer(input({ status: 'Pending' as const }), 'Platform Admin');
    const upd = await updateEmployer(String(a._id), { status: 'Active' }, 'Platform Admin');
    expect(upd.status).toBe('Active');
    expect((await AuditLog.find({ entityId: a._id })).map((l) => l.action)).toContain('approved');
    const b = await createEmployer(input({ name: 'B Co', status: 'Pending' as const }), 'Platform Admin');
    const res = await bulkEmployerAction([String(b._id)], 'approve', 'Platform Admin');
    expect(res.affected).toBe(1);
    await expect(getEmployer('64b000000000000000000000')).rejects.toThrow();
    await expect(getEmployer('not-an-id')).rejects.toThrow();
  });
});
