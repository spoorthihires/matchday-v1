import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Drive } from '../src/models/Drive.js';
import { Employer } from '../src/models/Employer.js';
import { Slot } from '../src/models/Slot.js';
import { SlotBooking } from '../src/models/SlotBooking.js';
import { listSlots, createSlot, getSlot, updateSlot, deleteSlot } from '../src/modules/slots/slots.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

let driveId: string; let empId: string;
async function seedRefs() {
  const d = await Drive.create({ name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });
  const e = await Employer.create({ name: 'Nexatech', industry: 'Product · SaaS', status: 'Active' });
  driveId = String(d._id); empId = String(e._id);
}
const input = (over = {}) => ({ date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity: 10, status: 'Scheduled' as const, employerId: empId, driveId, link: '', attended: 0, noShow: 0, ...over });

describe('slots.service', () => {
  it('creates and lists within a date range with joined names, sorted by date+start', async () => {
    await seedRefs();
    await createSlot(input());
    await createSlot(input({ date: new Date('2026-07-18T00:00:00.000Z'), start: '14:00', end: '16:00' }));
    await createSlot(input({ date: new Date('2026-08-01T00:00:00.000Z') }));   // outside range
    const res = await listSlots({ from: new Date('2026-07-01T00:00:00.000Z'), to: new Date('2026-07-31T00:00:00.000Z') });
    expect(res.items).toHaveLength(2);
    expect(res.items[0].start).toBe('10:00');
    expect(res.items[0].employerName).toBe('Nexatech');
    expect(res.items[0].driveName).toBe('FE Cohort');
  });

  it('includes boundary days and filters by employer; unallocated shows (Unallocated)', async () => {
    await seedRefs();
    await createSlot(input({ date: new Date('2026-07-01T00:00:00.000Z') }));
    await createSlot(input({ date: new Date('2026-07-31T00:00:00.000Z'), employerId: '' }));   // unallocated
    const all = await listSlots({ from: new Date('2026-07-01T00:00:00.000Z'), to: new Date('2026-07-31T00:00:00.000Z') });
    expect(all.items).toHaveLength(2);
    expect(all.items[1].employerName).toBe('(Unallocated)');
    const filtered = await listSlots({ from: new Date('2026-07-01T00:00:00.000Z'), to: new Date('2026-07-31T00:00:00.000Z'), employerId: empId });
    expect(filtered.items).toHaveLength(1);
  });

  it('rejects create when attended>0 on a fresh (bookingless) slot, and when the drive is missing (404)', async () => {
    await seedRefs();
    await expect(createSlot(input({ attended: 3 }))).rejects.toThrow(/booked/i);
    await expect(createSlot(input({ driveId: '64b000000000000000000000' }))).rejects.toThrow(/drive/i);
  });

  it('updates with merged-doc validation: reschedule + no-shows OK, attended-vs-derived-booked enforced', async () => {
    await seedRefs();
    const s = await createSlot(input());
    for (let i = 0; i < 7; i++) {
      await SlotBooking.create({ slotId: s._id, jobseekerId: new Types.ObjectId(), status: 'Booked' });
    }
    const moved = await updateSlot(String(s._id), { date: new Date('2026-07-22T00:00:00.000Z'), start: '16:30', end: '18:00' });
    expect(moved.start).toBe('16:30');
    const done = await updateSlot(String(s._id), { attended: 5, noShow: 2, status: 'Completed' });
    expect(done.status).toBe('Completed');
    expect(done.noShow).toBe(2);
    await expect(updateSlot(String(s._id), { attended: 9 })).rejects.toThrow(/booked/i);        // 9 > derived booked 7
  });

  it('deletes and 404s on unknown/malformed ids', async () => {
    await seedRefs();
    const s = await createSlot(input());
    expect(await deleteSlot(String(s._id))).toEqual({ deleted: true });
    expect(await Slot.countDocuments({})).toBe(0);
    await expect(getSlot(String(s._id))).rejects.toThrow();
    await expect(getSlot('nope')).rejects.toThrow();
  });

  it('listSlots derives booked/held from SlotBooking (0 when none)', async () => {
    const d = await Drive.create({ name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });
    const s = await Slot.create({ driveId: d._id, date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity: 10 });
    const js1 = new Types.ObjectId(); const js2 = new Types.ObjectId(); const js3 = new Types.ObjectId();
    await SlotBooking.create({ slotId: s._id, jobseekerId: js1, status: 'Booked' });
    await SlotBooking.create({ slotId: s._id, jobseekerId: js2, status: 'Booked' });
    await SlotBooking.create({ slotId: s._id, jobseekerId: js3, status: 'Held' });
    const { items } = await listSlots({});
    const row = items.find((x) => x.id === String(s._id))!;
    expect(row.booked).toBe(2);
    expect(row.held).toBe(1);
  });

  it('deleteSlot cascades its bookings', async () => {
    const d = await Drive.create({ name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });
    const s = await Slot.create({ driveId: d._id, date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity: 10 });
    await SlotBooking.create({ slotId: s._id, jobseekerId: new Types.ObjectId(), status: 'Booked' });
    await deleteSlot(String(s._id));
    expect(await SlotBooking.countDocuments({ slotId: s._id })).toBe(0);
  });

  it('updateSlot rejects lowering capacity below current bookings', async () => {
    const d = await Drive.create({ name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });
    const s = await Slot.create({ driveId: d._id, date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity: 3 });
    await SlotBooking.create({ slotId: s._id, jobseekerId: new Types.ObjectId(), status: 'Booked' });
    await SlotBooking.create({ slotId: s._id, jobseekerId: new Types.ObjectId(), status: 'Held' });
    await expect(updateSlot(String(s._id), { capacity: 1 })).rejects.toMatchObject({ status: 400, code: 'validation' });
    // and a capacity change that still fits is allowed:
    await expect(updateSlot(String(s._id), { capacity: 5 })).resolves.toBeTruthy();
  });
});
