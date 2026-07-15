# Slots Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the slot calendar (Month/Week/Day views + session CRUD + quick actions) and migrate the `Slot` collection from per-seat docs to session docs, with the Command Center aggregation migrated in the same coordinated step.

**Architecture:** One breaking, coordinated server task migrates `Slot` (model + dashboard service + dashboard tests + seed, Option B sums: Σcap 360 / Σbooked 288 / Σheld 36). Then a `slots` server module (range-query list with name joins + CRUD with merged-doc business validation), then the React `/slots` calendar (three views, slot modal, quick-action modal) on the established patterns.

**Tech Stack:** unchanged (Express/TS/Mongoose/zod; React/Vite/react-router/TanStack Query; Vitest + supertest + mongodb-memory-server; Vitest + RTL).

## Global Constraints

- **Language:** TypeScript strict; ESM `.js` import extensions.
- **Spec is authoritative:** `docs/superpowers/specs/2026-07-15-slots-module-design.md`.
- **Error shape:** `{ error: { message, code } }`; zod → 400 `validation`; unknown/malformed id → 404 `not_found`; 401 no token.
- **Coordinated migration (Task 1) must land atomically green:** model enum change + dashboard service + dashboard tests + seed together; the full suite passes at the task's commit.
- **Option B sums are exact:** seeded sessions must satisfy Σcapacity=360, Σbooked=288, Σheld=36 (assert them in the seed with a thrown error if violated — cheap self-check).
- **DTO stability:** `DashboardOverview` shape unchanged (`slotUtilization` keys identical); only the numbers' derivation changes.
- **Business rules:** `booked + held ≤ capacity`, `attended ≤ booked` — enforced by zod on create and by the service on update (merged with the existing doc).
- **Determinism:** seed uses the fixed PRNG only (no `Math.random`, no bare `new Date()` for values; session dates via `Date.UTC(2026, 6, day)`).
- **Faithful UI port:** real prototype classes (grep `theme.css`); prototype calendar renderers are at `matchday-admin-app_23.html` lines 3579–3675.
- **Type-check gate:** `npx tsc --noEmit` for the touched workspace after every task; Vitest does not type-check.
- **Commit trailer:** every commit body ends with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
server/src/
  models/Slot.ts                            # migrated (T1)
  modules/dashboard/dashboard.service.ts    # session sums (T1)
  seed/seed.ts                              # session seeding (T1)
  modules/slots/
    slots.schemas.ts slots.service.ts slots.controller.ts slots.routes.ts   # (T2/T3)
  app.ts                                    # mount /api/slots (T3)
server/test/
  dashboard.service.test.ts                 # slot fixtures rewritten (T1)
  models.test.ts                            # + session slot test (T1)
  slots.service.test.ts                     # (T2)
  slots.route.test.ts                       # (T3)
client/src/
  types/slots.ts                            # (T4)
  pages/Slots/
    index.tsx MonthView.tsx                 # (T4)
    WeekView.tsx DayView.tsx                # (T5)
    SlotModal.tsx SlotActionModal.tsx       # (T6)
    hooks/useSlots.ts useSlotMutations.ts   # (T4/T6)
  App.tsx components/Sidebar.tsx            # route + nav (T4)
client/src/test/
  MonthView.test.tsx                        # (T4)
  SlotModal.test.tsx                        # (T6)
