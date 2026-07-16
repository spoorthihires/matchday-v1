import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Employer } from '../src/models/Employer.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Slot } from '../src/models/Slot.js';
import { Drive } from '../src/models/Drive.js';
import { listEmployers, createEmployer, getEmployer, updateEmployer, bulkEmployerAction } from '../src/modules/employers/employers.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const input = (over = {}) => ({ name: 'Nexatech Labs', industry: 'Product · SaaS' as const, size: '201–1000' as const, spoc: 'R. Iyer', email: 'talent@nexatech.com', status: 'Active' as const, ...over });

describe('employers.service', () => {
  it('creates with audit and lists with stat columns', async () => {
    const e = await createEmployer(input(), 'Platform Admin');
    // activeDrives is no longer a stored stat (derived from Slot participation — see the
    // dedicated describe block below), so it's not part of this $set / assertion anymore.
    await Employer.updateOne({ _id: e._id }, { $set: { candidatesViewed: 240, shortlistRate: 44, offerRate: 18, respHours: 9 } });
    expect((await AuditLog.find({ entityType: 'employer', entityId: e._id })).map((l) => l.action)).toContain('created');
    const res = await listEmployers({});
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({ name: 'Nexatech Labs', shortlistRate: 44, respHours: 9 });
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

describe('employers.service — derived activeDrives (from Slot participation)', () => {
  async function emp(name: string) {
    return Employer.create({ name, industry: 'Product · SaaS', status: 'Active' });
  }
  async function drv(name: string) {
    return Drive.create({ name, domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });
  }
  const slot = (employerId: unknown, driveId: unknown) =>
    Slot.create({ driveId, employerId, date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity: 10, booked: 0, held: 0, status: 'Scheduled' });

  it('derives activeDrives = distinct drives an employer has slots in (dedup; 0 when none)', async () => {
    const a = await emp('Alpha'); const b = await emp('Beta'); const c = await emp('Gamma');
    const d1 = await drv('FE'); const d2 = await drv('BE');
    // Alpha: 2 slots on the SAME drive → 1 distinct
    await slot(a._id, d1._id); await slot(a._id, d1._id);
    // Beta: 2 slots on 2 different drives → 2 distinct
    await slot(b._id, d1._id); await slot(b._id, d2._id);
    // Gamma: no slots → 0
    const { items } = await listEmployers({ limit: 100 });
    const byName = Object.fromEntries(items.map((i) => [i.name, i.activeDrives]));
    expect(byName.Alpha).toBe(1);
    expect(byName.Beta).toBe(2);
    expect(byName.Gamma).toBe(0);
  });

  it('sort=drives orders by the derived count', async () => {
    const a = await emp('Alpha'); const b = await emp('Beta');
    const d1 = await drv('FE'); const d2 = await drv('BE'); const d3 = await drv('ML');
    await slot(a._id, d1._id);                                  // Alpha → 1
    await slot(b._id, d1._id); await slot(b._id, d2._id); await slot(b._id, d3._id);  // Beta → 3
    const { items } = await listEmployers({ sort: 'drives', order: 'desc', limit: 100 });
    expect(items[0].name).toBe('Beta');    // 3 before 1
    expect(items[0].activeDrives).toBe(3);
  });

  it('ignores any stored value — activeDrives comes only from slots', async () => {
    // create with an attempted stored activeDrives (Mongoose strips unknown paths after the field is removed)
    const a = await Employer.create({ name: 'Zeta', industry: 'Fintech', status: 'Active' });
    const { items } = await listEmployers({ limit: 100 });
    expect(items.find((i) => i.name === 'Zeta')!.activeDrives).toBe(0);  // no slots → 0, regardless of any legacy stored number
  });
});
