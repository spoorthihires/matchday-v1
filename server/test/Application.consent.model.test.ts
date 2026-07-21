import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Application } from '../src/models/Application.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('Application.consent sub-doc', () => {
  const ids = () => ({ employerId: new Types.ObjectId(), driveId: new Types.ObjectId(), jobseekerId: new Types.ObjectId() });

  it('defaults to absent (never requested)', async () => {
    const a = await Application.create({ ...ids(), decision: 'Shortlisted' });
    expect(a.consent).toBeUndefined();
  });

  it('persists a requested consent and reads it back', async () => {
    const now = new Date();
    const a = await Application.create({
      ...ids(), decision: 'Shortlisted',
      consent: { status: 'requested', requestedAt: now, expiresAt: new Date(now.getTime() + 3600_000) },
    });
    const read = await Application.findById(a._id).lean();
    expect(read?.consent?.status).toBe('requested');
    expect(read?.consent?.respondedAt ?? null).toBeNull();
  });

  it('rejects an invalid consent status', async () => {
    await expect(Application.create({
      ...ids(), consent: { status: 'maybe', requestedAt: new Date(), expiresAt: new Date() },
    })).rejects.toThrow();
  });
});