```

---

## Task 1: Coordinated Slot migration (model + dashboard + tests + seed)

**Files:**
- Modify: `server/src/models/Slot.ts`, `server/src/modules/dashboard/dashboard.service.ts`, `server/test/dashboard.service.test.ts`, `server/test/models.test.ts`, `server/src/seed/seed.ts`

**Interfaces:** the migrated `Slot` per spec §3. Dashboard reads become session sums per spec §4. All four files change together; suite green at commit.

- [ ] **Step 1: Rewrite `server/src/models/Slot.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const slotSchema = new Schema({
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', default: null },
  date: { type: Date, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  capacity: { type: Number, default: 10 },
  booked: { type: Number, default: 0 },
  held: { type: Number, default: 0 },
  status: { type: String, enum: ['Scheduled', 'Completed', 'Cancelled'], default: 'Scheduled' },
  link: { type: String, default: '' },
  attended: { type: Number, default: 0 },
  noShow: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export type SlotDoc = InferSchemaType<typeof slotSchema>;
export const Slot = model('Slot', slotSchema);
```

- [ ] **Step 2: Migrate the slot reads in `server/src/modules/dashboard/dashboard.service.ts`**

Replace the status-count aggregation block:
```ts
  const slotAgg = await Slot.aggregate<{ _id: null; booked: number; held: number; capacity: number }>([
    { $group: { _id: null, booked: { $sum: '$booked' }, held: { $sum: '$held' }, capacity: { $sum: '$capacity' } } },
  ]);
  const booked = slotAgg[0]?.booked ?? 0;
  const held = slotAgg[0]?.held ?? 0;
  const totalSlots = slotAgg[0]?.capacity ?? 0;
  const available = Math.max(0, totalSlots - booked - held);
```
(Delete the old `slotBy` map lines.) `slotUtilization` stays `{ booked, held, available, total: totalSlots, utilizedPct: pct(booked, totalSlots) }`; `slotsOpened = totalSlots` (already); the `slotsAvailable` KPI uses `available` (already). In the events block, replace the two per-drive `Slot.countDocuments` calls with one aggregation:
```ts
    const driveAgg = await Slot.aggregate<{ _id: null; cap: number; booked: number }>([
      { $match: { driveId: d._id } },
      { $group: { _id: null, cap: { $sum: '$capacity' }, booked: { $sum: '$booked' } } },
    ]);
    const driveCap = driveAgg[0]?.cap ?? 0;
    const driveBooked = driveAgg[0]?.booked ?? 0;
```
and use `slots: driveCap`, `prepPct: pct(driveBooked, driveCap)`.

- [ ] **Step 3: Rewrite the slot fixtures in `server/test/dashboard.service.test.ts`**

Replace the 10 per-seat `Slot.create` loop with two sessions preserving every asserted value (booked 6 / held 2 / available 2 / total 10 / util 60):
```ts
  for (let i = 0; i < 2; i++) {
    await Slot.create({
      driveId: drive!._id, employerId: emp!._id, date: new Date('2026-07-15T00:00:00.000Z'),
      start: i === 0 ? '10:00' : '14:00', end: i === 0 ? '12:00' : '16:00',
      capacity: 5, booked: 3, held: 1, status: 'Scheduled',
    });
  }
```
All existing assertions (`slotUtilization` object, slots pillar 60, events[0] prep) remain UNCHANGED — if one fails, fix the service, not the assertion.

- [ ] **Step 4: Add a session model test to `server/test/models.test.ts`**

```ts
  it('persists a session slot and rejects an invalid status', async () => {
    const d = await Drive.create({ name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });
    const s = await Slot.create({ driveId: d._id, date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity: 12, booked: 9, held: 1 });
    expect(s.status).toBe('Scheduled');
    expect(s.employerId).toBeNull();
    await expect(Slot.create({ driveId: d._id, date: new Date(), start: '10:00', end: '12:00', status: 'Open' as never })).rejects.toThrow();
  });
```
(Add the `Slot` import if missing.)

- [ ] **Step 5: Rewrite the slot block in `server/src/seed/seed.ts` (Option B exact sums)**

Replace the per-seat `statusPlan` block entirely:
```ts
  // Interview slot sessions across Jul 2026 (Wed & Sat). Option B sums: cap 360 / booked 288 / held 36.
  const SLOT_DAYS = [1, 4, 8, 11, 15, 18, 22, 25, 29];
  const WINDOWS: [string, string][] = [['10:00', '12:00'], ['14:00', '16:00'], ['16:30', '18:00']];
  type SeedSession = { day: number; start: string; end: string; capacity: number; booked: number; held: number };
  const sessions: SeedSession[] = [];
  for (const day of SLOT_DAYS) {
    const nWindows = day % 3 === 0 ? 3 : 2;
    for (let w = 0; w < nWindows; w++) {
      const [start, end] = WINDOWS[w];
      sessions.push({ day, start, end, capacity: intBetween(rng, 12, 20), booked: 0, held: 0 });
    }
  }
  // normalize capacities to exactly 360
  let capSum = sessions.reduce((a, s) => a + s.capacity, 0);
  for (let i = 0; capSum !== 360; i++) {
    const s = sessions[i % sessions.length];
    if (capSum > 360 && s.capacity > 8) { s.capacity--; capSum--; }
    else if (capSum < 360 && s.capacity < 50) { s.capacity++; capSum++; }
  }
  // booked ≈ 80% of capacity, adjusted to exactly 288
  for (const s of sessions) s.booked = Math.floor(s.capacity * 0.8);
  let bookedSum = sessions.reduce((a, s) => a + s.booked, 0);
  for (let i = 0; bookedSum !== 288; i++) {
    const s = sessions[i % sessions.length];
    if (bookedSum < 288 && s.booked < s.capacity) { s.booked++; bookedSum++; }
    else if (bookedSum > 288 && s.booked > 0) { s.booked--; bookedSum--; }
  }
  // held = 36, preferring future sessions with slack; fall back to any session with slack
  let heldSum = 0;
  const bySlackPref = [...sessions.filter((s) => s.day >= 15), ...sessions.filter((s) => s.day < 15)];
  for (let i = 0, guard = 0; heldSum < 36 && guard < 100000; i++, guard++) {
    const s = bySlackPref[i % bySlackPref.length];
    if (s.booked + s.held < s.capacity) { s.held++; heldSum++; }
  }
  if (capSum !== 360 || bookedSum !== 288 || heldSum !== 36) throw new Error(`slot seed sums off: cap=${capSum} booked=${bookedSum} held=${heldSum}`);
  const slotDocs = sessions.map((s, idx) => {
    const past = s.day < 15;
    const cancelled = idx === 5 || idx === 13;   // two deterministic cancellations
    const attended = past && !cancelled ? Math.max(0, s.booked - intBetween(rng, 0, 3)) : 0;
    return {
      driveId: (s.day === 15 ? drives[0] : drives[idx % 3])._id,
      employerId: employers[idx % 9]._id,
      date: new Date(Date.UTC(2026, 6, s.day)),
      start: s.start, end: s.end, capacity: s.capacity, booked: s.booked, held: s.held,
      status: cancelled ? 'Cancelled' : past ? 'Completed' : 'Scheduled',
      link: past ? '' : `https://meet.hiringhood.com/${Math.floor(rng() * 2176782336).toString(36)}`,
      attended, noShow: past && !cancelled ? s.booked - attended : 0,
      createdAt: spread(),
    };
  });
  await Slot.insertMany(slotDocs);
```
(`Slot` is already in the deleteMany group. The old `upcomingDates[0]`/`statusPlan` references go away.)

- [ ] **Step 6: Gates + commit**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0. `npm run test -w server` → ALL pass (dashboard fixtures rewritten; every prior assertion value preserved). `npm run seed` (mongod running) → "Seed complete." (the sums self-check throws if Option B is violated).
```bash
git add server/src/models/Slot.ts server/src/modules/dashboard/dashboard.service.ts server/test/dashboard.service.test.ts server/test/models.test.ts server/src/seed/seed.ts
git commit -m "refactor(server)!: migrate Slot to session model; dashboard sums sessions (Option B seed)"
```

---

## Task 2: Slots zod + service

**Files:**
- Create: `server/src/modules/slots/slots.schemas.ts`, `slots.service.ts`
- Test: `server/test/slots.service.test.ts`

**Interfaces:** `listSlots({from?, to?, employerId?})` → `{ items: SlotItem[] }` (date+start sorted, employer/drive names joined); `createSlot(input)` (drive must resolve → 404), `getSlot(id)`, `updateSlot(id, patch)` (merged-doc business validation → `HttpError(400, ..., 'validation')`), `deleteSlot(id)` → `{ deleted: true }`.

- [ ] **Step 1: Create `server/src/modules/slots/slots.schemas.ts`**

```ts
import { z } from 'zod';
import { Types } from 'mongoose';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const slotFields = z.object({
  date: z.coerce.date(),
  start: z.string().regex(TIME_RE),
  end: z.string().regex(TIME_RE),
  capacity: z.coerce.number().int().min(1).max(50).default(10),
  booked: z.coerce.number().int().min(0).default(0),
  held: z.coerce.number().int().min(0).default(0),
  status: z.enum(['Scheduled', 'Completed', 'Cancelled']).default('Scheduled'),
  employerId: objectId.or(z.literal('')).nullish(),
  driveId: objectId,
  link: z.string().url().or(z.literal('')).default(''),
  attended: z.coerce.number().int().min(0).default(0),
  noShow: z.coerce.number().int().min(0).default(0),
});
export const createSlotSchema = slotFields
  .refine((d) => d.booked + d.held <= d.capacity, { message: 'booked + held must not exceed capacity' })
  .refine((d) => d.attended <= d.booked, { message: 'attended must not exceed booked' });
export const updateSlotSchema = slotFields.partial();  // cross-field rules re-checked in the service on the merged doc

export const listQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  employerId: z.string().optional(),
});
export type CreateSlotInput = z.infer<typeof createSlotSchema>;
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>;
```

- [ ] **Step 2: Write the failing test `server/test/slots.service.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Drive } from '../src/models/Drive.js';
import { Employer } from '../src/models/Employer.js';
import { Slot } from '../src/models/Slot.js';
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
const input = (over = {}) => ({ date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity: 10, booked: 7, held: 1, status: 'Scheduled' as const, employerId: empId, driveId, link: '', attended: 0, noShow: 0, ...over });

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

  it('rejects create when booked+held exceed capacity (zod) and when the drive is missing (404)', async () => {
    await seedRefs();
    const { createSlotSchema } = await import('../src/modules/slots/slots.schemas.js');
    expect(() => createSlotSchema.parse({ ...input(), booked: 9, held: 2 })).toThrow();
    await expect(createSlot(input({ driveId: '64b000000000000000000000' }))).rejects.toThrow(/drive/i);
  });

  it('updates with merged-doc validation: reschedule + no-shows OK, over-capacity rejected', async () => {
    await seedRefs();
    const s = await createSlot(input());
    const moved = await updateSlot(String(s._id), { date: new Date('2026-07-22T00:00:00.000Z'), start: '16:30', end: '18:00' });
    expect(moved.start).toBe('16:30');
    const done = await updateSlot(String(s._id), { attended: 5, noShow: 2, status: 'Completed' });
    expect(done.status).toBe('Completed');
    expect(done.noShow).toBe(2);
    await expect(updateSlot(String(s._id), { booked: 12 })).rejects.toThrow(/capacity/i);       // 12 > cap 10
    await expect(updateSlot(String(s._id), { attended: 9 })).rejects.toThrow(/booked/i);        // 9 > booked 7
  });

  it('deletes and 404s on unknown/malformed ids', async () => {
    await seedRefs();
    const s = await createSlot(input());
    expect(await deleteSlot(String(s._id))).toEqual({ deleted: true });
    expect(await Slot.countDocuments({})).toBe(0);
    await expect(getSlot(String(s._id))).rejects.toThrow();
    await expect(getSlot('nope')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: RED** — `npm run test -w server -- slots.service` → FAIL (module not found).

- [ ] **Step 4: Implement `server/src/modules/slots/slots.service.ts`**

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Slot } from '../../models/Slot.js';
import { Drive } from '../../models/Drive.js';
import type { CreateSlotInput, UpdateSlotInput } from './slots.schemas.js';

export interface SlotItem {
  id: string; driveId: string; driveName: string;
  employerId: string | null; employerName: string;
  date: string; start: string; end: string;
  capacity: number; booked: number; held: number;
  status: string; link: string; attended: number; noShow: number;
}

function assertId(id: string, what = 'Slot') {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, `${what} not found`, 'not_found');
}
function normEmployer(v: string | null | undefined): Types.ObjectId | null {
  return v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null;
}

export async function listSlots(params: { from?: Date; to?: Date; employerId?: string }) {
  const match: Record<string, unknown> = {};
  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) range.$gte = params.from;
    if (params.to) { const end = new Date(params.to); end.setUTCHours(23, 59, 59, 999); range.$lte = end; }
    match.date = range;
  }
  if (params.employerId && Types.ObjectId.isValid(params.employerId)) match.employerId = new Types.ObjectId(params.employerId);
  const rows = await Slot.aggregate([
    { $match: match },
    { $lookup: { from: 'employers', localField: 'employerId', foreignField: '_id', as: 'emp' } },
    { $unwind: { path: '$emp', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'drives', localField: 'driveId', foreignField: '_id', as: 'drv' } },
    { $unwind: { path: '$drv', preserveNullAndEmptyArrays: true } },
    { $sort: { date: 1, start: 1 } },
  ]);
  const items: SlotItem[] = rows.map((r: Record<string, any>) => ({
    id: String(r._id), driveId: String(r.driveId), driveName: r.drv?.name ?? '—',
    employerId: r.employerId ? String(r.employerId) : null,
    employerName: r.emp?.name ?? '(Unallocated)',
    date: new Date(r.date).toISOString(), start: r.start, end: r.end,
    capacity: r.capacity ?? 0, booked: r.booked ?? 0, held: r.held ?? 0,
    status: r.status, link: r.link ?? '', attended: r.attended ?? 0, noShow: r.noShow ?? 0,
  }));
  return { items };
}

