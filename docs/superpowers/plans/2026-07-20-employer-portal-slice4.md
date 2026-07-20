# Employer Portal — Slice 4: Slot Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in employer create and manage their own interview **slot windows** (real `Slot` docs, `employerId = self`) for a drive they have an **Approved** registration for — create/view/reschedule/cancel — and rewire the drive-detail "View slots" CTA to it.

**Architecture:** Reuse the `Slot` model verbatim (no schema change); `employerId` is server-set from the JWT `sub`, never the body. Four new endpoints on the existing `employerPortalRoutes` `/employer` gate; the candidate `SlotBooking` flow and admin `/api/slots` are untouched. `booked` is derived from `SlotBooking` (0 today). Client: a `useEmployerSlots`/`useSlotMutations` hook pair + an `EmployerSlots` page inside the shell, plus a gated CTA on the drive detail.

**Tech Stack:** Server — Express 4, Mongoose 8, zod, TS strict, ESM (`.js` import suffixes), vitest + supertest. Client — React 18, Vite, react-router-dom 6, @tanstack/react-query 5, vitest + @testing-library/react.

## Global Constraints

- ESM everywhere: import paths carry the `.js` suffix even for `.ts` files. TS strict; `tsc --noEmit` must stay clean (server and client).
- Error contract: `{ error: { message, code } }`. zod parse failure → `400` (`validation`); `requireRole` → `403`; missing token → `401`; a foreign or nonexistent slot on PATCH/DELETE → `404 not_found`, **indistinguishable** from "not found" (no enumeration oracle — same discipline as Slice 3's registration detail).
- **Server-authoritative identity:** `employerId` on a slot comes from `req.userId` (JWT `sub` = the Employer `_id`), NEVER the request body. The slot zod schemas must not accept `employerId`/`driveId` in the body (`driveId` comes from the route param `:id`).
- Business-precondition rejects use `400` with these exact `code`s: `registration_not_approved`, `date_not_in_schedule`, `slot_exists`, `slot_cap_reached`, `slot_has_bookings`, `slot_cancelled`.
- Date rule: a slot's `date` must fall on one of the drive's stored `eventDates` (compared by UTC calendar day). `Drive.primaryEventDate` is derived, not stored, so there is no fallback — an empty `eventDates` means no date is valid.
- Cap rule: `Drive.slotCap` defaults to `0`; treat `slotCap <= 0` as **no cap** (unlimited). Only enforce `slot_cap_reached` when `slotCap > 0`.
- Meeting link: `linkMode:'auto'` → server sets a **stub** `https://meet.hiringhood.test/<slotId>`; `linkMode:'own'` → the client-supplied URL (required + URL-validated when `own`).
- Client employer screens render **inside** `EmployerShell` (route-wrapped) — do NOT re-wrap in `.employer-app` (double-wrap bug). Field errors: `.err-msg` is `display:none` unless its `.field` parent also has `.show-err` — every rendered error must toggle `.show-err`.
- Commit messages end with exactly: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Work only in the worktree `/Users/srinivasarao.kandula/code/matchday-employer4` (branch `feat/employer-portal-slice4`). Never `git checkout`/`switch`/`branch`, never run seed against or write to the shared `matchday` DB; E2E uses an isolated DB dropped afterward.
- Admin `/api/slots` + the candidate `SlotBooking` module stay untouched.

## File Structure

**Server** (extend the existing employerPortal module — the service is ~128 lines today; +~90 keeps it under the split threshold):
- Modify `server/src/modules/employerPortal/employerPortal.schemas.ts` — add `createSlotSchema`, `updateSlotSchema`, `SlotInput`, `SlotPatch`.
- Modify `server/src/modules/employerPortal/employerPortal.service.ts` — add the slot helpers + `listEmployerSlots`, `createEmployerSlot` (Task 1), `updateEmployerSlot`, `deleteEmployerSlot` (Task 2).
- Modify `server/src/modules/employerPortal/employerPortal.controller.ts` — add 4 controllers.
- Modify `server/src/modules/employerPortal/employerPortal.routes.ts` — add 4 routes under the existing `/employer` gate.
- Create `server/test/employer-slots.route.test.ts` — Task 1 writes the create/list/gate cases; Task 2 extends it with reschedule/cancel/isolation.

**Client:**
- Modify `client/src/types/employer.ts` — add `EmployerSlot`, `EmployerSlotsResponse`, `SlotInput`.
- Create `client/src/pages/EmployerPortal/hooks/useEmployerSlots.ts` — `useEmployerSlots(driveId)`, `useSlotMutations(driveId)`.
- Create `client/src/pages/EmployerPortal/EmployerSlots.tsx` — the page.
- Modify `client/src/App.tsx` — add the `/employer/drives/:id/slots` route.
- Modify `client/src/pages/EmployerPortal/EmployerDriveDetail.tsx` — rewire + gate the "View slots" CTA.
- Create `client/src/test/EmployerSlots.test.tsx`.
- Modify `client/src/test/EmployerDriveDetail.test.tsx` — update the CTA test for the new gated destination.

---

### Task 1: Server — slot create + list + approved-registration gate

**Files:**
- Modify: `server/src/modules/employerPortal/employerPortal.schemas.ts`
- Modify: `server/src/modules/employerPortal/employerPortal.service.ts`
- Modify: `server/src/modules/employerPortal/employerPortal.controller.ts`
- Modify: `server/src/modules/employerPortal/employerPortal.routes.ts`
- Test: `server/test/employer-slots.route.test.ts` (create)

**Interfaces:**
- Consumes: `Slot` (`server/src/models/Slot.ts`), `SlotBooking` (`server/src/models/SlotBooking.ts`), `Drive`, `Employer`, `RegistrationRequest`, `HttpError`, existing `requireAuth`/`requireRole('employer')` gate on `employerPortalRoutes`.
- Produces (used by Task 2 + the client):
  - `createSlotSchema`, `updateSlotSchema` (zod); types `SlotInput` (`{ date: Date; start: string; end: string; capacity: number; linkMode: 'auto'|'own'; link?: string }`), `SlotPatch` (all optional).
  - `interface EmployerSlotItem { id: string; date: string; start: string; end: string; capacity: number; booked: number; status: string; link: string }`.
  - `listEmployerSlots(employerId: string, driveId: string): Promise<{ items: EmployerSlotItem[] }>`.
  - `createEmployerSlot(employerId: string, driveId: string, input: SlotInput): Promise<EmployerSlotItem>`.
  - Routes: `GET /api/me/employer/drives/:id/slots`, `POST /api/me/employer/drives/:id/slots`.
  - Private helpers (module-local, reused by Task 2): `hasApprovedRegistration`, `sameUTCDay`, `slotProjection`, `derivedBooked`.

- [ ] **Step 1: Write the failing test**

Create `server/test/employer-slots.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Slot } from '../src/models/Slot.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const EVENT_DATE = '2026-08-05T00:00:00.000Z';

async function drive(over: Record<string, unknown> = {}) {
  return Drive.create({
    name: 'D', domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date(EVENT_DATE)], candCap: 100, empCap: 8, slotCap: 20,
    frequency: 'Weekly', eventDay: 'Wednesday',
    eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' },
    ...over,
  });
}
async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane', ...over });
}
function tokenFor(emp: { _id: unknown }) { return signToken({ sub: String(emp._id), role: 'employer' }); }
async function approve(emp: { _id: unknown }, d: { _id: unknown }) {
  return RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: 'D', role: 'Data Analyst', status: 'Approved', activity: [] });
}
const body = (over: Record<string, unknown> = {}) => ({ date: EVENT_DATE, start: '10:00', end: '12:00', capacity: 8, linkMode: 'auto', ...over });

describe('POST /api/me/employer/drives/:id/slots', () => {
  it('creates a slot with server-authoritative employerId + a stub auto link', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send(body());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Scheduled');
    expect(res.body.booked).toBe(0);
    expect(res.body.link).toMatch(/^https:\/\/meet\.hiringhood\.test\//);
    const slot = await Slot.findOne({ driveId: d._id });
    expect(slot).not.toBeNull();
    expect(String(slot!.employerId)).toBe(String(emp._id)); // server-authoritative, not from body
  });

  it('stores the employer-supplied link when linkMode=own', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send(body({ linkMode: 'own', link: 'https://zoom.example/abc' }));
    expect(res.status).toBe(201);
    expect(res.body.link).toBe('https://zoom.example/abc');
  });

  it('rejects when the employer has no approved registration for the drive', async () => {
    const emp = await employer(); const d = await drive(); // no approve()
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('registration_not_approved');
  });

  it('a Pending-only registration does NOT unlock slot creation', async () => {
    const emp = await employer(); const d = await drive();
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: 'D', role: 'X', status: 'Pending review', activity: [] });
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('registration_not_approved');
  });

  it('rejects a date not in the drive schedule', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const res = await request(createApp())
      .post(`/api/me/employer/drives/${d._id}/slots`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send(body({ date: '2026-09-09T00:00:00.000Z' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('date_not_in_schedule');
  });

  it('rejects end <= start (400 validation) and capacity out of range', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const bad1 = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body({ start: '12:00', end: '10:00' }));
    expect(bad1.status).toBe(400);
    const bad2 = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body({ capacity: 99 }));
    expect(bad2.status).toBe(400);
  });

  it('rejects a duplicate slot at the same date+start (slot_exists)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    const dup = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    expect(dup.status).toBe(400);
    expect(dup.body.error.code).toBe('slot_exists');
  });

  it('enforces slotCap when > 0 (slot_cap_reached)', async () => {
    const emp = await employer(); const d = await drive({ slotCap: 1 }); await approve(emp, d);
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body({ start: '10:00', end: '12:00' }));
    const over = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body({ start: '12:00', end: '14:00' }));
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('slot_cap_reached');
  });

  it('401 without a token, 403 for an admin token', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const noTok = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).send(body());
    expect(noTok.status).toBe(401);
    const adminTok = signToken({ sub: String(emp._id), role: 'admin' });
    const admin = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${adminTok}`).send(body());
    expect(admin.status).toBe(403);
  });
});

