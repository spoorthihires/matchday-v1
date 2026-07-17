import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { SlotBooking } from '../src/models/SlotBooking.js';
import { Types } from 'mongoose';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('SlotBooking model', () => {
  it('unique (slotId, jobseekerId) rejects a duplicate pair', async () => {
    await SlotBooking.init(); // ensure the unique index is built
    const slotId = new Types.ObjectId();
    const jobseekerId = new Types.ObjectId();
    await SlotBooking.create({ slotId, jobseekerId, status: 'Booked' });
    await expect(SlotBooking.create({ slotId, jobseekerId, status: 'Held' })).rejects.toThrow();
  });

  it('allows the same candidate in different slots', async () => {
    await SlotBooking.init();
    const jobseekerId = new Types.ObjectId();
    await SlotBooking.create({ slotId: new Types.ObjectId(), jobseekerId, status: 'Booked' });
    await expect(SlotBooking.create({ slotId: new Types.ObjectId(), jobseekerId, status: 'Booked' })).resolves.toBeTruthy();
  });
});
