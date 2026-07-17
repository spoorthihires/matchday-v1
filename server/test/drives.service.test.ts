import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Drive } from '../src/models/Drive.js';
import { DriveTemplate } from '../src/models/DriveTemplate.js';
import { Stream } from '../src/models/Stream.js';
import { EvalConfig } from '../src/models/EvalConfig.js';
import {
  listDrives, createDrive, getDrive, updateDrive, cloneDrive, bulkAction,
} from '../src/modules/drives/drives.service.js';

const NOW = new Date('2026-07-12T00:00:00.000Z');

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const baseInput = () => ({
  name: 'Frontend Cohort', domain: 'Frontend', stream: 'B.Tech', status: 'Draft' as const,
  candType: 'Freshers' as const, mode: 'Hybrid' as const, frequency: 'One-time' as const,
  eventDay: 'Wednesday' as const, eventDates: [new Date('2026-07-15T04:30:00.000Z')],
  candCap: 500, empCap: 9, slotCap: 360,
  eligibility: { sources: ['Institutes'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
  evaluation: [{ key: 'mcq' as const, enabled: true, config: { questions: 30 } }],
  visibility: { employerReg: 'Invite-only' as const, instituteVis: 'Selected institutes' as const, candidateAccess: 'Eligible only' as const },
});

async function seedThree() {
  await createDrive({ ...baseInput(), name: 'Alpha Frontend', domain: 'Frontend', stream: 'B.Tech', status: 'Published' }, 'Admin');
  await createDrive({ ...baseInput(), name: 'Beta Backend', domain: 'Backend', stream: 'M.Tech', status: 'Draft', eventDates: [new Date('2026-08-19T04:30:00.000Z')] }, 'Admin');
  await createDrive({ ...baseInput(), name: 'Gamma Data', domain: 'Data / ML', stream: 'MCA', status: 'Active' }, 'Admin');
}

describe('drives.service', () => {
  it('creates a drive persisting the full payload with createdBy', async () => {
    const d = await createDrive(baseInput(), 'Platform Admin');
    expect(d.createdBy).toBe('Platform Admin');
    expect(d.eventDates).toHaveLength(1);
    expect(d.eligibility.branches).toEqual(['CSE']);
  });

  it('lists with pagination metadata', async () => {
    await seedThree();
    const res = await listDrives({ page: 1, limit: 2 }, NOW);
    expect(res.total).toBe(3);
    expect(res.items).toHaveLength(2);
    expect(res.page).toBe(1);
    expect(res.limit).toBe(2);
  });

  it('filters by status, domain, and search q', async () => {
    await seedThree();
    expect((await listDrives({ status: 'Draft' }, NOW)).total).toBe(1);
    expect((await listDrives({ domain: 'Backend' }, NOW)).total).toBe(1);
    expect((await listDrives({ q: 'front' }, NOW)).total).toBe(1); // case-insensitive on name/domain/stream
  });

  it('filters by month (YYYY-MM) using event dates', async () => {
    await seedThree();
    expect((await listDrives({ month: '2026-08' }, NOW)).total).toBe(1); // only Beta (Aug)
    expect((await listDrives({ month: '2026-07' }, NOW)).total).toBe(2); // Alpha + Gamma (Jul)
  });

  it('sorts by name ascending', async () => {
    await seedThree();
    const res = await listDrives({ sort: 'name', order: 'asc' }, NOW);
    expect(res.items.map((d) => d.name)).toEqual(['Alpha Frontend', 'Beta Backend', 'Gamma Data']);
  });

  it('sorts by name case-insensitively (collation)', async () => {
    await createDrive({ ...baseInput(), name: 'Zebra Cohort' }, 'Admin');
    await createDrive({ ...baseInput(), name: 'apple cohort' }, 'Admin');
    const res = await listDrives({ sort: 'name', order: 'asc' }, NOW);
    expect(res.items.map((d) => d.name)).toEqual(['apple cohort', 'Zebra Cohort']);
  });

  it('returns a month display label derived from the primary event date', async () => {
    await createDrive(baseInput(), 'Admin');
    const res = await listDrives({}, NOW);
    expect(res.items[0].month).toBe('Jul 2026');
  });

  it('gets, updates status, and 404s on missing', async () => {
    const d = await createDrive(baseInput(), 'Admin');
    const got = await getDrive(String(d._id));
    expect(got.name).toBe('Frontend Cohort');
    const upd = await updateDrive(String(d._id), { status: 'Published' });
    expect(upd.status).toBe('Published');
    await expect(getDrive('64b000000000000000000000')).rejects.toThrow();
  });

  it('clones a drive as a new Draft named "(copy)"', async () => {
    const d = await createDrive({ ...baseInput(), status: 'Published' }, 'Admin');
    const c = await cloneDrive(String(d._id));
    expect(c.status).toBe('Draft');
    expect(c.name).toBe('Frontend Cohort (copy)');
    expect(String(c._id)).not.toBe(String(d._id));
    expect(await Drive.countDocuments({})).toBe(2);
  });

  it('bulk-archives selected drives', async () => {
    await seedThree();
    const ids = (await Drive.find({}).select('_id')).map((d) => String(d._id));
    const res = await bulkAction(ids, 'archive');
    expect(res.affected).toBe(3);
    expect(await Drive.countDocuments({ status: 'Archived' })).toBe(3);
  });
});

describe('drives.service — templateId link', () => {
  const baseInput = () => ({
    name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', status: 'Active' as const, candType: 'Freshers' as const,
    mode: 'Hybrid' as const, frequency: 'One-time' as const, eventDay: 'Wednesday' as const,
    eventDates: [new Date('2026-07-15T00:00:00.000Z')], candCap: 100, empCap: 5, slotCap: 20,
    eligibility: { sources: ['Institutes'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    evaluation: [{ key: 'mcq' as const, enabled: true, config: {} }],
    visibility: { employerReg: 'Invite-only' as const, instituteVis: 'Selected institutes' as const, candidateAccess: 'Eligible only' as const },
  });
  async function tpl() {
    return DriveTemplate.create({ name: 'Data Analyst', domain: 'Data / Analytics', status: 'Active', sections: { assessment: { mcq: true, coding: true, tara: true, assignments: false }, weightage: {}, matching: {}, kanban: ['Applied'], notifications: [], privacy: {} }, version: '1.0', versions: [] });
  }

  it('persists a templateId on create and returns it', async () => {
    const t = await tpl();
    const d = await createDrive({ ...baseInput(), templateId: String(t._id) } as never, 'Admin');
    expect(String(d.templateId)).toBe(String(t._id));
  });
  it('normalizes empty/invalid templateId to null', async () => {
    const d1 = await createDrive({ ...baseInput(), templateId: '' } as never, 'Admin');
    expect(d1.templateId).toBeNull();
    const d2 = await createDrive({ ...baseInput(), templateId: 'not-an-id' } as never, 'Admin');
    expect(d2.templateId).toBeNull();
  });
  it('update sets and clears templateId', async () => {
    const t = await tpl();
    const d = await createDrive(baseInput() as never, 'Admin');
    const set = await updateDrive(String(d._id), { templateId: String(t._id) } as never);
    expect(String(set.templateId)).toBe(String(t._id));
    const cleared = await updateDrive(String(d._id), { templateId: '' } as never);
    expect(cleared.templateId).toBeNull();
  });
  it('preserves an existing templateId when the update patch omits the key', async () => {
    const t = await tpl();
    const d = await createDrive({ ...baseInput(), templateId: String(t._id) } as never, 'Admin');
    expect(String(d.templateId)).toBe(String(t._id));
    const renamed = await updateDrive(String(d._id), { name: 'Renamed X' } as never);
    expect(renamed.name).toBe('Renamed X');
    expect(String(renamed.templateId)).toBe(String(t._id));
    const reloaded = await getDrive(String(d._id));
    expect(String(reloaded.templateId)).toBe(String(t._id));
  });
});

describe('drives.service — streamId link', () => {
  async function stream() {
    return Stream.create({ name: 'Frontend', parent: 'Engineering', flow: ['MCQ', 'Coding'] });
  }
  it('createDrive persists a valid streamId', async () => {
    const s = await stream();
    const d = await createDrive({ ...baseInput(), streamId: String(s._id) } as never, 'Admin');
    expect(String(d.streamId)).toBe(String(s._id));
  });
  it('normalizes empty/invalid streamId to null on create', async () => {
    const d1 = await createDrive({ ...baseInput(), streamId: '' } as never, 'Admin');
    expect(d1.streamId).toBeNull();
    const d2 = await createDrive({ ...baseInput(), streamId: 'not-an-id' } as never, 'Admin');
    expect(d2.streamId).toBeNull();
  });
  it('updateDrive sets and clears streamId', async () => {
    const s = await stream();
    const d = await createDrive({ ...baseInput() } as never, 'Admin');
    const set = await updateDrive(String(d._id), { streamId: String(s._id) } as never);
    expect(String(set.streamId)).toBe(String(s._id));
    const cleared = await updateDrive(String(d._id), { streamId: '' } as never);
    expect(cleared.streamId).toBeNull();
  });
  it('a patch omitting streamId preserves an existing link', async () => {
    const s = await stream();
    const d = await createDrive({ ...baseInput(), streamId: String(s._id) } as never, 'Admin');
    const patched = await updateDrive(String(d._id), { name: 'Renamed' } as never);
    expect(String(patched.streamId)).toBe(String(s._id));
  });
});

describe('drives.service — stage evalConfigId link', () => {
  async function cfg(type = 'MCQ') { return EvalConfig.create({ name: 'C', type }); }
  function evalWith(evalConfigId?: string) {
    return [
      { key: 'mcq', enabled: true, config: {}, ...(evalConfigId !== undefined ? { evalConfigId } : {}) },
      { key: 'coding', enabled: false, config: {} },
      { key: 'tara', enabled: false, config: {} },
      { key: 'assignments', enabled: false, config: {} },
    ];
  }
  it('createDrive persists a stage evalConfigId', async () => {
    const c = await cfg();
    const d = await createDrive({ ...baseInput(), evaluation: evalWith(String(c._id)) } as never, 'Admin');
    const mcq = d.evaluation.find((s) => s.key === 'mcq');
    expect(String(mcq!.evalConfigId)).toBe(String(c._id));
  });
  it('normalizes empty/invalid stage evalConfigId to null', async () => {
    const d1 = await createDrive({ ...baseInput(), evaluation: evalWith('') } as never, 'Admin');
    expect(d1.evaluation.find((s) => s.key === 'mcq')!.evalConfigId).toBeNull();
    const d2 = await createDrive({ ...baseInput(), evaluation: evalWith('not-an-id') } as never, 'Admin');
    expect(d2.evaluation.find((s) => s.key === 'mcq')!.evalConfigId).toBeNull();
  });
  it('updateDrive sets and clears a stage evalConfigId via the evaluation array', async () => {
    const c = await cfg();
    const d = await createDrive({ ...baseInput(), evaluation: evalWith() } as never, 'Admin');
    const set = await updateDrive(String(d._id), { evaluation: evalWith(String(c._id)) } as never);
    expect(String(set.evaluation.find((s) => s.key === 'mcq')!.evalConfigId)).toBe(String(c._id));
    const cleared = await updateDrive(String(d._id), { evaluation: evalWith('') } as never);
    expect(cleared.evaluation.find((s) => s.key === 'mcq')!.evalConfigId).toBeNull();
  });
  it('a patch omitting evaluation preserves existing stage links', async () => {
    const c = await cfg();
    const d = await createDrive({ ...baseInput(), evaluation: evalWith(String(c._id)) } as never, 'Admin');
    const patched = await updateDrive(String(d._id), { name: 'Renamed' } as never);
    expect(String(patched.evaluation.find((s) => s.key === 'mcq')!.evalConfigId)).toBe(String(c._id));
  });
});
