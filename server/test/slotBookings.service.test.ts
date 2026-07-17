import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Slot } from '../src/models/Slot.js';
import { Drive } from '../src/models/Drive.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Institute } from '../src/models/Institute.js';
import { SlotBooking } from '../src/models/SlotBooking.js';
import {
  createBooking, confirmBooking, releaseBooking, getSlotRoster, listEligibleCandidates,
} from '../src/modules/slotBookings/slotBookings.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function institute(name = 'VNR') {
  return Institute.create({ name, city: 'Hyderabad', type: 'Engineering', status: 'Active', owner: 'A', email: 'a@b.io', ownershipHistory: [] });
}
async function drive(eligibility?: object) {
  return Drive.create({
    name: 'Drive', domain: 'Web', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date('2026-07-15T00:00:00.000Z')],
    ...(eligibility ? { eligibility } : {}),
  });
}
async function slot(driveId: unknown, capacity = 3) {
  return Slot.create({ driveId, date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity });
}
async function seeker(instId: unknown, over: Partial<{ stage: string; branch: string; gradYear: number; source: string; name: string }> = {}) {
  return Jobseeker.create({
    name: over.name ?? 'Asha', instituteId: instId, branch: over.branch ?? 'CSE', gradYear: over.gradYear ?? 2026,
    cgpa: 8, source: over.source ?? 'Campus', stage: over.stage ?? 'MatchReady',
  });
}

describe('slotBookings.service', () => {
  it('books a Match-Ready, drive-eligible candidate', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    const js = await seeker(i._id, { stage: 'Shortlisted' });
    const b = await createBooking(String(s._id), String(js._id), 'Booked');
    expect(b.status).toBe('Booked');
    expect(await SlotBooking.countDocuments({ slotId: s._id, status: 'Booked' })).toBe(1);
  });

  it('rejects a candidate below Match-Ready', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    const js = await seeker(i._id, { stage: 'Applied' });
    await expect(createBooking(String(s._id), String(js._id), 'Booked')).rejects.toMatchObject({ status: 400, code: 'not_match_ready' });
  });

  it("rejects a candidate who doesn't match the drive eligibility", async () => {
    const i = await institute(); const d = await drive({ branches: ['ECE'], gradYears: [], sources: [] }); const s = await slot(d._id);
    const js = await seeker(i._id, { stage: 'MatchReady', branch: 'CSE' });
    await expect(createBooking(String(s._id), String(js._id), 'Booked')).rejects.toMatchObject({ status: 400, code: 'not_eligible' });
  });

  it('rejects a duplicate booking of the same candidate in the same slot', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    const js = await seeker(i._id);
    await createBooking(String(s._id), String(js._id), 'Booked');
    await expect(createBooking(String(s._id), String(js._id), 'Held')).rejects.toMatchObject({ status: 400, code: 'already_booked' });
  });

  it('rejects booking beyond capacity (booked + held)', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id, 1);
    const a = await seeker(i._id, { name: 'A' }); const b = await seeker(i._id, { name: 'B' });
    await createBooking(String(s._id), String(a._id), 'Held'); // 1 held fills capacity 1
    await expect(createBooking(String(s._id), String(b._id), 'Booked')).rejects.toMatchObject({ status: 400, code: 'slot_full' });
  });

  it('confirms a Held booking to Booked; releases a booking', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    const js = await seeker(i._id);
    const held = await createBooking(String(s._id), String(js._id), 'Held');
    const confirmed = await confirmBooking(String(s._id), held.id);
    expect(confirmed.status).toBe('Booked');
    expect(await releaseBooking(String(s._id), held.id)).toEqual({ deleted: true });
    expect(await SlotBooking.countDocuments({ slotId: s._id })).toBe(0);
  });

  it('roster groups booked and held with candidate detail', async () => {
    const i = await institute('IIT'); const d = await drive(); const s = await slot(d._id);
    const a = await seeker(i._id, { name: 'Booked One' }); const h = await seeker(i._id, { name: 'Held One' });
    await createBooking(String(s._id), String(a._id), 'Booked');
    await createBooking(String(s._id), String(h._id), 'Held');
    const roster = await getSlotRoster(String(s._id));
    expect(roster.booked.map((r) => r.name)).toEqual(['Booked One']);
    expect(roster.held.map((r) => r.name)).toEqual(['Held One']);
    expect(roster.booked[0]).toMatchObject({ institute: 'IIT', branch: 'CSE', status: 'Booked' });
  });

  it('eligible-candidates excludes below-Match-Ready, ineligible, and already-booked; honors q', async () => {
    const i = await institute(); const d = await drive({ branches: ['CSE'], gradYears: [], sources: [] }); const s = await slot(d._id);
    const ready = await seeker(i._id, { name: 'Ready CSE', branch: 'CSE', stage: 'MatchReady' });
    await seeker(i._id, { name: 'Applied CSE', branch: 'CSE', stage: 'Applied' });   // below match-ready
    await seeker(i._id, { name: 'Ready ECE', branch: 'ECE', stage: 'MatchReady' });  // ineligible branch
    const booked = await seeker(i._id, { name: 'Already', branch: 'CSE', stage: 'MatchReady' });
    await createBooking(String(s._id), String(booked._id), 'Booked');
    const { items } = await listEligibleCandidates(String(s._id));
    expect(items.map((c) => c.name).sort()).toEqual(['Ready CSE']);
    const filtered = await listEligibleCandidates(String(s._id), 'ready cse');
    expect(filtered.items).toHaveLength(1);
    const none = await listEligibleCandidates(String(s._id), 'zzz');
    expect(none.items).toHaveLength(0);
  });
});