describe('GET /api/me/employer/drives/:id/slots', () => {
  it('lists only the caller-employer own slots for the drive', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    const res = await request(app).get(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].start).toBe('10:00');
    expect(res.body.items[0].booked).toBe(0);
  });

  it('does not leak another employer slots (isolation)', async () => {
    const a = await employer({ email: 'a2@a.test' }); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d);
    await RegistrationRequest.create({ company: 'Beta', industry: 'Tech', submittedBy: 'B', employerId: b._id, driveId: d._id, driveName: 'D', role: 'X', status: 'Approved', activity: [] });
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(a)}`).send(body());
    const res = await request(app).get(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0); // B is approved but sees none of A's slots
  });

  it('surfaces a new slot in the dashboard aggregate', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body());
    const dash = await request(app).get('/api/me/employer').set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(dash.status).toBe(200);
    expect(dash.body.dashboard.kpis.totalSlots).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `npm test -w server -- employer-slots`
Expected: FAIL (routes/controllers not defined → 404s / import errors).

- [ ] **Step 3: Add the zod schemas**

In `server/src/modules/employerPortal/employerPortal.schemas.ts`, append:

```ts
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Server-authoritative: employerId comes from the JWT, driveId from the route
// param — neither is accepted in the body.
export const createSlotSchema = z.object({
  date: z.coerce.date(),
  start: z.string().regex(TIME_RE, 'Invalid time'),
  end: z.string().regex(TIME_RE, 'Invalid time'),
  capacity: z.number().int().min(1).max(50),
  linkMode: z.enum(['auto', 'own']),
  link: z.string().url().optional(),
}).refine((v) => v.linkMode !== 'own' || !!(v.link && v.link.length), { message: 'A meeting link is required', path: ['link'] });

