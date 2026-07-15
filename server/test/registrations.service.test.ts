import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { listRegistrations, getRegistration, applyAction } from '../src/modules/registrations/registrations.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function seedReg(over = {}) {
  return RegistrationRequest.create({
    company: 'Vaultline Systems', industry: 'Fintech', role: 'Backend Engineer (Go)',
    openings: 6, ctcRange: '₹18–26 LPA', skills: ['Go'], slot: 'Wed, Jul 16 · 10:00–12:00',
    panel: [{ name: 'A. Khanna', role: 'EM' }], jd: 'JD text', submittedBy: 'D. Sharma',
    activity: [{ action: 'Submitted for review', by: 'D. Sharma (Vaultline)' }], ...over,
  });
}

describe('registrations.service', () => {
  it('lists newest-first with counts', async () => {
    await seedReg();
    await seedReg({ company: 'Northpeak Cloud', status: 'Approved' });
    const res = await listRegistrations();
    expect(res.items).toHaveLength(2);
    expect(res.counts).toEqual({ pending: 1, total: 2 });
    expect((await listRegistrations('Approved')).items).toHaveLength(1);
  });

  it('approve creates the employer when absent (case-insensitive) and logs activity', async () => {
    const r = await seedReg();
    const upd = await applyAction(String(r._id), { action: 'approve' }, 'Platform Admin');
    expect(upd.status).toBe('Approved');
    expect(upd.activity[0].action).toBe('Approved');
    const created = await Employer.findOne({ name: 'Vaultline Systems' });
    expect(created).toBeTruthy();
    expect(created!.industry).toBe('Fintech');
    expect(created!.spoc).toBe('D. Sharma');
    expect(created!.status).toBe('Active');
    expect((await AuditLog.find({ entityType: 'employer', entityId: created!._id })).map((l) => l.action)).toContain('created');
  });

  it('approve does NOT duplicate an existing employer (case-insensitive)', async () => {
    await Employer.create({ name: 'VAULTLINE SYSTEMS', industry: 'Fintech', status: 'Pending' });
    const r = await seedReg();
    await applyAction(String(r._id), { action: 'approve' }, 'Platform Admin');
    expect(await Employer.countDocuments({ name: /vaultline/i })).toBe(1);
    expect((await Employer.findOne({ name: /vaultline/i }))!.status).toBe('Pending'); // untouched
  });

  it('reject/request-changes record the text and closed registrations 400 further decisions', async () => {
    const r = await seedReg();
    const rej = await applyAction(String(r._id), { action: 'reject', reason: 'CTC unclear' }, 'Platform Admin');
    expect(rej.status).toBe('Rejected');
    expect(rej.activity[0].action).toBe('Rejected — CTC unclear');
    await expect(applyAction(String(r._id), { action: 'approve' }, 'Platform Admin')).rejects.toThrow(/closed/i);
    const r2 = await seedReg({ company: 'Cartsy' });
    const ch = await applyAction(String(r2._id), { action: 'request-changes', note: 'clarify band' }, 'Platform Admin');
    expect(ch.status).toBe('Changes requested');
    expect(ch.activity[0].action).toBe('Changes requested — clarify band');
  });

  it('move-drive resolves + denormalizes; change-slot updates; both allowed on closed', async () => {
    const d = await Drive.create({ name: 'Backend · July Cohort', domain: 'Backend', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-16T04:30:00.000Z')] });
    const r = await seedReg({ status: 'Approved' });
    const moved = await applyAction(String(r._id), { action: 'move-drive', driveId: String(d._id) }, 'Platform Admin');
    expect(String(moved.driveId)).toBe(String(d._id));
    expect(moved.driveName).toBe('Backend · July Cohort');
    expect(moved.activity[0].action).toBe('Moved to drive: Backend · July Cohort');
    const slotted = await applyAction(String(r._id), { action: 'change-slot', slot: 'Sat, Jul 26 · 11:00–13:00' }, 'Platform Admin');
    expect(slotted.slot).toBe('Sat, Jul 26 · 11:00–13:00');
    await expect(applyAction(String(r._id), { action: 'move-drive', driveId: '64b000000000000000000000' }, 'Platform Admin')).rejects.toThrow();
    await expect(getRegistration('64b000000000000000000000')).rejects.toThrow();
  });
});