async function resolveDrive(driveId: string) {
  assertId(driveId, 'Drive');
  const d = await Drive.findById(driveId);
  if (!d) throw new HttpError(404, 'Drive not found', 'not_found');
  return d;
}

export async function createSlot(input: CreateSlotInput) {
  await resolveDrive(input.driveId);
  return Slot.create({ ...input, employerId: normEmployer(input.employerId), driveId: new Types.ObjectId(input.driveId) });
}
export async function getSlot(id: string) {
  assertId(id);
  const s = await Slot.findById(id);
  if (!s) throw new HttpError(404, 'Slot not found', 'not_found');
  return s;
}
export async function updateSlot(id: string, patch: UpdateSlotInput) {
  const s = await getSlot(id);
  if (patch.driveId !== undefined) { await resolveDrive(patch.driveId); s.driveId = new Types.ObjectId(patch.driveId); }
  if (patch.employerId !== undefined) s.employerId = normEmployer(patch.employerId);
  const { driveId: _d, employerId: _e, ...rest } = patch;
  Object.assign(s, rest);
  if (s.booked + s.held > s.capacity) throw new HttpError(400, 'booked + held must not exceed capacity', 'validation');
  if (s.attended > s.booked) throw new HttpError(400, 'attended must not exceed booked', 'validation');
  await s.save();
  return s;
}
export async function deleteSlot(id: string) {
  const s = await getSlot(id);
  await s.deleteOne();
  return { deleted: true };
}
```

- [ ] **Step 5: GREEN + gates + commit** — slots.service PASS; tsc 0; full suite pass.
```bash
git add server/src/modules/slots/slots.schemas.ts server/src/modules/slots/slots.service.ts server/test/slots.service.test.ts
git commit -m "feat(server): slots service (range list with joins, session CRUD with merged validation)"
```

---

## Task 3: Slots routes + controller

**Files:**
- Create: `server/src/modules/slots/slots.controller.ts`, `slots.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/slots.route.test.ts`

**Interfaces:** `slotRoutes` (all behind `requireAuth`): `GET /` (listQuerySchema), `POST /` (createSlotSchema → 201), `GET /:id`, `PATCH /:id` (updateSlotSchema), `DELETE /:id`. Mount `app.use('/api/slots', slotRoutes)` before `errorHandler`. Controllers mirror the established pattern.

- [ ] **Step 1: Create controller + routes** (mirror `employers.controller.ts`/`routes.ts`; DELETE handler responds with the service's `{deleted:true}`).

- [ ] **Step 2: Write `server/test/slots.route.test.ts`**

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Drive } from '../src/models/Drive.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);

describe('slots routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/slots')).status).toBe(401);
  });
  it('creates (201), lists in range, patches, deletes; 400 on over-capacity; 404 on unknown', async () => {
    const d = await Drive.create({ name: 'FE', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });
    const body = { date: '2026-07-15', start: '10:00', end: '12:00', capacity: 10, booked: 7, driveId: String(d._id) };
    const c = await auth(request(createApp()).post('/api/slots').send(body));
    expect(c.status).toBe(201);
    const list = await auth(request(createApp()).get('/api/slots?from=2026-07-01&to=2026-07-31'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].employerName).toBe('(Unallocated)');
    const bad = await auth(request(createApp()).post('/api/slots').send({ ...body, booked: 9, held: 3 }));
    expect(bad.status).toBe(400);
    const id = c.body._id;
    const upd = await auth(request(createApp()).patch(`/api/slots/${id}`).send({ status: 'Cancelled' }));
    expect(upd.body.status).toBe('Cancelled');
    const del = await auth(request(createApp()).delete(`/api/slots/${id}`));
    expect(del.body).toEqual({ deleted: true });
    const miss = await auth(request(createApp()).get('/api/slots/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
```