export const updateSlotSchema = z.object({
  date: z.coerce.date().optional(),
  start: z.string().regex(TIME_RE).optional(),
  end: z.string().regex(TIME_RE).optional(),
  capacity: z.number().int().min(1).max(50).optional(),
  linkMode: z.enum(['auto', 'own']).optional(),
  link: z.string().url().optional(),
});

export type SlotInput = z.infer<typeof createSlotSchema>;
export type SlotPatch = z.infer<typeof updateSlotSchema>;
```

- [ ] **Step 4: Add the service helpers + `listEmployerSlots` + `createEmployerSlot`**

In `server/src/modules/employerPortal/employerPortal.service.ts`:

Add the `SlotBooking` import at the top (next to the existing `Slot` import):
```ts
import { SlotBooking } from '../../models/SlotBooking.js';
```
Add the slot types to the existing schema-type import:
```ts
import type { RegistrationInput, SlotInput } from './employerPortal.schemas.js';
```

Append at the end of the file:
```ts
// --- Employer slot management (Slice 4) -----------------------------------
// Reuses the Slot model verbatim; employerId is server-set (never from the body).
// booked is DERIVED from SlotBooking (0 until the candidate-booking slice) and
// never stored on the slot.
export interface EmployerSlotItem {
  id: string; date: string; start: string; end: string;
  capacity: number; booked: number; status: string; link: string;
}

async function hasApprovedRegistration(employerId: string, driveId: string): Promise<boolean> {
  return !!(await RegistrationRequest.findOne({ employerId, driveId, status: 'Approved' }));
}
function sameUTCDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}
async function derivedBooked(slotId: Types.ObjectId): Promise<number> {
  return SlotBooking.countDocuments({ slotId });
}
function slotProjection(s: Record<string, any>, booked: number): EmployerSlotItem {
  return { id: String(s._id), date: new Date(s.date).toISOString(), start: s.start, end: s.end,
    capacity: s.capacity ?? 0, booked, status: s.status, link: s.link ?? '' };
}
function stubLink(slotId: unknown): string { return `https://meet.hiringhood.test/${String(slotId)}`; }

export async function listEmployerSlots(employerId: string, driveId: string) {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive to manage slots', 'registration_not_approved');
  const rows = await Slot.find({ driveId, employerId }).sort({ date: 1, start: 1 }).lean();
  const bk = await SlotBooking.aggregate([
    { $match: { slotId: { $in: rows.map((r) => r._id) } } },
    { $group: { _id: '$slotId', n: { $sum: 1 } } },
  ]);
  const counts = new Map<string, number>(bk.map((r: Record<string, any>) => [String(r._id), r.n]));
  return { items: rows.map((s) => slotProjection(s, counts.get(String(s._id)) ?? 0)) };
}

export async function createEmployerSlot(employerId: string, driveId: string, input: SlotInput) {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  const emp = await Employer.findById(employerId);
  if (!emp) throw new HttpError(404, 'Employer not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive to manage slots', 'registration_not_approved');
  const drive = await Drive.findById(driveId);
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  const allowed = (drive.eventDates ?? []).map((d: Date) => new Date(d));
  if (!allowed.some((d) => sameUTCDay(d, input.date)))
    throw new HttpError(400, 'That date is not in the drive schedule', 'date_not_in_schedule');
  if (input.end <= input.start) throw new HttpError(400, 'End time must be after start time', 'validation');
  const clash = await Slot.findOne({ employerId, driveId, date: input.date, start: input.start, status: { $ne: 'Cancelled' } });
  if (clash) throw new HttpError(400, 'You already have a slot at that date and time', 'slot_exists');
  if (drive.slotCap > 0) {
    const own = await Slot.countDocuments({ employerId, driveId, status: { $ne: 'Cancelled' } });
    if (own >= drive.slotCap) throw new HttpError(400, 'You have reached the slot cap for this drive', 'slot_cap_reached');
  }
  const slot = await Slot.create({
    driveId: new Types.ObjectId(driveId), employerId: new Types.ObjectId(employerId),
    date: input.date, start: input.start, end: input.end, capacity: input.capacity,
    link: input.linkMode === 'own' ? (input.link ?? '') : '', status: 'Scheduled',
  });
  if (input.linkMode === 'auto') { slot.link = stubLink(slot._id); await slot.save(); }
  return slotProjection(slot.toObject(), 0);
}
```

- [ ] **Step 5: Add the controllers**

In `server/src/modules/employerPortal/employerPortal.controller.ts`, extend the service import and the schema import, then add the controllers:

```ts
// add to the './employerPortal.service.js' import list:
//   listEmployerSlots, createEmployerSlot
// add to the './employerPortal.schemas.js' import list:
//   createSlotSchema

