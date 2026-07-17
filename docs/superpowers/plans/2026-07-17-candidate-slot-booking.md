# Candidate ↔ Slot booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the faked `Slot.booked`/`held` counts into real derived data backed by a `SlotBooking` collection (jobseeker↔slot), with an admin roster UI to book/hold/confirm/release Match-Ready+ candidates, while preserving the tuned Command Center numbers (cap 360 / booked 288 / held 36 → 80% donut, readiness 84).

**Architecture:** New `SlotBooking` collection with a unique `(slotId, jobseekerId)` index. A booking-service enforces eligibility (Match-Ready+ **and** `isEligible` for the slot's drive), capacity (`booked + held < capacity`), and uniqueness. `booked`/`held` become derived-on-read in `listSlots` and `dashboard.service` (one aggregation each); the stored fields are deleted from the model, schemas, and seed. The seed creates real bookings reproducing the per-slot targets. Client gets a `SlotRosterModal`; `SlotModal`'s `booked` input becomes read-only.

**Tech Stack:** Express 4 + Mongoose 8 + zod (server, TS strict, ESM with `.js` import suffixes); React 18 + Vite + react-router-dom 6 + @tanstack/react-query 5 (client); vitest + mongodb-memory-server (tests).

## Global Constraints

- TS strict; ESM with explicit `.js` import suffixes; `npx -w server tsc --noEmit` AND `npx -w client tsc --noEmit` must stay clean.
- Error contract `{ error: { message, code } }`; zod parse failures → 400 (`validation`) via the central `errorHandler`; not-found → 404; auth → 401/403. Throw `HttpError(status, message, code)` from `../../middleware/errorHandler.js`.
- All booking routes are admin-only: they inherit `requireAuth` + `requireRole('admin')` from `slotRoutes` (a seeker/absent token → 403/401).
- **Derived, never stored:** after this slice, `Slot` carries NO `booked`/`held` fields; they are computed on every read. Consistent with Institute `assignedDrives`, Employer `activeDrives`, Template `usedBy`.
- **Tuned numbers are load-bearing and must stay exact:** the seed reproduces cap 360 / booked 288 / held 36; CC donut 80%, readiness score 84. Do not change the CC computation logic — only its data source.
- Match-Ready+ = `stage ∈ { 'MatchReady', 'Shortlisted', 'Offer', 'Joined' }`.
- Eligibility uses `isEligible(eligibility, { branch, gradYear, source })` exported from `../seekerPortal/seekerPortal.service.js` (empty `branches`/`gradYears`/`sources` array = no constraint).
- Deterministic seed only: no `Math.random()` / `Date.now()` / argless `new Date()` in seed logic — use the existing seeded `rng` and `spread()`/fixed dates.
- Booking states: `status ∈ { 'Booked', 'Held' }`. Both consume a capacity seat. Confirm = Held→Booked. Release = delete.
- Tests use `./helpers/db.js` (`setupTestDb`/`teardownTestDb`/`clearDb`) with `beforeAll`/`afterAll`/`beforeEach`; build fixtures via `Model.create(...)`.
- Commit messages end with exactly:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work exclusively in the worktree `/Users/srinivasarao.kandula/code/matchday-candslot`. Never run `npm run seed` against the shared DB — the seed RUN happens only in Task 7 against an isolated DB.

---

### Task 1: Server — `SlotBooking` model + booking service (rules)

**Files:**
- Create: `server/src/models/SlotBooking.ts`
- Create: `server/src/modules/slotBookings/slotBookings.service.ts`
- Test: `server/test/slotBooking.model.test.ts`
- Test: `server/test/slotBookings.service.test.ts`

**Interfaces:**
- Consumes: `Slot` (`capacity`, `driveId`), `Drive` (`eligibility`), `Jobseeker` (`stage`, `branch`, `gradYear`, `source`, `instituteId`, `name`), `Institute` (`name`); `isEligible` from `../seekerPortal/seekerPortal.service.js`; `HttpError`.
- Produces (later tasks rely on these exact signatures):
  - `SlotBooking` model (collection `slotbookings`), fields `{ slotId, jobseekerId, status, createdAt }`, unique index `{ slotId: 1, jobseekerId: 1 }`.
  - `MATCH_READY_STAGES: Set<string>`
  - `interface RosterEntry { bookingId: string; jobseekerId: string; name: string; institute: string; branch: string; stage: string; status: 'Booked' | 'Held' }`
  - `interface CandidateOption { id: string; name: string; institute: string; branch: string; stage: string }`
  - `getSlotRoster(slotId: string): Promise<{ booked: RosterEntry[]; held: RosterEntry[] }>`
  - `listEligibleCandidates(slotId: string, q?: string): Promise<{ items: CandidateOption[] }>`
  - `createBooking(slotId: string, jobseekerId: string, status: 'Booked' | 'Held'): Promise<{ id: string; slotId: string; jobseekerId: string; status: string }>`
  - `confirmBooking(slotId: string, bookingId: string): Promise<{ id: string; status: 'Booked' }>`
  - `releaseBooking(slotId: string, bookingId: string): Promise<{ deleted: true }>`

- [ ] **Step 1: Write the model**

Create `server/src/models/SlotBooking.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const slotBookingSchema = new Schema({
  slotId: { type: Schema.Types.ObjectId, ref: 'Slot', required: true },
  jobseekerId: { type: Schema.Types.ObjectId, ref: 'Jobseeker', required: true },
  status: { type: String, enum: ['Booked', 'Held'], required: true },
  createdAt: { type: Date, default: Date.now },
});
slotBookingSchema.index({ slotId: 1, jobseekerId: 1 }, { unique: true });

export type SlotBookingDoc = InferSchemaType<typeof slotBookingSchema>;
export const SlotBooking = model('SlotBooking', slotBookingSchema);
```

- [ ] **Step 2: Write the failing model test**

Create `server/test/slotBooking.model.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the model test — expect PASS**

Run: `npm test -w server -- slotBooking.model`
Expected: PASS (the model + index are already written). If the duplicate test flakes because the index wasn't built, the `await SlotBooking.init()` line fixes it.

- [ ] **Step 4: Write the failing service test**

Create `server/test/slotBookings.service.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the service test — expect FAIL**

Run: `npm test -w server -- slotBookings.service`
Expected: FAIL — cannot import from `slotBookings.service.js` (module not found).

- [ ] **Step 6: Write the service**

Create `server/src/modules/slotBookings/slotBookings.service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Slot } from '../../models/Slot.js';
import { Drive } from '../../models/Drive.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Institute } from '../../models/Institute.js';
import { SlotBooking } from '../../models/SlotBooking.js';
import { isEligible } from '../seekerPortal/seekerPortal.service.js';

export const MATCH_READY_STAGES = new Set(['MatchReady', 'Shortlisted', 'Offer', 'Joined']);

export interface RosterEntry {
  bookingId: string; jobseekerId: string; name: string;
  institute: string; branch: string; stage: string; status: 'Booked' | 'Held';
}
export interface CandidateOption {
  id: string; name: string; institute: string; branch: string; stage: string;
}

function assertId(id: string, what: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, `${what} not found`, 'not_found');
}
async function resolveSlot(slotId: string) {
  assertId(slotId, 'Slot');
  const s = await Slot.findById(slotId);
  if (!s) throw new HttpError(404, 'Slot not found', 'not_found');
  return s;
}

export async function createBooking(slotId: string, jobseekerId: string, status: 'Booked' | 'Held') {
  const s = await resolveSlot(slotId);
  assertId(jobseekerId, 'Candidate');
  const js = await Jobseeker.findById(jobseekerId);
  if (!js) throw new HttpError(404, 'Candidate not found', 'not_found');
  if (!MATCH_READY_STAGES.has(js.stage)) {
    throw new HttpError(400, 'Candidate is not Match-Ready', 'not_match_ready');
  }
  const drive = await Drive.findById(s.driveId).lean();
  if (!isEligible(drive?.eligibility as never, { branch: js.branch, gradYear: js.gradYear, source: js.source })) {
    throw new HttpError(400, 'Candidate is not eligible for this drive', 'not_eligible');
  }
  if (await SlotBooking.findOne({ slotId: s._id, jobseekerId: js._id })) {
    throw new HttpError(400, 'Candidate already booked in this slot', 'already_booked');
  }
  const seats = await SlotBooking.countDocuments({ slotId: s._id }); // booked + held both consume a seat
  if (seats >= (s.capacity ?? 0)) throw new HttpError(400, 'Slot is at capacity', 'slot_full');
  const created = await SlotBooking.create({ slotId: s._id, jobseekerId: js._id, status });
  return { id: String(created._id), slotId: String(s._id), jobseekerId: String(js._id), status: created.status };
}

export async function confirmBooking(slotId: string, bookingId: string) {
  await resolveSlot(slotId);
  assertId(bookingId, 'Booking');
  const b = await SlotBooking.findOne({ _id: bookingId, slotId });
  if (!b) throw new HttpError(404, 'Booking not found', 'not_found');
  if (b.status !== 'Booked') { b.status = 'Booked'; await b.save(); }
  return { id: String(b._id), status: 'Booked' as const };
}

export async function releaseBooking(slotId: string, bookingId: string) {
  await resolveSlot(slotId);
  assertId(bookingId, 'Booking');
  const b = await SlotBooking.findOne({ _id: bookingId, slotId });
  if (!b) throw new HttpError(404, 'Booking not found', 'not_found');
  await b.deleteOne();
  return { deleted: true as const };
}

export async function getSlotRoster(slotId: string): Promise<{ booked: RosterEntry[]; held: RosterEntry[] }> {
  await resolveSlot(slotId);
  const rows = await SlotBooking.aggregate([
    { $match: { slotId: new Types.ObjectId(slotId) } },
    { $lookup: { from: 'jobseekers', localField: 'jobseekerId', foreignField: '_id', as: 'js' } },
    { $unwind: '$js' },
    { $lookup: { from: 'institutes', localField: 'js.instituteId', foreignField: '_id', as: 'inst' } },
    { $unwind: { path: '$inst', preserveNullAndEmptyArrays: true } },
    { $sort: { 'js.name': 1 } },
  ]);
  const entry = (r: Record<string, any>): RosterEntry => ({
    bookingId: String(r._id), jobseekerId: String(r.jobseekerId), name: r.js.name,
    institute: r.inst?.name ?? '—', branch: r.js.branch, stage: r.js.stage, status: r.status,
  });
  return {
    booked: rows.filter((r) => r.status === 'Booked').map(entry),
    held: rows.filter((r) => r.status === 'Held').map(entry),
  };
}

export async function listEligibleCandidates(slotId: string, q?: string): Promise<{ items: CandidateOption[] }> {
  const s = await resolveSlot(slotId);
  const drive = await Drive.findById(s.driveId).lean();
  const taken = new Set(
    (await SlotBooking.find({ slotId: s._id }).select('jobseekerId').lean()).map((b) => String(b.jobseekerId)),
  );
  const term = (q ?? '').trim().toLowerCase();
  const candidates = await Jobseeker.find({ stage: { $in: [...MATCH_READY_STAGES] } })
    .populate<{ instituteId: { name?: string } }>('instituteId', 'name')
    .lean();
  const items: CandidateOption[] = [];
  for (const c of candidates) {
    if (taken.has(String(c._id))) continue;
    if (!isEligible(drive?.eligibility as never, { branch: c.branch, gradYear: c.gradYear, source: c.source })) continue;
    if (term && !c.name.toLowerCase().includes(term)) continue;
    items.push({
      id: String(c._id), name: c.name,
      institute: (c.instituteId as { name?: string } | null)?.name ?? '—',
      branch: c.branch, stage: c.stage,
    });
    if (items.length >= 50) break;
  }
  return { items };
}
```

- [ ] **Step 7: Run both server tests — expect PASS**

Run: `npm test -w server -- slotBooking.model slotBookings.service`
Expected: PASS (all model + service tests green).

- [ ] **Step 8: Type-check**

Run: `npx -w server tsc --noEmit`
Expected: clean (`ok`).

- [ ] **Step 9: Commit**

```bash
git add server/src/models/SlotBooking.ts server/src/modules/slotBookings/slotBookings.service.ts server/test/slotBooking.model.test.ts server/test/slotBookings.service.test.ts
git commit -m "feat(server): SlotBooking model + booking service (eligibility/capacity/roster)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server — booking routes + controllers (nested under slots)

**Files:**
- Create: `server/src/modules/slotBookings/slotBookings.schemas.ts`
- Create: `server/src/modules/slotBookings/slotBookings.controller.ts`
- Modify: `server/src/modules/slots/slots.routes.ts`
- Test: `server/test/slotBookings.route.test.ts`

**Interfaces:**
- Consumes: the Task 1 service functions; the app's Express test harness.
- Produces: routes on the existing `slotRoutes` router (already mounted at `/api/slots`, already `requireAuth` + `requireRole('admin')`):
  - `GET    /api/slots/:id/bookings`
  - `GET    /api/slots/:id/eligible-candidates`
  - `POST   /api/slots/:id/bookings`
  - `PATCH  /api/slots/:id/bookings/:bookingId`
  - `DELETE /api/slots/:id/bookings/:bookingId`

- [ ] **Step 1: Write the schemas**

Create `server/src/modules/slotBookings/slotBookings.schemas.ts`:

```ts
import { z } from 'zod';

export const createBookingSchema = z.object({
  jobseekerId: z.string().min(1),
  status: z.enum(['Booked', 'Held']),
});
export const confirmBookingSchema = z.object({
  status: z.literal('Booked'),
});
export const eligibleQuerySchema = z.object({
  q: z.string().optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
```

- [ ] **Step 2: Write the controllers**

Create `server/src/modules/slotBookings/slotBookings.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { createBookingSchema, confirmBookingSchema, eligibleQuerySchema } from './slotBookings.schemas.js';
import {
  createBooking, confirmBooking, releaseBooking, getSlotRoster, listEligibleCandidates,
} from './slotBookings.service.js';

export async function rosterController(req: Request, res: Response) {
  res.json(await getSlotRoster(req.params.id));
}
export async function eligibleController(req: Request, res: Response) {
  const { q } = eligibleQuerySchema.parse(req.query);
  res.json(await listEligibleCandidates(req.params.id, q));
}
export async function createBookingController(req: Request, res: Response) {
  const { jobseekerId, status } = createBookingSchema.parse(req.body);
  res.status(201).json(await createBooking(req.params.id, jobseekerId, status));
}
export async function confirmBookingController(req: Request, res: Response) {
  confirmBookingSchema.parse(req.body);
  res.json(await confirmBooking(req.params.id, req.params.bookingId));
}
export async function releaseBookingController(req: Request, res: Response) {
  res.json(await releaseBooking(req.params.id, req.params.bookingId));
}
```

- [ ] **Step 3: Wire the routes**

Modify `server/src/modules/slots/slots.routes.ts` — import the booking controllers and register the nested routes BEFORE the `/:id` GET/PATCH/DELETE lines (mirrors `institutes.routes.ts`, which registers `/:id/drives` before `/:id`). Final file:

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  listController, createController, getController, patchController, deleteController,
} from './slots.controller.js';
import {
  rosterController, eligibleController, createBookingController, confirmBookingController, releaseBookingController,
} from '../slotBookings/slotBookings.controller.js';

export const slotRoutes = Router();
slotRoutes.use(requireAuth);
slotRoutes.use(requireRole('admin'));
slotRoutes.get('/', asyncHandler(listController));
slotRoutes.post('/', asyncHandler(createController));
slotRoutes.get('/:id/bookings', asyncHandler(rosterController));
slotRoutes.get('/:id/eligible-candidates', asyncHandler(eligibleController));
slotRoutes.post('/:id/bookings', asyncHandler(createBookingController));
slotRoutes.patch('/:id/bookings/:bookingId', asyncHandler(confirmBookingController));
slotRoutes.delete('/:id/bookings/:bookingId', asyncHandler(releaseBookingController));
slotRoutes.get('/:id', asyncHandler(getController));
slotRoutes.patch('/:id', asyncHandler(patchController));
slotRoutes.delete('/:id', asyncHandler(deleteController));
```

- [ ] **Step 4: Write the failing route test**

First inspect an existing route test to copy the app/token bootstrap verbatim (do NOT invent it):

Run: `sed -n '1,40p' server/test/eval-monitor.route.test.ts`

Create `server/test/slotBookings.route.test.ts` using that SAME app-build + admin-token helper pattern. The test body must cover:

```ts
// (imports + admin-token setup copied from eval-monitor.route.test.ts, plus:)
import { Slot } from '../src/models/Slot.js';
import { Drive } from '../src/models/Drive.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Institute } from '../src/models/Institute.js';

// helper fixtures like Task 1's institute()/drive()/slot()/seeker()

describe('slot bookings routes', () => {
  it('401s without a token', async () => {
    const res = await request(app).get(`/api/slots/${new Types.ObjectId()}/bookings`);
    expect(res.status).toBe(401);
  });

  it('books, lists the roster, confirms, and releases', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    const js = await seeker(i._id);
    const create = await request(app).post(`/api/slots/${s._id}/bookings`)
      .set('Authorization', `Bearer ${token}`).send({ jobseekerId: String(js._id), status: 'Held' });
    expect(create.status).toBe(201);
    const bookingId = create.body.id;

    const roster = await request(app).get(`/api/slots/${s._id}/bookings`).set('Authorization', `Bearer ${token}`);
    expect(roster.status).toBe(200);
    expect(roster.body.held).toHaveLength(1);

    const confirm = await request(app).patch(`/api/slots/${s._id}/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`).send({ status: 'Booked' });
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('Booked');

    const del = await request(app).delete(`/api/slots/${s._id}/bookings/${bookingId}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ deleted: true });
  });

  it('400s when booking an ineligible candidate', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    const js = await seeker(i._id, { stage: 'Applied' });
    const res = await request(app).post(`/api/slots/${s._id}/bookings`)
      .set('Authorization', `Bearer ${token}`).send({ jobseekerId: String(js._id), status: 'Booked' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('not_match_ready');
  });

  it('lists eligible candidates', async () => {
    const i = await institute(); const d = await drive(); const s = await slot(d._id);
    await seeker(i._id, { name: 'Pickable' });
    const res = await request(app).get(`/api/slots/${s._id}/eligible-candidates`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { name: string }) => c.name)).toContain('Pickable');
  });
});
```

- [ ] **Step 5: Run — expect FAIL then PASS**

Run: `npm test -w server -- slotBookings.route`
Expected: FAIL first if routes aren't wired; after Step 3 it should PASS. Fix until green.

- [ ] **Step 6: Type-check + commit**

Run: `npx -w server tsc --noEmit` (expect clean), then:

```bash
git add server/src/modules/slotBookings/slotBookings.schemas.ts server/src/modules/slotBookings/slotBookings.controller.ts server/src/modules/slots/slots.routes.ts server/test/slotBookings.route.test.ts
git commit -m "feat(server): nested slot-booking routes (roster/eligible/book/confirm/release)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Server — cutover: derive `booked`/`held`, remove stored fields

