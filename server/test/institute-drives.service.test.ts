import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Drive } from '../src/models/Drive.js';
import { DriveAssignment } from '../src/models/DriveAssignment.js';
import { listInstituteDrives, assignDrives, unassignDrive, bulkAssignDrives, getInstitute } from '../src/modules/institutes/institutes.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function inst(name = 'VNR') { return Institute.create({ name, city: 'Hyderabad', type: 'Engineering', status: 'Active', owner: 'A', email: 'a@b.io', ownershipHistory: [] }); }
async function drive(name: string) { return Drive.create({ name, domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] }); }

describe('institute-drives service', () => {
  it('assigns drives idempotently and lists them newest-first', async () => {
    const i = await inst(); const d1 = await drive('FE'); const d2 = await drive('BE');
    await assignDrives(String(i._id), [String(d1._id), String(d2._id)]);
    await assignDrives(String(i._id), [String(d1._id)]);            // re-assign existing → no-op
    expect(await DriveAssignment.countDocuments({})).toBe(2);
    const { items } = await listInstituteDrives(String(i._id));
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('BE');                                // newest assignment first (d2 last of the pair… order by createdAt desc)
    expect(items.map((x) => x.name).sort()).toEqual(['BE', 'FE']);
    expect(items[0]).toHaveProperty('domain');
    expect(items[0]).toHaveProperty('status');
  });

  it('the unique index rejects a raw duplicate pair', async () => {
    const i = await inst(); const d = await drive('FE');
    await DriveAssignment.init();                                    // ensure the unique index is built
    await DriveAssignment.create({ instituteId: i._id, driveId: d._id });
    await expect(DriveAssignment.create({ instituteId: i._id, driveId: d._id })).rejects.toThrow();
  });

  it('unassigns (idempotent) and only resolvable drives are assigned', async () => {
    const i = await inst(); const d = await drive('FE');
    await assignDrives(String(i._id), [String(d._id), '64b000000000000000000000']);  // 2nd id resolves to no Drive
    expect(await DriveAssignment.countDocuments({})).toBe(1);        // only the real drive assigned
    expect(await unassignDrive(String(i._id), String(d._id))).toEqual({ deleted: true });
    expect(await unassignDrive(String(i._id), String(d._id))).toEqual({ deleted: true });  // idempotent
    expect(await DriveAssignment.countDocuments({})).toBe(0);
  });

  it('bulk-assigns the cartesian product idempotently and reports newly-created count', async () => {
    const i1 = await inst('A'); const i2 = await inst('B'); const d1 = await drive('FE'); const d2 = await drive('BE');
    const r1 = await bulkAssignDrives([String(i1._id), String(i2._id)], [String(d1._id), String(d2._id)]);
    expect(r1.assigned).toBe(4);
    const r2 = await bulkAssignDrives([String(i1._id)], [String(d1._id)]);   // already exists
    expect(r2.assigned).toBe(0);
    expect(await DriveAssignment.countDocuments({})).toBe(4);
  });

  it('getInstitute returns a live assignedDrives count; 404 on unknown', async () => {
    const i = await inst(); const d = await drive('FE');
    await assignDrives(String(i._id), [String(d._id)]);
    const res = await getInstitute(String(i._id));
    expect(res.assignedDrives).toBe(1);
    await expect(getInstitute('nope')).rejects.toThrow();
  });
});