export async function employerSlotsController(req: Request, res: Response) {
  res.json(await listEmployerSlots(req.userId as string, req.params.id));
}
export async function createEmployerSlotController(req: Request, res: Response) {
  const parsed = createSlotSchema.parse(req.body);
  res.status(201).json(await createEmployerSlot(req.userId as string, req.params.id, parsed));
}
```

- [ ] **Step 6: Add the routes**

In `server/src/modules/employerPortal/employerPortal.routes.ts`, extend the controller import and add (after the existing drive routes; `/:id/slots` is a distinct segment count from `/:id`, so order does not shadow):

```ts
employerPortalRoutes.get('/employer/drives/:id/slots', asyncHandler(employerSlotsController));
employerPortalRoutes.post('/employer/drives/:id/slots', asyncHandler(createEmployerSlotController));
```

- [ ] **Step 7: Run the test — verify it passes**

Run: `npm test -w server -- employer-slots`
Expected: PASS (all create + list cases green).

- [ ] **Step 8: Type-check + commit**

Run: `npx -w server tsc --noEmit` → clean.
```bash
git add server/src/modules/employerPortal server/test/employer-slots.route.test.ts
git commit -m "feat(server): employer slot create + list (approved-reg gated, employerId server-set)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server — slot reschedule (PATCH) + cancel (DELETE)

**Files:**
- Modify: `server/src/modules/employerPortal/employerPortal.schemas.ts` (already has `updateSlotSchema`/`SlotPatch` from Task 1 — no change if present)
- Modify: `server/src/modules/employerPortal/employerPortal.service.ts`
- Modify: `server/src/modules/employerPortal/employerPortal.controller.ts`
- Modify: `server/src/modules/employerPortal/employerPortal.routes.ts`
- Test: `server/test/employer-slots.route.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Task 1 (`slotProjection`, `sameUTCDay`, `derivedBooked`, `hasApprovedRegistration`, `Slot`, `SlotBooking`, `Drive`, `updateSlotSchema`/`SlotPatch`).
- Produces:
  - `updateEmployerSlot(employerId: string, driveId: string, slotId: string, patch: SlotPatch): Promise<EmployerSlotItem>`.
  - `deleteEmployerSlot(employerId: string, driveId: string, slotId: string): Promise<{ ok: true }>`.
  - Routes: `PATCH /api/me/employer/drives/:id/slots/:slotId`, `DELETE /api/me/employer/drives/:id/slots/:slotId`.

- [ ] **Step 1: Write the failing tests (append to `server/test/employer-slots.route.test.ts`)**

Add `import { SlotBooking } from '../src/models/SlotBooking.js';` at the top, then append:

```ts
async function makeSlot(app: ReturnType<typeof createApp>, emp: { _id: unknown }, d: { _id: unknown }, over: Record<string, unknown> = {}) {
  const res = await request(app).post(`/api/me/employer/drives/${d._id}/slots`).set('Authorization', `Bearer ${tokenFor(emp)}`).send(body(over));
  return res.body.id as string;
}

