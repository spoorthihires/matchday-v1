export interface SlotBookingSpec {
  slotId: string;      // stringified Slot _id
  booked: number;      // target Booked count
  held: number;        // target Held count
  pool: string[];      // stringified jobseeker ids eligible + Match-Ready for this slot's drive
}
export interface PlannedBooking {
  slotId: string;
  jobseekerId: string;
  status: 'Booked' | 'Held';
}

// Deterministic Fisher–Yates using the provided rng (no Math.random).
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function planSlotBookings(specs: SlotBookingSpec[], rng: () => number): PlannedBooking[] {
  const out: PlannedBooking[] = [];
  for (const spec of specs) {
    const need = spec.booked + spec.held;
    if (spec.pool.length < need) {
      throw new Error(`slot ${spec.slotId} pool too small: need ${need}, have ${spec.pool.length}`);
    }
    const picked = shuffle(spec.pool, rng).slice(0, need);
    for (let i = 0; i < spec.booked; i++) out.push({ slotId: spec.slotId, jobseekerId: picked[i], status: 'Booked' });
    for (let i = spec.booked; i < need; i++) out.push({ slotId: spec.slotId, jobseekerId: picked[i], status: 'Held' });
  }
  return out;
}