This is the atomic cut: removing the stored fields from `Slot` breaks `slots.service`, `dashboard.service`, and the seed literal simultaneously, so they change together to keep `tsc` green.

**Files:**
- Modify: `server/src/models/Slot.ts` (remove `booked`, `held`)
- Modify: `server/src/modules/slots/slots.schemas.ts` (remove `booked`/`held`; drop `booked+held<=capacity` refine)
- Modify: `server/src/modules/slots/slots.service.ts` (derive in `listSlots`; attended-vs-derived in create/update; delete cascade)
- Modify: `server/src/modules/dashboard/dashboard.service.ts` (derive `booked`/`held` + per-drive join)
- Modify: `server/src/seed/seed.ts` (remove the now-invalid `booked:`/`held:` keys from the slot docs literal — do NOT add bookings yet; that's Task 4)
- Test: `server/test/slots.service.test.ts` (extend)
- Test: `server/test/dashboard.service.test.ts` (create, or extend the existing dashboard test — see Step 5)

**Interfaces:**
- Consumes: `SlotBooking` (Task 1). `SlotItem` keeps `booked`/`held` (derived).
- Produces: `Slot` model without `booked`/`held`; `listSlots` overlays derived `{booked, held}`; `dashboard.service` reads `booked = SlotBooking.countDocuments({status:'Booked'})`, `held = countDocuments({status:'Held'})`.

- [ ] **Step 1: Write the failing `listSlots` derivation test**

Extend `server/test/slots.service.test.ts` (keep existing tests). Add fixtures for `Drive`/`Jobseeker`/`Institute`/`SlotBooking` (see Task 1's helpers) and:

```ts
import { SlotBooking } from '../src/models/SlotBooking.js';
// ... existing imports

it('listSlots derives booked/held from SlotBooking (0 when none)', async () => {
  const d = await Drive.create({ name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15')] });
  const s = await Slot.create({ driveId: d._id, date: new Date('2026-07-15'), start: '10:00', end: '12:00', capacity: 10 });
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
  const d = await Drive.create({ name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15')] });
  const s = await Slot.create({ driveId: d._id, date: new Date('2026-07-15'), start: '10:00', end: '12:00', capacity: 10 });
  await SlotBooking.create({ slotId: s._id, jobseekerId: new Types.ObjectId(), status: 'Booked' });
  await deleteSlot(String(s._id));
  expect(await SlotBooking.countDocuments({ slotId: s._id })).toBe(0);
});
```

(If the existing `slots.service.test.ts` asserts a stored `booked`/`held` on create/update, update those assertions minimally — a fresh slot now derives to `booked:0, held:0`; keep all other assertions.)

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -w server -- slots.service`
Expected: FAIL (derivation/cascade not implemented; possibly TS errors once you start editing).

- [ ] **Step 3: Remove the stored fields from the model**

In `server/src/models/Slot.ts`, delete these two lines:

```ts
  booked: { type: Number, default: 0 },
  held: { type: Number, default: 0 },
```

- [ ] **Step 4: Remove `booked`/`held` from the slot schemas**

In `server/src/modules/slots/slots.schemas.ts`:
- Delete `booked: z.coerce.number().int().min(0).default(0),` and `held: z.coerce.number().int().min(0).default(0),` from `slotFields`.
- Change `createSlotSchema` to drop the `booked + held <= capacity` refine, keeping only the `attended <= booked`… — but `booked` is gone, so drop BOTH refines from `createSlotSchema` (attended is validated in the service against the derived count now):

```ts
export const createSlotSchema = slotFields;
export const updateSlotSchema = slotFields.partial();  // cross-field rules re-checked in the service
```

- [ ] **Step 5: Derive in `slots.service.ts`**

In `server/src/modules/slots/slots.service.ts`:
- Add import: `import { SlotBooking } from '../../models/SlotBooking.js';`
- In `listSlots`, after building `rows`, derive and overlay before mapping (or during the map using a prebuilt map):

```ts
  const ids = rows.map((r: Record<string, any>) => r._id);
  const bk = await SlotBooking.aggregate([
    { $match: { slotId: { $in: ids } } },
    { $group: { _id: { slotId: '$slotId', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const counts = new Map<string, { booked: number; held: number }>();
  for (const r of bk) {
    const k = String(r._id.slotId);
    const e = counts.get(k) ?? { booked: 0, held: 0 };
    if (r._id.status === 'Booked') e.booked = r.n; else e.held = r.n;
    counts.set(k, e);
  }
```
Then in the `items` map, replace `booked: r.booked ?? 0, held: r.held ?? 0` with:
```ts
    booked: counts.get(String(r._id))?.booked ?? 0,
    held: counts.get(String(r._id))?.held ?? 0,
```
- In `updateSlot`, replace the two stored-field checks. Delete:
```ts
  if (s.booked + s.held > s.capacity) throw new HttpError(400, 'booked + held must not exceed capacity', 'validation');
  if (s.attended > s.booked) throw new HttpError(400, 'attended must not exceed booked', 'validation');
```
with a derived-booked attended check:
```ts
  const derivedBooked = await SlotBooking.countDocuments({ slotId: s._id, status: 'Booked' });
  if (s.attended > derivedBooked) throw new HttpError(400, 'attended must not exceed booked', 'validation');
```
- In `createSlot`, enforce attended ≤ 0 for a fresh (bookingless) slot. Change:
```ts
export async function createSlot(input: CreateSlotInput) {
  await resolveDrive(input.driveId);
  if ((input.attended ?? 0) > 0) throw new HttpError(400, 'attended must not exceed booked', 'validation');
  return Slot.create({ ...input, employerId: normEmployer(input.employerId), driveId: new Types.ObjectId(input.driveId) });
}
```
- In `deleteSlot`, cascade before removing:
```ts
export async function deleteSlot(id: string) {
  const s = await getSlot(id);
  await SlotBooking.deleteMany({ slotId: s._id });
  await s.deleteOne();
  return { deleted: true };
}
```

- [ ] **Step 6: Derive in `dashboard.service.ts`**

In `server/src/modules/dashboard/dashboard.service.ts`:
- Add import: `import { SlotBooking } from '../../models/SlotBooking.js';`
- Replace the `slotAgg` block (`Slot.aggregate([{ $group: { _id: null, booked: {$sum:'$booked'}, held:{$sum:'$held'}, capacity:{$sum:'$capacity'} }}])`) with:
```ts
  const capAgg = await Slot.aggregate<{ _id: null; capacity: number }>([
    { $group: { _id: null, capacity: { $sum: '$capacity' } } },
  ]);
  const booked = await SlotBooking.countDocuments({ status: 'Booked' });
  const held = await SlotBooking.countDocuments({ status: 'Held' });
  const totalSlots = capAgg[0]?.capacity ?? 0;
  const available = Math.max(0, totalSlots - booked - held);
```
- In the schedule `events` loop, replace the per-drive `driveBooked` derivation. The current block computes `driveAgg` with `$sum: '$booked'`. Replace with capacity-from-slots + booked-from-bookings:
```ts
    const capOnly = await Slot.aggregate<{ _id: null; cap: number }>([
      { $match: { driveId: d._id } },
      { $group: { _id: null, cap: { $sum: '$capacity' } } },
    ]);
    const driveCap = capOnly[0]?.cap ?? 0;
    const driveSlotIds = await Slot.find({ driveId: d._id }).distinct('_id');
    const driveBooked = await SlotBooking.countDocuments({ slotId: { $in: driveSlotIds }, status: 'Booked' });
```
Everything downstream (`available`, `slotsPct`, funnel "Slots Booked" = `booked`, `slotsBooked`/`slotsavailable` KPIs, `slotUtilization`, `prepPct`) already reads these variables — leave that logic untouched.

- [ ] **Step 7: Remove the dead `booked`/`held` keys from the seed slot docs**

In `server/src/seed/seed.ts`, in the `slotDocs = sessions.map(...)` object literal, delete `booked: s.booked,` and `held: s.held,`. Leave the `sessions`/tuning code and the sum-check `throw` intact (Task 4 reuses the per-slot `booked`/`held` targets). Do NOT add bookings here.

- [ ] **Step 8: Write/extend the dashboard derivation test**

Check whether a dashboard service/route test exists that asserts slot numbers:

Run: `ls server/test | grep -i dashboard`

Add a focused test (in the existing dashboard test file if present, else create `server/test/dashboard.service.test.ts` with the `helpers/db.js` harness) asserting the derivation mechanism (not the full 288):

```ts
import { getOverview } from '../src/modules/dashboard/dashboard.service.js';
import { Slot } from '../src/models/Slot.js';
import { Drive } from '../src/models/Drive.js';
import { SlotBooking } from '../src/models/SlotBooking.js';
import { Types } from 'mongoose';

it('slot utilization derives booked/held from SlotBooking', async () => {
  const d = await Drive.create({ name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15')] });
  const s = await Slot.create({ driveId: d._id, date: new Date('2026-07-15'), start: '10:00', end: '12:00', capacity: 10 });
  await SlotBooking.create({ slotId: s._id, jobseekerId: new Types.ObjectId(), status: 'Booked' });
  await SlotBooking.create({ slotId: s._id, jobseekerId: new Types.ObjectId(), status: 'Booked' });
  await SlotBooking.create({ slotId: s._id, jobseekerId: new Types.ObjectId(), status: 'Held' });
  const o = await getOverview(new Date('2026-07-14T00:00:00.000Z'));
  expect(o.slotUtilization).toMatchObject({ booked: 2, held: 1, total: 10 });
});
```

(If an existing dashboard test seeds slots with stored `booked`/`held` and asserts specific numbers, update it to create `SlotBooking` docs instead — keep the rest.)

- [ ] **Step 9: Run all touched suites — expect PASS**

Run: `npm test -w server -- slots.service dashboard` then `npx -w server tsc --noEmit`
Expected: PASS + clean tsc.

- [ ] **Step 10: Full server suite (catch cross-file breakage)**

Run: `npm test -w server`
Expected: all pass. Any pre-existing test that asserted stored `booked`/`held` must be migrated to `SlotBooking` fixtures (minimal edit, keep other assertions).

- [ ] **Step 11: Commit**

```bash
git add server/src/models/Slot.ts server/src/modules/slots/slots.schemas.ts server/src/modules/slots/slots.service.ts server/src/modules/dashboard/dashboard.service.ts server/src/seed/seed.ts server/test/slots.service.test.ts server/test/dashboard.service.test.ts
git commit -m "feat(server): derive Slot booked/held from SlotBooking; drop stored fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Server — seed real bookings (preserve 288/36)

**Files:**
- Create: `server/src/seed/slotBookings.seed.ts` (pure, testable planner)
- Modify: `server/src/seed/seed.ts` (call the planner, insert `SlotBooking` docs)
- Test: `server/test/slotBookings.seed.test.ts`

**Interfaces:**
- Consumes: `isEligible`; the seeded `sessions` (per-slot `{booked, held}` targets) and inserted slot docs; `jobseekerDocs`, `drives` arrays already present in `seed.ts`.
- Produces: `planSlotBookings(specs, rng)` returning booking specs; `SlotBooking` docs in the DB after seeding.

- [ ] **Step 1: Write the failing planner test**

Create `server/test/slotBookings.seed.test.ts`:

```ts
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
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -w server -- slotBookings.seed`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the planner**

Create `server/src/seed/slotBookings.seed.ts`:

```ts
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
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -w server -- slotBookings.seed`
Expected: PASS.

- [ ] **Step 5: Wire the planner into `seed.ts`**

In `server/src/seed/seed.ts`:
- Add imports: `import { SlotBooking } from '../models/SlotBooking.js';`, `import { planSlotBookings, type SlotBookingSpec } from './slotBookings.seed.js';`, and `import { isEligible } from '../modules/seekerPortal/seekerPortal.service.js';`
- Capture the inserted slot docs: change `await Slot.insertMany(slotDocs);` to `const createdSlots = await Slot.insertMany(slotDocs);`
- After that line, build the per-slot eligible pools and create bookings. `sessions[i]` is index-aligned to `slotDocs[i]`/`createdSlots[i]`, and each `slotDocs[i].driveId` came from `drives`. Build a `driveId → eligibility` map and a `driveId → Match-Ready+ eligible jobseeker ids` pool, then plan + insert:

```ts
  // Real candidate↔slot bookings reproducing the per-slot booked/held targets.
  const MATCH_READY = new Set(['MatchReady', 'Shortlisted', 'Offer', 'Joined']);
  const driveById = new Map(drives.map((d) => [String(d._id), d]));
  const readySeekers = jobseekerDocs.filter((j) => MATCH_READY.has(j.stage as string));
  const poolByDrive = new Map<string, string[]>();
  for (const [driveIdStr, d] of driveById) {
    const pool = readySeekers
      .filter((j) => isEligible((d as { eligibility?: unknown }).eligibility as never,
        { branch: j.branch as string, gradYear: j.gradYear as number, source: j.source as string }))
      .map((j) => String((j as { _id: unknown })._id));
    poolByDrive.set(driveIdStr, pool);
  }
  const specs: SlotBookingSpec[] = createdSlots.map((slot, i) => ({
    slotId: String(slot._id),
    booked: sessions[i].booked,
    held: sessions[i].held,
    pool: poolByDrive.get(String(slot.driveId)) ?? [],
  }));
  const planned = planSlotBookings(specs, rng);
  await SlotBooking.insertMany(planned.map((p) => ({ slotId: p.slotId, jobseekerId: p.jobseekerId, status: p.status })));
```

NOTE: `jobseekerDocs` are plain objects passed to `Jobseeker.insertMany`; if they don't carry `_id`, capture the inserted docs instead (`const createdSeekers = await Jobseeker.insertMany(jobseekerDocs);` and filter/map over `createdSeekers`). Verify which variable holds persisted `_id`s and use that. Likewise confirm `drives` holds persisted docs with `_id` and `eligibility` (read the seed's drive-insert lines first).

- [ ] **Step 6: Type-check**

Run: `npx -w server tsc --noEmit`
Expected: clean. (Do NOT run `npm run seed` — the seed RUN happens in Task 7 against an isolated DB.)

- [ ] **Step 7: Commit**

```bash
git add server/src/seed/slotBookings.seed.ts server/src/seed/seed.ts server/test/slotBookings.seed.test.ts
git commit -m "feat(server): seed real slot bookings reproducing 288 booked / 36 held

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Client — types, booking hooks, `SlotModal` booked→read-only

**Files:**
- Modify: `client/src/types/slots.ts`
- Create: `client/src/pages/Slots/hooks/useSlotBookings.ts`
- Modify: `client/src/pages/Slots/SlotModal.tsx`
- Test: `client/src/test/SlotModal.test.tsx` (create or extend)

**Interfaces:**
- Consumes: `apiFetch`, `useAuth`, the server booking endpoints (Task 2).
- Produces:
  - Types `BookingStatus = 'Booked' | 'Held'`, `RosterEntry`, `CandidateOption`, `SlotRoster = { booked: RosterEntry[]; held: RosterEntry[] }`; `SlotInput` no longer has `booked` (and `held` stays optional/removed).
  - Hooks `useSlotRoster(slotId)`, `useEligibleCandidates(slotId, q)`, `useBookingMutations(slotId)` returning `{ book, confirm, release }` — all invalidate `['slot-roster', slotId]` AND `['slots']`.

- [ ] **Step 1: Update the types**

In `client/src/types/slots.ts`:
- `SlotItem` keeps `booked`/`held` (now derived — no change to the interface).
- In `SlotInput`, remove `booked: number;` and `held?: number;` (they're no longer submitted).
- Append:
```ts
export type BookingStatus = 'Booked' | 'Held';
export interface RosterEntry {
  bookingId: string; jobseekerId: string; name: string;
  institute: string; branch: string; stage: string; status: BookingStatus;
}
export interface SlotRoster { booked: RosterEntry[]; held: RosterEntry[] }
export interface CandidateOption { id: string; name: string; institute: string; branch: string; stage: string }
export interface EligibleResponse { items: CandidateOption[] }
```

- [ ] **Step 2: Write the hooks**

Create `client/src/pages/Slots/hooks/useSlotBookings.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { BookingStatus, EligibleResponse, SlotRoster } from '../../../types/slots.js';

export function useSlotRoster(slotId: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['slot-roster', slotId],
    queryFn: () => apiFetch<SlotRoster>(`/slots/${slotId}/bookings`, { token }),
    enabled: !!token && !!slotId,
  });
}

export function useEligibleCandidates(slotId: string | null, q: string) {
  const { token } = useAuth();
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return useQuery({
    queryKey: ['slot-eligible', slotId, q.trim()],
    queryFn: () => apiFetch<EligibleResponse>(`/slots/${slotId}/eligible-candidates${qs}`, { token }),
    enabled: !!token && !!slotId,
  });
}

export function useBookingMutations(slotId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['slot-roster', slotId] });
    qc.invalidateQueries({ queryKey: ['slot-eligible', slotId] });
    qc.invalidateQueries({ queryKey: ['slots'] });
  };
  const book = useMutation({
    mutationFn: ({ jobseekerId, status }: { jobseekerId: string; status: BookingStatus }) =>
      apiFetch(`/slots/${slotId}/bookings`, { method: 'POST', body: { jobseekerId, status }, token }),
    onSuccess: invalidate,
  });
  const confirm = useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch(`/slots/${slotId}/bookings/${bookingId}`, { method: 'PATCH', body: { status: 'Booked' }, token }),
    onSuccess: invalidate,
  });
  const release = useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch(`/slots/${slotId}/bookings/${bookingId}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
  });
  return { book, confirm, release };
}
```

- [ ] **Step 3: Write the failing `SlotModal` test**

Create/extend `client/src/test/SlotModal.test.tsx`. Inspect an existing client modal test first for the render/provider harness:

Run: `sed -n '1,40p' client/src/test/DriveWizard.test.tsx`

Then assert the submitted payload no longer includes `booked` (mock `useSlotMutations` and capture the create body):

```tsx
// harness copied from an existing client test (QueryClientProvider + AuthProvider)
it('create payload does not include booked (derived)', async () => {
  const created: unknown[] = [];
  // mock useSlotMutations so create.mutateAsync records the body
  // (use vi.mock on '../pages/Slots/hooks/useSlotMutations.js' returning create/update/remove;
  //  create.mutateAsync = vi.fn(async (b) => { created.push(b); }))
  // render <SlotModal mode="create" date="2026-07-15" onClose={() => {}} />, fill required fields, click Save
  // then:
  expect(created).toHaveLength(1);
  expect(created[0]).not.toHaveProperty('booked');
});
```

(Match the exact mocking style used by the existing client tests — do not invent a new pattern.)

- [ ] **Step 4: Run — expect FAIL**

Run: `npm test -w client -- SlotModal`
Expected: FAIL (payload still has `booked`).

- [ ] **Step 5: Edit `SlotModal.tsx`**

In `client/src/pages/Slots/SlotModal.tsx`:
- Remove `booked` from `FormState` and from `blankForm` (delete `booked: String(slot?.booked ?? 0),`).
- Remove the `booked` `<div className="fld">…#slmBooked…</div>` input block. In its place, in edit mode only, show a read-only derived count:
```tsx
          {mode === 'edit' && slot && (
            <div className="fld">
              <label>Booked</label>
              <input value={`${slot.booked} / ${slot.capacity}`} readOnly disabled />
            </div>
          )}
```
- In `validate()`, delete `const booked = Number(form.booked);` and the `if (booked > capacity)` and `if (attended > booked)` blocks (the server enforces attended ≤ derived booked). Keep the required-field + `end > start` checks.
- In the returned `SlotInput`, remove `booked,` (and `held` if present).

- [ ] **Step 6: Run — expect PASS + tsc**

Run: `npm test -w client -- SlotModal` then `npx -w client tsc --noEmit`
Expected: PASS + clean. (`SlotActionModal` reads `slot.booked` off `SlotItem`, which still exists — no change needed there.)

- [ ] **Step 7: Commit**

```bash
git add client/src/types/slots.ts client/src/pages/Slots/hooks/useSlotBookings.ts client/src/pages/Slots/SlotModal.tsx client/src/test/SlotModal.test.tsx
git commit -m "feat(client): booking hooks + types; SlotModal booked is read-only derived

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Client — `SlotRosterModal` + page wiring

**Files:**
- Create: `client/src/pages/Slots/SlotRosterModal.tsx`
- Modify: `client/src/pages/Slots/SlotModal.tsx` (add a "Manage roster" footer button in edit mode)
- Modify: `client/src/pages/Slots/index.tsx` (roster modal state + wiring)
- Test: `client/src/test/SlotRosterModal.test.tsx`

**Interfaces:**
- Consumes: `useSlotRoster`, `useEligibleCandidates`, `useBookingMutations` (Task 5); `SlotItem`, `SlotRoster`, `CandidateOption`.
- Produces: `SlotRosterModal({ slot, onClose })`; `SlotModal` gains prop `onManageRoster?: (slot: SlotItem) => void`.

- [ ] **Step 1: Write the failing modal test**

Create `client/src/test/SlotRosterModal.test.tsx` (copy the QueryClientProvider + AuthProvider harness + `vi.stubGlobal('fetch', …)` pattern from an existing client test, e.g. `StepEvaluation.test.tsx`). Mock fetch so:
- `GET /slots/:id/bookings` → `{ booked: [{ bookingId:'b1', jobseekerId:'j1', name:'Booked One', institute:'IIT', branch:'CSE', stage:'MatchReady', status:'Booked' }], held: [{ bookingId:'b2', jobseekerId:'j2', name:'Held One', institute:'IIT', branch:'CSE', stage:'MatchReady', status:'Held' }] }`
- `GET /slots/:id/eligible-candidates` → `{ items: [{ id:'j3', name:'Pickable', institute:'IIT', branch:'CSE', stage:'MatchReady' }] }`
- `POST`/`PATCH`/`DELETE` → `{ ok: true }`

```tsx
it('renders booked + held rosters and books an eligible candidate', async () => {
  // render <SlotRosterModal slot={fakeSlot} onClose={() => {}} /> inside providers
  expect(await screen.findByText('Booked One')).toBeTruthy();
  expect(screen.getByText('Held One')).toBeTruthy();
  const pick = await screen.findByText('Pickable');
  // click its "Book" button → assert a POST to /bookings fired with jobseekerId 'j3' and status 'Booked'
});

it('confirms a held booking and releases a booking', async () => {
  // click Held One's "Confirm" → PATCH /bookings/b2 { status:'Booked' }
  // click Booked One's "Remove" → DELETE /bookings/b1
});
```

Assert the correct URL + method + body were called (capture via the `fetch` mock).

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -w client -- SlotRosterModal`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `SlotRosterModal.tsx`**

Create `client/src/pages/Slots/SlotRosterModal.tsx` — modal shell using the prototype classes (`.modal-scrim`, `.modal`, `.modal-h/.modal-b/.modal-f`, `.fld`, `.btn`), following `SlotModal.tsx`/`AssignDrivesModal` for structure:

```tsx
import { useState } from 'react';
import { ApiError } from '../../api/client.js';
import type { SlotItem } from '../../types/slots.js';
import { to12 } from './calendarUtils.js';
import { useSlotRoster, useEligibleCandidates, useBookingMutations } from './hooks/useSlotBookings.js';

export interface SlotRosterModalProps { slot: SlotItem; onClose: () => void }

export function SlotRosterModal({ slot, onClose }: SlotRosterModalProps) {
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: roster } = useSlotRoster(slot.id);
  const { data: eligible } = useEligibleCandidates(slot.id, q);
  const { book, confirm, release } = useBookingMutations(slot.id);

  const booked = roster?.booked ?? [];
  const held = roster?.held ?? [];
  const seatsUsed = booked.length + held.length;
  const full = seatsUsed >= slot.capacity;

  function run(p: Promise<unknown>) {
    setError(null);
    p.catch((e) => setError(e instanceof ApiError ? e.message : 'Something went wrong.'));
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rosterTitle">
        <div className="modal-h">
          <div>
            <h3 id="rosterTitle">Slot Roster</h3>
            <p>{slot.driveName} · {slot.date.slice(0, 10)} {to12(slot.start)} · {booked.length} booked / {slot.capacity} · {held.length} held</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          {error && <div className="fld full" style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>}

          <div className="fld full">
            <label>Booked ({booked.length})</label>
            {booked.length === 0 && <p className="fnote">No candidates booked yet.</p>}
            {booked.map((r) => (
              <div key={r.bookingId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1 }}>{r.name} · {r.institute} · {r.branch} · {r.stage}</span>
                <button className="btn btn-ghost" disabled={release.isPending} onClick={() => run(release.mutateAsync(r.bookingId))}>Remove</button>
              </div>
            ))}
          </div>

          <div className="fld full">
            <label>Held ({held.length})</label>
            {held.length === 0 && <p className="fnote">No holds.</p>}
            {held.map((r) => (
              <div key={r.bookingId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1 }}>{r.name} · {r.institute} · {r.branch} · {r.stage}</span>
                <button className="btn btn-ghost" disabled={confirm.isPending} onClick={() => run(confirm.mutateAsync(r.bookingId))}>Confirm</button>
                <button className="btn btn-ghost" disabled={release.isPending} onClick={() => run(release.mutateAsync(r.bookingId))}>Release</button>
              </div>
            ))}
          </div>

          <div className="fld full">
            <label htmlFor="rosterSearch">Add a candidate {full && '(slot full)'}</label>
            <input id="rosterSearch" placeholder="Search Match-Ready candidates…" value={q} onChange={(e) => setQ(e.target.value)} disabled={full} />
            {(eligible?.items ?? []).map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1 }}>{c.name} · {c.institute} · {c.branch} · {c.stage}</span>
                <button className="btn btn-ghost" disabled={full || book.isPending} onClick={() => run(book.mutateAsync({ jobseekerId: c.id, status: 'Held' }))}>Hold</button>
                <button className="btn btn-primary" disabled={full || book.isPending} onClick={() => run(book.mutateAsync({ jobseekerId: c.id, status: 'Booked' }))}>Book</button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the entry point in `SlotModal.tsx`**

Add an optional prop and a footer button (edit mode) that opens the roster:
- In `SlotModalProps`, add `onManageRoster?: (slot: SlotItem) => void;`
- In the `modal-f` footer, before Cancel, in edit mode:
```tsx
          {mode === 'edit' && slot && onManageRoster && (
            <button className="btn btn-ghost btn-lg" type="button" onClick={() => onManageRoster(slot)}>
              <i className="ti ti-users" /> Roster
            </button>
          )}
```

- [ ] **Step 5: Wire `index.tsx`**

In `client/src/pages/Slots/index.tsx`:
- Import: `import { SlotRosterModal } from './SlotRosterModal.js';`
- Add state: `const [rosterModal, setRosterModal] = useState<{ slot: SlotItem } | null>(null);`
- Pass to `SlotModal`: `onManageRoster={(slot) => { setModal(null); setRosterModal({ slot }); }}`
- Render after the action modal:
```tsx
        {rosterModal && (
          <SlotRosterModal slot={rosterModal.slot} onClose={() => setRosterModal(null)} />
        )}
```

- [ ] **Step 6: Run — expect PASS + tsc + full client suite**

Run: `npm test -w client -- SlotRosterModal` then `npx -w client tsc --noEmit` then `npm test -w client`
Expected: PASS + clean + full suite green.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/Slots/SlotRosterModal.tsx client/src/pages/Slots/SlotModal.tsx client/src/pages/Slots/index.tsx client/src/test/SlotRosterModal.test.tsx
git commit -m "feat(client): SlotRosterModal (book/hold/confirm/release) + slot modal entry point

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only). Controller runs the seed + smoke against an ISOLATED DB.

- [ ] **Step 1: Full suites** — `npm test -w server && npm test -w client`
- [ ] **Step 2: Type-check both + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`
- [ ] **Step 3: Seed + smoke against an isolated DB** (controller): `MONGODB_URI=mongodb://localhost:27017/matchday_candslot_smoke npm run seed -w server` (verifies the seed runs clean, creates bookings, and doesn't throw the pool-too-small guard); start the worktree server on a spare port + that DB; fresh admin token:
  - `GET /api/dashboard/overview` → `slotUtilization` = `{ booked: 288, held: 36, available: 36, total: 360, utilizedPct: 80 }`; `readiness.score` === 84.
  - Reconcile: `booked` === `SlotBooking.countDocuments({ status: 'Booked' })` === 288; `held` === 36 (DB-direct).
  - Pick a Scheduled (future) slot with slack → `GET /api/slots/:id/eligible-candidates` returns candidates → `POST /api/slots/:id/bookings` `{jobseekerId, status:'Booked'}` → 201; re-GET dashboard → booked === 289.
  - `POST` an ineligible candidate (stage Applied, or branch not in the drive's eligibility) → 400 (`not_match_ready` / `not_eligible`).
  - Fill a small-capacity slot then one more `POST` → 400 `slot_full`.
  - `DELETE /api/slots/:id` for a slot with bookings → its `SlotBooking` docs are gone (DB-direct count 0).
  - Stop server, drop `matchday_candslot_smoke`. Confirm the shared `matchday` DB is present and untouched.
- [ ] **Step 4: No commit** (verification task).

---

## Self-Review Notes (author)

- **Spec coverage:** `SlotBooking` collection + rules → T1; routes → T2; derive `booked`/`held` + remove stored fields (model/schema/slots.service/dashboard) → T3; seed real bookings preserving 288/36 → T4; client types+hooks+SlotModal → T5; SlotRosterModal + wiring → T6; E2E → T7.
- **Atomic cutover:** removing `Slot.booked`/`held` breaks slots.service, dashboard.service, and the seed literal at once → all in T3 to keep `tsc` green; T4 adds the bookings; T3 leaves the seed bookingless (derived 0) which is fine until T7 runs the seed.
- **Dup handling:** the central `errorHandler` has no Mongo 11000 mapping, so `createBooking` pre-checks with `findOne` and throws `HttpError(400, …, 'already_booked')`; the unique index is the DB safety net.
- **Capacity semantics:** both Booked and Held consume a seat (`countDocuments({slotId}) >= capacity` → full), matching the spec's `booked + held < capacity`.
- **Attended vs derived booked:** with `booked` no longer stored, the `attended <= booked` invariant compares stored `attended` to `SlotBooking.countDocuments({slotId, status:'Booked'})` in create (0 for a fresh slot) and update.
- **isEligible reuse:** the booking rule + the seed pool both use `isEligible` from seekerPortal.service — consistent with the portal's "which drives a seeker sees."
- **Seed determinism:** `planSlotBookings` shuffles via the passed `rng` (no `Math.random`); throws loudly if any pool < booked+held. The implementer must confirm which seed variables hold persisted `_id`s (jobseekers/drives) before mapping.
- **Type consistency:** `RosterEntry`/`CandidateOption` fields match between server service (T1) and client types (T5); hook query keys (`['slot-roster', slotId]`, `['slot-eligible', slotId]`, `['slots']`) are consistent across T5/T6.