describe('PATCH /api/me/employer/drives/:id/slots/:slotId', () => {
  it('reschedules a slot in place', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const id = await makeSlot(app, emp, d);
    const res = await request(app).patch(`/api/me/employer/drives/${d._id}/slots/${id}`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ start: '14:00', end: '16:00' });
    expect(res.status).toBe(200);
    expect(res.body.start).toBe('14:00');
    expect(res.body.end).toBe('16:00');
  });

  it('returns 404 for another employer slot (no oracle)', async () => {
    const a = await employer({ email: 'a3@a.test' }); const b = await employer({ email: 'b2@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d);
    await RegistrationRequest.create({ company: 'Beta', industry: 'Tech', submittedBy: 'B', employerId: b._id, driveId: d._id, driveName: 'D', role: 'X', status: 'Approved', activity: [] });
    const app = createApp();
    const id = await makeSlot(app, a, d);
    const res = await request(app).patch(`/api/me/employer/drives/${d._id}/slots/${id}`)
      .set('Authorization', `Bearer ${tokenFor(b)}`).send({ start: '14:00', end: '16:00' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('rejects lowering capacity below existing bookings', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const id = await makeSlot(app, emp, d, { capacity: 8 });
    // seed two candidate bookings directly (the candidate flow is a later slice)
    await SlotBooking.create({ slotId: id, jobseekerId: emp._id, status: 'Booked' });
    await SlotBooking.create({ slotId: id, jobseekerId: d._id, status: 'Held' });
    const res = await request(app).patch(`/api/me/employer/drives/${d._id}/slots/${id}`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ capacity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });
});

describe('DELETE /api/me/employer/drives/:id/slots/:slotId', () => {
  it('removes a slot with no bookings', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const id = await makeSlot(app, emp, d);
    const res = await request(app).delete(`/api/me/employer/drives/${d._id}/slots/${id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(await Slot.countDocuments({ _id: id })).toBe(0);
  });

  it('refuses to remove a slot that has candidate bookings', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    const id = await makeSlot(app, emp, d);
    await SlotBooking.create({ slotId: id, jobseekerId: emp._id, status: 'Booked' });
    const res = await request(app).delete(`/api/me/employer/drives/${d._id}/slots/${id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('slot_has_bookings');
  });

  it('returns 404 for another employer slot on delete', async () => {
    const a = await employer({ email: 'a4@a.test' }); const b = await employer({ email: 'b3@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d);
    await RegistrationRequest.create({ company: 'Beta', industry: 'Tech', submittedBy: 'B', employerId: b._id, driveId: d._id, driveName: 'D', role: 'X', status: 'Approved', activity: [] });
    const app = createApp();
    const id = await makeSlot(app, a, d);
    const res = await request(app).delete(`/api/me/employer/drives/${d._id}/slots/${id}`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `npm test -w server -- employer-slots`
Expected: FAIL on the new PATCH/DELETE describes (routes 404 / not defined). The Task-1 cases still pass.

- [ ] **Step 3: Add `updateEmployerSlot` + `deleteEmployerSlot` to the service**

Append to `server/src/modules/employerPortal/employerPortal.service.ts` (and extend the schema-type import to include `SlotPatch`):

```ts
// import type { RegistrationInput, SlotInput, SlotPatch } from './employerPortal.schemas.js';

export async function updateEmployerSlot(employerId: string, driveId: string, slotId: string, patch: SlotPatch) {
  if (!Types.ObjectId.isValid(driveId) || !Types.ObjectId.isValid(slotId))
    throw new HttpError(404, 'Slot not found', 'not_found');
  const slot = await Slot.findOne({ _id: slotId, employerId, driveId });
  if (!slot) throw new HttpError(404, 'Slot not found', 'not_found'); // cross-employer isolation, no oracle
  if (slot.status === 'Cancelled') throw new HttpError(400, 'This slot has been cancelled', 'slot_cancelled');
  const drive = await Drive.findById(driveId);
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  const nextDate = patch.date ?? new Date(slot.date);
  const nextStart = patch.start ?? slot.start;
  const nextEnd = patch.end ?? slot.end;
  const allowed = (drive.eventDates ?? []).map((d: Date) => new Date(d));
  if (!allowed.some((d) => sameUTCDay(d, nextDate)))
    throw new HttpError(400, 'That date is not in the drive schedule', 'date_not_in_schedule');
  if (nextEnd <= nextStart) throw new HttpError(400, 'End time must be after start time', 'validation');
  if (patch.capacity !== undefined) {
    const seats = await SlotBooking.countDocuments({ slotId: slot._id });
    if (patch.capacity < seats) throw new HttpError(400, 'Capacity cannot be lower than existing bookings', 'validation');
  }
  if (patch.date !== undefined) slot.date = patch.date;
  if (patch.start !== undefined) slot.start = patch.start;
  if (patch.end !== undefined) slot.end = patch.end;
  if (patch.capacity !== undefined) slot.capacity = patch.capacity;
  if (patch.linkMode === 'own') slot.link = patch.link ?? '';
  else if (patch.linkMode === 'auto') slot.link = stubLink(slot._id);
  await slot.save();
  return slotProjection(slot.toObject(), await derivedBooked(slot._id));
}

export async function deleteEmployerSlot(employerId: string, driveId: string, slotId: string) {
  if (!Types.ObjectId.isValid(driveId) || !Types.ObjectId.isValid(slotId))
    throw new HttpError(404, 'Slot not found', 'not_found');
  const slot = await Slot.findOne({ _id: slotId, employerId, driveId });
  if (!slot) throw new HttpError(404, 'Slot not found', 'not_found');
  const bookings = await SlotBooking.countDocuments({ slotId: slot._id });
  if (bookings > 0) throw new HttpError(400, 'This slot has candidate bookings and cannot be removed', 'slot_has_bookings');
  await slot.deleteOne();
  return { ok: true as const };
}
```

- [ ] **Step 4: Add the controllers**

In `server/src/modules/employerPortal/employerPortal.controller.ts` (extend the service import with `updateEmployerSlot, deleteEmployerSlot` and the schema import with `updateSlotSchema`):

```ts
export async function updateEmployerSlotController(req: Request, res: Response) {
  const parsed = updateSlotSchema.parse(req.body);
  res.json(await updateEmployerSlot(req.userId as string, req.params.id, req.params.slotId, parsed));
}
export async function deleteEmployerSlotController(req: Request, res: Response) {
  res.json(await deleteEmployerSlot(req.userId as string, req.params.id, req.params.slotId));
}
```

- [ ] **Step 5: Add the routes**

In `server/src/modules/employerPortal/employerPortal.routes.ts` (extend the controller import), add:

```ts
employerPortalRoutes.patch('/employer/drives/:id/slots/:slotId', asyncHandler(updateEmployerSlotController));
employerPortalRoutes.delete('/employer/drives/:id/slots/:slotId', asyncHandler(deleteEmployerSlotController));
```

- [ ] **Step 6: Run tests + full server suite + type-check**

Run: `npm test -w server -- employer-slots` → PASS.
Run: `npm test -w server` → all green (admin slots + candidate slotBookings + registrations untouched).
Run: `npx -w server tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/employerPortal server/test/employer-slots.route.test.ts
git commit -m "feat(server): employer slot reschedule + cancel (ownership 404, booking guards)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Client — types + hooks + `EmployerSlots` page + route + CTA rewire

**Files:**
- Modify: `client/src/types/employer.ts`
- Create: `client/src/pages/EmployerPortal/hooks/useEmployerSlots.ts`
- Create: `client/src/pages/EmployerPortal/EmployerSlots.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/EmployerPortal/EmployerDriveDetail.tsx`
- Test: `client/src/test/EmployerSlots.test.tsx` (create), `client/src/test/EmployerDriveDetail.test.tsx` (update the CTA test)

**Interfaces:**
- Consumes: the Task 1/2 endpoints (`GET/POST /me/employer/drives/:id/slots`, `PATCH/DELETE .../:slotId`); `apiFetch` (`{ method, body, token }`); `useAuth().token`; `useEmployerDrive(id)` (`hooks/useEmployerDrives.ts`, gives `name` + `eventDates`); `useEmployerRegistrations()` (`hooks/useEmployerRegistrations.ts`, gives `items:[{ driveId, status }]`).
- Produces: `EmployerSlot`, `SlotInput` types; `useEmployerSlots(driveId)`, `useSlotMutations(driveId)`; the `EmployerSlots` page + its route; a gated "View slots" CTA.

- [ ] **Step 1: Add the types**

Append to `client/src/types/employer.ts`:

```ts
// Mirrors server/src/modules/employerPortal/employerPortal.service.ts EmployerSlotItem (Slice 4).
export interface EmployerSlot {
  id: string;
  date: string; // ISO
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  capacity: number;
  booked: number; // derived (0 until the candidate-booking slice)
  status: string;
  link: string;
}
export interface EmployerSlotsResponse { items: EmployerSlot[]; }

// Mirrors createSlotSchema/updateSlotSchema (Slice 4). driveId comes from the route,
// employerId from the JWT — neither is part of the body.
export interface SlotInput {
  date: string; // ISO date string (one of the drive's eventDates)
  start: string;
  end: string;
  capacity: number;
  linkMode: 'auto' | 'own';
  link?: string;
}
```

- [ ] **Step 2: Add the hooks**

Create `client/src/pages/EmployerPortal/hooks/useEmployerSlots.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerSlot, EmployerSlotsResponse, SlotInput } from '../../../types/employer.js';

// GET /api/me/employer/drives/:id/slots — the employer's own slots for the drive.
export function useEmployerSlots(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-slots', driveId],
    queryFn: () => apiFetch<EmployerSlotsResponse>(`/me/employer/drives/${driveId}/slots`, { token }),
    enabled: !!token && !!driveId,
  });
}

// create/update/delete. Each invalidates the drive's slot list AND the employer-portal
// aggregate (the dashboard calendar/KPIs read Slot). Mirrors useBookingMutations' fan-out.
export function useSlotMutations(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['employer-slots', driveId] });
    qc.invalidateQueries({ queryKey: ['employer-portal'] });
  };
  const create = useMutation({
    mutationFn: (input: SlotInput) => apiFetch<EmployerSlot>(`/me/employer/drives/${driveId}/slots`, { method: 'POST', body: input, token }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ slotId, patch }: { slotId: string; patch: Partial<SlotInput> }) =>
      apiFetch<EmployerSlot>(`/me/employer/drives/${driveId}/slots/${slotId}`, { method: 'PATCH', body: patch, token }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (slotId: string) => apiFetch<{ ok: true }>(`/me/employer/drives/${driveId}/slots/${slotId}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
```

- [ ] **Step 3: Write the failing page test**

Create `client/src/test/EmployerSlots.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerSlots } from '../pages/EmployerPortal/EmployerSlots.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: 'e1', name: 'Acme Corp', email: 'e@c.com', role: 'employer' },
  }));
}

const DRIVE = {
  id: 'd1', name: 'Data Analyst MatchDay', domain: 'Data / ML', stream: 'B.Tech', month: 'Aug 2026',
  primaryEventDate: '2026-08-05T00:00:00.000Z', eventDates: ['2026-08-05T00:00:00.000Z', '2026-08-12T00:00:00.000Z'],
  candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday', status: 'Active',
  employerReg: 'Open', canRegister: true,
  eligibility: { sources: [], branches: [], gradYears: [], expType: '' }, evaluation: [], streamId: null,
};
const SLOT = { id: 's1', date: '2026-08-05T00:00:00.000Z', start: '10:00', end: '12:00', capacity: 8, booked: 0, status: 'Scheduled', link: 'https://meet.hiringhood.test/s1' };

// Routes GET drive / GET slots / POST slot / DELETE slot by URL+method. `slots` starts with
// whatever the test seeds; POST appends; DELETE empties.
function mockFetch(initialSlots: unknown[]) {
  let slots = [...initialSlots];
  const post = vi.fn();
  const del = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.includes('/drives/d1/slots') && method === 'POST') {
      post(JSON.parse(opts.body as string));
      const created = { ...SLOT, id: 's2', start: '14:00', end: '16:00' };
      slots = [...slots, created];
      return { ok: true, status: 201, json: async () => created };
    }
    if (url.match(/\/drives\/d1\/slots\/[^/]+$/) && method === 'DELETE') {
      del(url); slots = [];
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (url.includes('/drives/d1/slots')) return { ok: true, status: 200, json: async () => ({ items: slots }) };
    if (url.includes('/drives/d1')) return { ok: true, status: 200, json: async () => DRIVE };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'nope', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { post, del };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/slots']}>
        <AuthProvider>
          <Routes><Route path="/employer/drives/:id/slots" element={<EmployerSlots />} /></Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerSlots', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders the drive name and existing slots', async () => {
    seedAuth(); mockFetch([SLOT]); renderPage();
    await waitFor(() => expect(screen.getByText(/Data Analyst MatchDay/)).toBeInTheDocument());
    expect(screen.getByText('10:00 – 12:00')).toBeInTheDocument();
  });

  it('the date select is limited to the drive event dates', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Date/i)).toBeInTheDocument());
    const select = screen.getByLabelText(/Date/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(values).toEqual(['2026-08-05T00:00:00.000Z', '2026-08-12T00:00:00.000Z']);
  });

  it('blocks submit and shows an error when the date is empty', async () => {
    seedAuth(); const { post } = mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Add slot/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add slot/i }));
    const field = screen.getByLabelText(/Date/i).closest('.field') as HTMLElement;
    await waitFor(() => expect(field).toHaveClass('show-err'));
    expect(post).not.toHaveBeenCalled();
  });

  it('submits a valid slot with the expected body', async () => {
    seedAuth(); const { post } = mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Date/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-08-05T00:00:00.000Z' } });
    fireEvent.change(screen.getByLabelText(/Start/i), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText(/End/i), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText(/Capacity/i), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /Add slot/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toMatchObject({ date: '2026-08-05T00:00:00.000Z', start: '14:00', end: '16:00', capacity: 8, linkMode: 'auto' });
  });

  it('cancels (deletes) a slot', async () => {
    seedAuth(); const { del } = mockFetch([SLOT]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByText('10:00 – 12:00')).toBeInTheDocument());
    const row = screen.getByText('10:00 – 12:00').closest('.slot-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Cancel/i }));
    await waitFor(() => expect(del).toHaveBeenCalled());
  });
});
```

- [ ] **Step 4: Run the page test — verify it fails**

Run: `npm test -w client -- EmployerSlots`
Expected: FAIL (`EmployerSlots` not found / import error).

- [ ] **Step 5: Build the `EmployerSlots` page**

Create `client/src/pages/EmployerPortal/EmployerSlots.tsx`. Renders inside `EmployerShell` (route-wrapped) — NO `.employer-app` wrap; uses `.page-wrap` (same convention as `EmployerDriveDetail`). Field errors toggle `.show-err`. The single form doubles as create/edit (Reschedule pre-fills it + switches to `update`).

```tsx
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import { useEmployerSlots, useSlotMutations } from './hooks/useEmployerSlots.js';
import type { EmployerSlot } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

interface FormState { editingId: string | null; date: string; start: string; end: string; capacity: string; linkMode: 'auto' | 'own'; link: string; }
const EMPTY: FormState = { editingId: null, date: '', start: '', end: '', capacity: '8', linkMode: 'auto', link: '' };

export function EmployerSlots() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const drive = useEmployerDrive(driveId);
  const slots = useEmployerSlots(driveId);
  const { create, update, remove } = useSlotMutations(driveId);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<string>('');

  const eventDates = drive.data?.eventDates ?? [];
  const items = slots.data?.items ?? [];
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const nextErrors = useMemo(() => () => {
    const e: Record<string, boolean> = {};
    if (!form.date) e.date = true;
    if (!form.start) e.start = true;
    if (!form.end) e.end = true;
    if (form.start && form.end && form.end <= form.start) e.end = true;
    const cap = Number(form.capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 50) e.capacity = true;
    if (form.linkMode === 'own' && !form.link.trim()) e.link = true;
    return e;
  }, [form]);

  function submit() {
    setSubmitError('');
    const e = nextErrors();
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload = { date: form.date, start: form.start, end: form.end, capacity: Number(form.capacity), linkMode: form.linkMode, link: form.linkMode === 'own' ? form.link.trim() : undefined };
    const onDone = () => { setForm(EMPTY); setErrors({}); };
    const onErr = (err: unknown) => setSubmitError(errMsg(err));
    if (form.editingId) update.mutate({ slotId: form.editingId, patch: payload }, { onSuccess: onDone, onError: onErr });
    else create.mutate(payload, { onSuccess: onDone, onError: onErr });
  }

  function startEdit(s: EmployerSlot) {
    setForm({ editingId: s.id, date: s.date, start: s.start, end: s.end, capacity: String(s.capacity), linkMode: s.link ? 'own' : 'auto', link: s.link });
    setErrors({}); setSubmitError('');
  }
  function cancelSlot(s: EmployerSlot) {
    if (!window.confirm('Cancel this interview slot?')) return;
    remove.mutate(s.id, { onError: (err) => setSubmitError(errMsg(err)) });
  }
  const fieldCls = (k: string) => `field${errors[k] ? ' show-err' : ''}`;
  const saving = create.isPending || update.isPending;

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to drive
      </button>
      <div className="card slot-ctx">
        <h2>Interview slots — {drive.data?.name ?? '…'}</h2>
        <p className="hint">Create the interview windows your panel will run for this drive. Dates follow the drive schedule.</p>
      </div>

      <div className="slot-layout">
        <div className="card">
          <div className="card-head"><h3>{form.editingId ? 'Reschedule slot' : 'Add a slot'}</h3></div>
          <div className="card-body" style={{ display: 'grid', gap: 12 }}>
            <div className={fieldCls('date')}>
              <label htmlFor="slot-date">Date</label>
              <select id="slot-date" className={`select${errors.date ? ' err' : ''}`} value={form.date} onChange={(e) => set('date', e.target.value)}>
                <option value="">Select a date…</option>
                {eventDates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
              </select>
              <div className="err-msg">Pick a date from the drive schedule.</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className={fieldCls('start')} style={{ flex: 1 }}>
                <label htmlFor="slot-start">Start</label>
                <input id="slot-start" type="time" className={`input${errors.start ? ' err' : ''}`} value={form.start} onChange={(e) => set('start', e.target.value)} />
                <div className="err-msg">Required.</div>
              </div>
              <div className={fieldCls('end')} style={{ flex: 1 }}>
                <label htmlFor="slot-end">End</label>
                <input id="slot-end" type="time" className={`input${errors.end ? ' err' : ''}`} value={form.end} onChange={(e) => set('end', e.target.value)} />
                <div className="err-msg">End must be after start.</div>
              </div>
            </div>
            <div className={fieldCls('capacity')}>
              <label htmlFor="slot-cap">Capacity</label>
              <input id="slot-cap" type="number" min={1} max={50} className={`input${errors.capacity ? ' err' : ''}`} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
              <div className="err-msg">Enter 1–50.</div>
            </div>
            <div className={fieldCls('link')}>
              <label>Meeting link</label>
              <div className="link-opt-group" style={{ display: 'grid', gap: 8 }}>
                <label className={`link-opt${form.linkMode === 'auto' ? ' on' : ''}`}>
                  <input type="radio" name="linkMode" checked={form.linkMode === 'auto'} onChange={() => set('linkMode', 'auto')} />
                  Generate a Hiringhood link
                </label>
                <label className={`link-opt${form.linkMode === 'own' ? ' on' : ''}`}>
                  <input type="radio" name="linkMode" checked={form.linkMode === 'own'} onChange={() => set('linkMode', 'own')} />
                  Use my own link
                </label>
                {form.linkMode === 'own' && (
                  <input type="url" className={`input${errors.link ? ' err' : ''}`} placeholder="https://…" value={form.link} onChange={(e) => set('link', e.target.value)} />
                )}
              </div>
              <div className="err-msg">A meeting link is required.</div>
            </div>
            {submitError && <div className="otp-err">{submitError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
                {form.editingId ? 'Save changes' : 'Add slot'}
              </button>
              {form.editingId && <button type="button" className="btn btn-ghost" onClick={() => { setForm(EMPTY); setErrors({}); }}>Cancel edit</button>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Scheduled slots</h3></div>
          <div className="card-body">
            {slots.isLoading ? <p className="hint">Loading slots…</p>
              : slots.isError ? <p className="hint">{errMsg(slots.error)}</p>
              : items.length === 0 ? <p className="hint">No slots yet — add your first interview window.</p>
              : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {items.map((s) => (
                    <div className="slot-row" key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div>
                        <div className="fv">{s.start} – {s.end}</div>
                        <div className="fl">{fmtDate(s.date)} · {s.capacity - s.booked} of {s.capacity} seats left</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(s)}>Reschedule</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancelSlot(s)}>Cancel</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Note: reuse existing employer.css classes (`.slot-ctx`, `.slot-layout`, `.link-opt`, `.card`, `.field`, `.input`, `.select`, `.err-msg`, `.otp-err`, `.hint`, `.fv`, `.fl`, `.btn*`) — all already present. If `.btn-sm` is absent, drop the class (cosmetic). `.otp-err` has no `display:none` gate (safe for the submit-error line, unlike `.err-msg`).

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- EmployerSlots`
Expected: PASS.

- [ ] **Step 7: Add the route + rewire the CTA**

In `client/src/App.tsx`, add the import and the route (after the register route):
```tsx
import { EmployerSlots } from './pages/EmployerPortal/EmployerSlots.js';
// ...
<Route path="/employer/drives/:id/slots" element={<RoleRoute role="employer"><EmployerShell><EmployerSlots /></EmployerShell></RoleRoute>} />
```

In `client/src/pages/EmployerPortal/EmployerDriveDetail.tsx`, add the registrations hook and gate the CTA. Add the import:
```tsx
import { useEmployerRegistrations } from './hooks/useEmployerRegistrations.js';
```
Inside the component (near the existing `useEmployerDrive` call):
```tsx
const { data: regsData } = useEmployerRegistrations();
const approvedForDrive = (regsData?.items ?? []).some((r) => r.driveId === id && r.status === 'Approved');
```
Replace the current "View slots" button (lines ~186-188) with:
```tsx
<button
  type="button"
  className="btn btn-ghost"
  disabled={!approvedForDrive}
  title={approvedForDrive ? undefined : 'Available once your registration is approved'}
  onClick={() => navigate(`/employer/drives/${id}/slots`)}
>
  View slots
</button>
```

- [ ] **Step 8: Update the drive-detail CTA test**

In `client/src/test/EmployerDriveDetail.test.tsx`: the detail page now also fetches `/me/employer/registrations`. Update the fetch mock to return `{ items: [...] }` for that URL, and add/adjust assertions:
- With NO approved registration for the drive → the "View slots" button is `disabled` (`expect(screen.getByRole('button', { name: /View slots/i })).toBeDisabled()`).
- With an approved registration (`items:[{ driveId: <the drive id>, status: 'Approved', ... }]`) → the button is enabled and clicking it navigates to `/employer/drives/:id/slots` (assert via the existing navigation-assertion pattern in that file).
Keep every existing assertion in the file green (register CTA etc.).

- [ ] **Step 9: Full client suite + type-check + commit**

Run: `npm test -w client -- EmployerSlots` → PASS.
Run: `npm test -w client` → all green (registrations/marketplace/detail/signup still pass).
Run: `npx -w client tsc --noEmit` → clean.
```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal client/src/App.tsx client/src/test/EmployerSlots.test.tsx client/src/test/EmployerDriveDetail.test.tsx
git commit -m "feat(client): employer slot management page + gated View-slots CTA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites**

Run: `npm test -w server` → all green (≈ prior count + the new employer-slots cases).
Run: `npm test -w client` → all green.

- [ ] **Step 2: Type-check + build**

Run: `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build` → all clean/succeed.

- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer4_smoke`)**

Confirm the server's Mongo env var (read `server/src`), then seed + run the server against a `matchday_employer4_smoke` DB URI (isolated port if needed). Using an employer demo token and an admin token:
- Employer logs in; create a per-drive registration (`POST /api/me/employer/registrations`) for an Active drive that has `eventDates`.
- Admin approves it (`POST /api/registrations/:id/action {action:'approve'}`).
- `POST /api/me/employer/drives/:driveId/slots` with a `date` equal to one of the drive's `eventDates` → **201**, response `employerId`-owned, `link` a `meet.hiringhood.test` stub for `linkMode:'auto'`.
- The slot appears in `GET /api/me/employer/drives/:driveId/slots` AND in `GET /api/me/employer` (`dashboard.kpis.totalSlots >= 1`, `dashboard.calendar` includes it if future-dated).
- A `date` NOT in `eventDates` → **400 date_not_in_schedule**; a duplicate date+start → **400 slot_exists**.
- A second employer (also approved for the drive) → `GET` returns **0** of the first employer's slots.
- `PATCH` reschedule → **200**; `DELETE` → **200 {ok:true}**; a foreign `slotId` on PATCH/DELETE → **404**.
- Admin token → **403** on the employer slot routes.

- [ ] **Step 4: Teardown**

Stop the server; drop `matchday_employer4_smoke`; confirm the shared `matchday` DB was never connected to for writes and remains intact. No commit.

---

## Notes for the executor

- The E2E's candidate-booking guards (`slot_has_bookings`, capacity-below-bookings) are exercised in the Task-2 unit tests by seeding `SlotBooking` docs directly (the candidate flow itself is a later slice); the live smoke need not reproduce them.
- Known stubs (from the spec): the `auto` meeting link is a fake URL; `booked` derives to 0 until the candidate-booking slice; `Slot.status:'Cancelled'` is unused by the employer flow (DELETE hard-removes).
