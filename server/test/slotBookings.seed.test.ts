import { describe, expect, it } from 'vitest';
import { planSlotBookings } from '../src/seed/slotBookings.seed.js';

// deterministic rng (mulberry32-style) matching the seed's rng style
function rng(seed = 42) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

describe('planSlotBookings', () => {
  it('produces exactly booked+held distinct bookings per slot with correct statuses', () => {
    const specs = [
      { slotId: 's1', booked: 2, held: 1, pool: ['a', 'b', 'c', 'd'] },
      { slotId: 's2', booked: 1, held: 0, pool: ['a', 'e'] },
    ];
    const out = planSlotBookings(specs, rng());
    const s1 = out.filter((b) => b.slotId === 's1');
    expect(s1.filter((b) => b.status === 'Booked')).toHaveLength(2);
    expect(s1.filter((b) => b.status === 'Held')).toHaveLength(1);
    expect(new Set(s1.map((b) => b.jobseekerId)).size).toBe(3); // distinct within a slot
    expect(out.filter((b) => b.slotId === 's2')).toHaveLength(1);
    // totals
    expect(out.filter((b) => b.status === 'Booked')).toHaveLength(3);
    expect(out.filter((b) => b.status === 'Held')).toHaveLength(1);
  });

  it('throws when a slot pool is smaller than booked + held', () => {
    expect(() => planSlotBookings([{ slotId: 's1', booked: 3, held: 1, pool: ['a', 'b'] }], rng()))
      .toThrow(/pool too small/i);
  });

  it('is deterministic for a given rng seed', () => {
    const specs = [{ slotId: 's1', booked: 2, held: 1, pool: ['a', 'b', 'c', 'd', 'e'] }];
    expect(planSlotBookings(specs, rng(7))).toEqual(planSlotBookings(specs, rng(7)));
  });
});