- [ ] **Step 3: Gates + commit** — route test PASS; tsc 0; full suite pass.
```bash
git add server/src/modules/slots server/src/app.ts server/test/slots.route.test.ts
git commit -m "feat(server): protected /api/slots routes"
```

---

## Task 4: Client — types, useSlots, page shell + MonthView + route/nav

**Files:**
- Create: `client/src/types/slots.ts`, `client/src/pages/Slots/index.tsx`, `MonthView.tsx`, `hooks/useSlots.ts`
- Modify: `client/src/App.tsx` (`/slots` route), `client/src/components/Sidebar.tsx` (Slots → `/slots`)
- Test: `client/src/test/MonthView.test.tsx`

- [ ] **Step 1: `types/slots.ts`** — `SlotItem` mirroring the server DTO; `SlotInput` (create/patch shape); `SlotListParams { from: string; to: string; employerId?: string }`.
- [ ] **Step 2: `hooks/useSlots.ts`** — key `['slots', from, to, employerId]`, GET `/slots?from&to&employerId` (qs-filtered), enabled on token — mirror `useJobseekers`.
- [ ] **Step 3: `index.tsx`** — AppShell (crumb "Demand", title "Slot Calendar"). State: `view: 'month'|'week'|'day'` (default month), `refDate: Date` (default today), `employerId`, `modal`/`actionModal` state (stubs with `// TODO(Task 6)` — clicking chips/Create sets state; nothing renders yet). Helpers: `ymd(d)`, `to12(hhmm)`, visible-range computation (month: first-of-grid → last-of-42-cell-grid; week: Sun–Sat around refDate; day: refDate). Toolbar: `.calseg` (Month/Week/Day, active `.on`), `.cal-nav` (`.navbtn` prev/next + Today ghost button; month ±1 month, week ±7d, day ±1d), `.cal-title` per view (month "July 2026"; week "Jul 13 – Jul 19, 2026"; day "Wednesday, July 15, 2026"), employer `<select>` from `useEmployers({limit:100})`, Create Slot. Render the active view (Week/Day render `// TODO(Task 5)` placeholders).
- [ ] **Step 4: `MonthView.tsx`** — port prototype lines 3584–3596: `.cal-month` > `.cal-dow` (7 headers) + `.cal-grid` of 42 `.cal-cell`s (`dim` out-of-month, `event` for in-month Wed/Sat, `today`); each cell: `.dnum`, up to 3 `.cal-chip`s (`{to12(start)} · {employerName.split(' ')[0]}`, `done`=Completed / `cancel`=Cancelled) and `.cal-more` "+N more". Props: `refDate`, `slots: SlotItem[]`, `onChipClick(slot)`, `onMoreClick(dateStr)`, `onCellClick(dateStr)` (empty in-month cell → create). Grep theme.css for `.cal-month/.cal-dow/.cal-grid/.cal-cell/.dnum/.cal-chip/.cal-more` (these are the SLOTS-page calendar classes — distinct from the dashboard's mini-calendar; verify and use the right ones).
- [ ] **Step 5: Route + nav** — `/slots` route (ProtectedRoute, self-wrapped AppShell); Sidebar Slots → `/slots`.
- [ ] **Step 6: Test `MonthView.test.tsx`** — render with 4 mocked slots on one day (3 chips + "+1 more") and one Cancelled on another; assert chip text/`cancel` class/"+1 more"; click a chip → `onChipClick` called with the slot; click "+1 more" → `onMoreClick` with the date.
- [ ] **Step 7: Gates + commit** — client tsc 0; suite pass, pristine; build success.
```bash
git add client/src/types/slots.ts client/src/pages/Slots client/src/App.tsx client/src/components/Sidebar.tsx client/src/test/MonthView.test.tsx
git commit -m "feat(client): slot calendar shell with month view, range query, route"
```

---

## Task 5: Client — WeekView + DayView

**Files:**
- Create: `client/src/pages/Slots/WeekView.tsx`, `DayView.tsx`
- Modify: `client/src/pages/Slots/index.tsx` (render them)

- [ ] **Step 1: `WeekView.tsx`** — port lines 3597–3607: `.cal-week` of 7 `.cal-wcol`s; `.wh` header (`DOW` + date number, `today` class; click → `onDayClick(dateStr)`), `.wb` body of `.wslot` entries (`.wt` time + `.we` employer; done/cancel classes; click → `onSlotClick(slot)`); "No slots" empty note.
- [ ] **Step 2: `DayView.tsx`** — port lines 3608–3628: `.cal-dayv` of `.dslot` cards — `.dtime` (12h start + "to end"), `.dmain` (employer, status badge Completed→st-active/Cancelled→st-archived/Scheduled→st-published, `.dl` detail row: Drive, Capacity `booked/capacity`, Attended + No-shows when Completed, "Link: available" when link, `.cap-bar` width `booked/capacity`%), `.dacts` buttons: Join (only when link && status!=='Cancelled'; `window.open(link)`), Link, Reschedule, No-shows, Edit — the last four fire `onAction(kind, slot)` (wired to TODO(Task 6) stubs for now, Edit → the modal stub). `.dm-empty` state.
- [ ] **Step 3: Wire into `index.tsx`** — replace the Task 4 placeholders; "+N more"/week-header clicks switch `view='day'` + `refDate`.
- [ ] **Step 4: Gates + commit** — tsc 0; suite pass; build success.
```bash
git add client/src/pages/Slots
git commit -m "feat(client): slot calendar week and day views with quick-action buttons"
```

---

## Task 6: Client — SlotModal + SlotActionModal + mutations

**Files:**
- Create: `client/src/pages/Slots/SlotModal.tsx`, `SlotActionModal.tsx`, `hooks/useSlotMutations.ts`
- Modify: `client/src/pages/Slots/index.tsx` (render both; replace stubs)
- Test: `client/src/test/SlotModal.test.tsx`

- [ ] **Step 1: `useSlotMutations.ts`** — create (POST `/slots`), update (PATCH `/slots/:id`), remove (DELETE `/slots/:id`); all invalidate `['slots']`.
- [ ] **Step 2: `SlotModal.tsx`** — port the modal (prototype lines 1986–2004): date/start/end inputs, capacity (1–50), booked, status select, employer select ("(Unallocated)" = '' + `useEmployers({limit:100})`), drive select (`useDrives({limit:100})`, non-Archived), link input + **Generate** (`https://meet.hiringhood.com/` + `Math.random().toString(36).slice(2,10)`), attended, no-shows; Delete (edit mode, `confirm()`); client validation mirrors the rules (`booked ≤ capacity` [held not shown, but the server checks the merged doc], `attended ≤ booked`, date+times required); create → `create.mutateAsync`, edit → `update.mutateAsync`; surface server 400s inline.
- [ ] **Step 3: `SlotActionModal.tsx`** — variants: `link` (input + generate → PATCH `{link}`), `resch` (date/start/end → PATCH), `noshow` (attended number input, max booked, helper text; confirm → PATCH `{attended, noShow: booked − attended, status: 'Completed'}`).
- [ ] **Step 4: Wire into `index.tsx`** — Create Slot / empty-cell click → SlotModal create (pre-dated); chip/wslot/Edit → SlotModal edit; day-view actions → SlotActionModal.
- [ ] **Step 5: Test `SlotModal.test.tsx`** — mocked fetch (employers/drives lists + POST); create mode: entering `booked > capacity` blocks Save with the error; fixing it and Saving fires POST with the right body. Pristine.
- [ ] **Step 6: Gates + commit** — tsc 0; full client suite pass; build success.
```bash
git add client/src/pages/Slots client/src/test/SlotModal.test.tsx
git commit -m "feat(client): slot editor and quick-action modals with mutations"
```

---

## Task 7: End-to-end verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** `npm test` → all green, pristine. **Step 2:** both tsc 0; client build success. **Step 3 (API smoke, mongod running):** re-seed; verify `GET /api/slots?from=2026-07-01&to=2026-07-31` returns ~22 sessions with joined names; create/patch(reschedule → no-shows)/delete round-trip; over-capacity 400; **Command Center: slotUtilization `{booked:288, held:36, available:36, total:360, utilizedPct:80}` and readiness ~84 "On track"** (record the exact readiness), matchReady 531 unchanged. **Step 4 (manual):** `/slots` — month grid with chips + Wed/Sat highlights; employer filter; week + day views; create/edit/delete a slot; link generate; reschedule; no-shows flow marks Completed. **Step 5:** README "Slots" line. **Step 6:** commit `docs: note Slots module and verify end-to-end`.

---

## Self-Review Notes (author checklist — resolved)

- **Spec coverage:** migration (T1 — model+dashboard+tests+seed atomically) · slots service/schemas incl. merged-doc validation (T2) · routes (T3) · calendar shell + month + route/nav (T4) · week/day (T5) · modals + mutations (T6) · E2E incl. Option B verification (T7). ✔
- **Green at each step:** T1 is atomic (breaking enum lands with all readers updated); T4/T5/T6 use the established stub-then-replace pattern with explicit TODO(Task N) markers.
- **Type consistency:** `SlotItem` identical server (`slots.service.ts`) ↔ client (`types/slots.ts`); modal PATCH bodies match `updateSlotSchema`; the no-shows action's `{attended, noShow, status}` passes the service's merged validation.
- **Placeholder scan:** server code complete; client tasks cite exact prototype line ranges; interim stubs (T4 view placeholders → T5; modal stubs → T6) are explicit and replaced. ✔
- **Determinism note:** the seed's sums are self-checked with a thrown error; the modal's link Generate uses `Math.random` CLIENT-side only (display data, not seed/test-asserted) — allowed.
