import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Application } from '../src/models/Application.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('Application model', () => {
  it('rejects a duplicate (employerId, driveId, jobseekerId)', async () => {
    await Application.init(); // ensure the unique index is built
    const employerId = new Types.ObjectId(); const driveId = new Types.ObjectId(); const jobseekerId = new Types.ObjectId();
    await Application.create({ employerId, driveId, jobseekerId, decision: 'Shortlisted' });
    await expect(Application.create({ employerId, driveId, jobseekerId, decision: 'Hold' })).rejects.toThrow();
  });

  it('defaults decision to null and notes to []', async () => {
    await Application.init();
    const a = await Application.create({ employerId: new Types.ObjectId(), driveId: new Types.ObjectId(), jobseekerId: new Types.ObjectId() });
    expect(a.decision ?? null).toBeNull();
    expect(a.notes).toEqual([]);
  });
});
