# Drives Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full, faithful Drives module — a filter/sort/paginate drive list with bulk actions, a 6-step create/edit wizard, and publish/archive/clone — on top of the existing MatchDay MERN app.

**Architecture:** Expand the `Drive` Mongoose model to hold the whole wizard payload; add a `/api/drives` module (list/create/get/patch/clone/bulk) built on an aggregation-based list service; migrate the Command Center dashboard from a single `eventDate` to `eventDates[]`; add a `/drives` React page (list + full-screen 6-step wizard) reusing the existing app shell, auth, and TanStack Query setup.

**Tech Stack:** Same as the Command Center slice — Express + TypeScript + Mongoose + zod (server); React 18 + Vite + react-router-dom + @tanstack/react-query (client); Vitest + supertest + mongodb-memory-server (server tests); Vitest + React Testing Library (client tests).

## Global Constraints

- **Language:** TypeScript everywhere, `"strict": true`. ESM — relative imports use `.js` extensions even in `.ts`/`.tsx` files.
- **Spec is authoritative:** `docs/superpowers/specs/2026-07-14-drives-module-design.md`.
- **Error shape:** every server error response is `{ error: { message, code } }` (via the existing `errorHandler`/`HttpError`).
- **Auth:** all `/api/drives/*` routes are behind the existing `requireAuth` middleware. `createdBy` = the authenticated user's name (from `req.userId`/lookup) — for this slice use the literal `"Platform Admin"` (single-admin app; the seeded admin's name).
- **Type-check gate:** after each server or client change, `npx tsc --noEmit -p server/tsconfig.json` (and/or `client/tsconfig.json`) must report ZERO errors — Vitest does NOT type-check.
- **Determinism:** the aggregation service takes an injectable `now?: Date` (default `new Date()`); no `Math.random()`; the seed keeps its fixed PRNG.
- **Status model:** `Draft → Published → Active`; any → `Archived`. Wizard "Publish" → `Published`; "Save draft & exit" → `Draft`. The dashboard "Active Drives" KPI counts `status:'Active'`.
- **Faithful UI port:** React components use the prototype's REAL class names (from `matchday-admin-app_23.html`) so the ported `theme.css` styles them. Where a class is `#auth-screen`-scoped or absent, use the prototype's real class.
- **Commit trailer:** end every commit body with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
server/src/
  models/Drive.ts                          # expanded (Task 1); legacy eventDate removed (Task 4)
  modules/drives/
    drives.schemas.ts                      # zod (Task 2)
    drives.service.ts                       # list/create/get/update/clone/bulk (Task 2)
    drives.controller.ts                    # (Task 3)
    drives.routes.ts                        # (Task 3)
  modules/dashboard/dashboard.service.ts   # migrated to eventDates[] (Task 4)
  seed/seed.ts                             # expanded drive fields + eventDates[] (Task 4)
  app.ts                                   # mount /api/drives (Task 3)
server/test/
  drives.service.test.ts                   # (Task 2)
  drives.route.test.ts                     # (Task 3)
  dashboard.service.test.ts                # updated (Task 4)
client/src/
  types/drives.ts                          # Drive + wizard-model + list DTO types (Task 5)
  pages/Drives/
    index.tsx  DrivesToolbar.tsx  DrivesTable.tsx  BulkBar.tsx   # (Task 5)
    hooks/useDrives.ts  hooks/useDriveMutations.ts               # (Task 5)
    wizard/DriveWizard.tsx                                        # shell (Task 6)
    wizard/StepBasics.tsx StepSchedule.tsx StepEligibility.tsx
           StepEvaluation.tsx StepVisibility.tsx StepReview.tsx   # (Task 7)
    wizard/validation.ts                                          # per-step validators (Task 6)
  App.tsx                                  # add /drives route (Task 5)
  components/Sidebar.tsx                   # Drives NavLink → /drives (Task 5)
client/src/test/
  DrivesTable.test.tsx                     # (Task 5)
  DriveWizard.test.tsx                     # (Task 7)
```

---

## Task 1: Expand the Drive schema (additive)

**Files:**
- Modify: `server/src/models/Drive.ts`
- Test: `server/test/models.test.ts` (add a Drive test; keep existing)

**Interfaces:**
- Produces: expanded `Drive` model + `DriveDoc` type. New fields per spec §3. **Keep the legacy `eventDate` field but make it OPTIONAL** (not `required`) so nothing downstream breaks yet; it is removed in Task 4. Add `eventDates: [Date]`. Switch to `{ timestamps: true }` (adds `createdAt`+`updatedAt`) while KEEPING the explicit `createdAt` default is unnecessary — `timestamps` supplies both; but the current seed/dashboard read `createdAt`, which `timestamps` still provides.

- [ ] **Step 1: Rewrite `server/src/models/Drive.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const evaluationStageSchema = new Schema({
  key: { type: String, enum: ['mcq', 'coding', 'tara', 'assignments'], required: true },
  enabled: { type: Boolean, default: false },
  config: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const driveSchema = new Schema({
  name: { type: String, required: true },
  domain: { type: String, required: true },
  stream: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Published', 'Draft', 'Archived'], default: 'Draft' },
  candType: { type: String, enum: ['Freshers', 'Experienced', 'Both'], default: 'Freshers' },
  mode: { type: String, enum: ['Online', 'Onsite', 'Hybrid'], default: 'Hybrid' },
  frequency: { type: String, enum: ['Weekly', 'Bi-weekly', 'Monthly', 'One-time'], default: 'One-time' },
  eventDay: { type: String, enum: ['Wednesday', 'Saturday'], default: 'Wednesday' },
  eventDate: { type: Date },                 // legacy, removed in Task 4
  eventDates: { type: [Date], default: [] },
  candCap: { type: Number, default: 0 },
  empCap: { type: Number, default: 0 },
  slotCap: { type: Number, default: 0 },
  eligibility: {
    sources: { type: [String], default: [] },
    branches: { type: [String], default: [] },
    gradYears: { type: [Number], default: [] },
    expType: { type: String, default: 'Freshers only' },
  },
  evaluation: { type: [evaluationStageSchema], default: [] },
  visibility: {
    employerReg: { type: String, enum: ['Open', 'Invite-only', 'Closed'], default: 'Invite-only' },
    instituteVis: { type: String, enum: ['All institutes', 'Selected institutes', 'Private link'], default: 'Selected institutes' },
    candidateAccess: { type: String, enum: ['Public', 'Eligible only', 'Invite'], default: 'Eligible only' },
  },
  createdBy: { type: String, default: 'Platform Admin' },
}, { timestamps: true });

export type DriveDoc = InferSchemaType<typeof driveSchema>;
export const Drive = model('Drive', driveSchema);
```

- [ ] **Step 2: Add a Drive model test to `server/test/models.test.ts`**

Append inside the existing `describe('models', ...)`:

```ts
  it('persists an expanded drive with nested eligibility, evaluation, visibility', async () => {
    const d = await Drive.create({
      name: 'FE Cohort', domain: 'Frontend', stream: 'B.Tech', status: 'Draft',
      candType: 'Freshers', mode: 'Hybrid', frequency: 'One-time', eventDay: 'Wednesday',
      eventDates: [new Date('2026-07-15T04:30:00.000Z')],
      candCap: 500, empCap: 9, slotCap: 360,
      eligibility: { sources: ['Institutes'], branches: ['CSE', 'IT'], gradYears: [2026], expType: 'Freshers only' },
      evaluation: [{ key: 'mcq', enabled: true, config: { questions: 30, durationMin: 30 } }],
      visibility: { employerReg: 'Invite-only', instituteVis: 'Selected institutes', candidateAccess: 'Eligible only' },
      createdBy: 'Platform Admin',
    });
    expect(d.eventDates).toHaveLength(1);
    expect(d.eligibility.branches).toEqual(['CSE', 'IT']);
    expect(d.evaluation[0].key).toBe('mcq');
    expect(d.visibility.employerReg).toBe('Invite-only');
  });

  it('rejects an invalid drive mode', async () => {
    await expect(
      Drive.create({ name: 'X', domain: 'Frontend', stream: 'B.Tech', mode: 'Telepathic' as never }),
    ).rejects.toThrow();
  });
```
The existing `import { Drive }` may be absent in models.test.ts — add `import { Drive } from '../src/models/Drive.js';` at the top if needed.

- [ ] **Step 3: Type-check + run tests**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0 errors.
Run: `npm run test -w server` → all pass (existing 14 + 2 new).

- [ ] **Step 4: Commit**

```bash
git add server/src/models/Drive.ts server/test/models.test.ts
git commit -m "feat(server): expand Drive schema with wizard fields and eventDates[]"
```

---

## Task 2: Drives zod schemas + service

**Files:**
- Create: `server/src/modules/drives/drives.schemas.ts`, `server/src/modules/drives/drives.service.ts`
- Test: `server/test/drives.service.test.ts`

**Interfaces:**
- Consumes: `Drive` model.
- Produces:
  - `drives.schemas.ts`: `createDriveSchema` (zod) enforcing spec §8 rules; `updateDriveSchema = createDriveSchema.partial().extend({ status: ... .optional() })`; exported `DriveInput` type; `listQuerySchema` for the list params.
  - `drives.service.ts`:
    - `listDrives(params: ListParams, now?: Date): Promise<{ items: DriveListItem[]; total: number; page: number; limit: number }>`
    - `createDrive(input: DriveInput, createdBy: string): Promise<DriveDoc>`
    - `getDrive(id: string): Promise<DriveDoc>` (throws `HttpError(404,...)` if missing)
    - `updateDrive(id: string, patch: Partial<DriveInput> & { status?: string }): Promise<DriveDoc>` (404 if missing)
    - `cloneDrive(id: string): Promise<DriveDoc>`
    - `bulkAction(ids: string[], action: 'publish'|'clone'|'archive'): Promise<{ affected: number }>`
    - types `ListParams` and `DriveListItem` (exported).

- [ ] **Step 1: Create `server/src/modules/drives/drives.schemas.ts`**

```ts
import { z } from 'zod';

const evalStage = z.object({
  key: z.enum(['mcq', 'coding', 'tara', 'assignments']),
  enabled: z.boolean(),
  config: z.record(z.number()).default({}),
});

export const createDriveSchema = z.object({
  name: z.string().trim().min(1),
  domain: z.string().min(1),
  stream: z.string().min(1),
  status: z.enum(['Active', 'Published', 'Draft', 'Archived']).default('Draft'),
  candType: z.enum(['Freshers', 'Experienced', 'Both']),
  mode: z.enum(['Online', 'Onsite', 'Hybrid']),
  frequency: z.enum(['Weekly', 'Bi-weekly', 'Monthly', 'One-time']),
  eventDay: z.enum(['Wednesday', 'Saturday']),
  eventDates: z.array(z.coerce.date()).min(1),
  candCap: z.number().int().min(0),
  empCap: z.number().int().min(0),
  slotCap: z.number().int().min(0),
  eligibility: z.object({
    sources: z.array(z.string()).min(1),
    branches: z.array(z.string()).min(1),
    gradYears: z.array(z.number().int()),
    expType: z.string(),
  }),
  evaluation: z.array(evalStage).refine((a) => a.some((s) => s.enabled), {
    message: 'Enable at least one evaluation stage',
  }),
  visibility: z.object({
    employerReg: z.enum(['Open', 'Invite-only', 'Closed']),
    instituteVis: z.enum(['All institutes', 'Selected institutes', 'Private link']),
    candidateAccess: z.enum(['Public', 'Eligible only', 'Invite']),
  }),
});

export const updateDriveSchema = createDriveSchema.partial();

export const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  stream: z.string().optional(),
  domain: z.string().optional(),
  sort: z.enum(['name', 'domain', 'stream', 'month', 'candCap', 'empCap', 'slotCap', 'status']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
});

export type DriveInput = z.infer<typeof createDriveSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
```

- [ ] **Step 2: Write the failing test `server/test/drives.service.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Drive } from '../src/models/Drive.js';
import {
  listDrives, createDrive, getDrive, updateDrive, cloneDrive, bulkAction,
} from '../src/modules/drives/drives.service.js';

const NOW = new Date('2026-07-12T00:00:00.000Z');

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const baseInput = () => ({
  name: 'Frontend Cohort', domain: 'Frontend', stream: 'B.Tech', status: 'Draft' as const,
  candType: 'Freshers' as const, mode: 'Hybrid' as const, frequency: 'One-time' as const,
  eventDay: 'Wednesday' as const, eventDates: [new Date('2026-07-15T04:30:00.000Z')],
  candCap: 500, empCap: 9, slotCap: 360,
  eligibility: { sources: ['Institutes'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
  evaluation: [{ key: 'mcq' as const, enabled: true, config: { questions: 30 } }],
  visibility: { employerReg: 'Invite-only' as const, instituteVis: 'Selected institutes' as const, candidateAccess: 'Eligible only' as const },
});

async function seedThree() {
  await createDrive({ ...baseInput(), name: 'Alpha Frontend', domain: 'Frontend', stream: 'B.Tech', status: 'Published' }, 'Admin');
  await createDrive({ ...baseInput(), name: 'Beta Backend', domain: 'Backend', stream: 'M.Tech', status: 'Draft', eventDates: [new Date('2026-08-19T04:30:00.000Z')] }, 'Admin');
  await createDrive({ ...baseInput(), name: 'Gamma Data', domain: 'Data / ML', stream: 'MCA', status: 'Active' }, 'Admin');
}

describe('drives.service', () => {
  it('creates a drive persisting the full payload with createdBy', async () => {
    const d = await createDrive(baseInput(), 'Platform Admin');
    expect(d.createdBy).toBe('Platform Admin');
    expect(d.eventDates).toHaveLength(1);
    expect(d.eligibility.branches).toEqual(['CSE']);
  });

  it('lists with pagination metadata', async () => {
    await seedThree();
    const res = await listDrives({ page: 1, limit: 2 }, NOW);
    expect(res.total).toBe(3);
    expect(res.items).toHaveLength(2);
    expect(res.page).toBe(1);
    expect(res.limit).toBe(2);
  });

  it('filters by status, domain, and search q', async () => {
    await seedThree();
    expect((await listDrives({ status: 'Draft' }, NOW)).total).toBe(1);
    expect((await listDrives({ domain: 'Backend' }, NOW)).total).toBe(1);
    expect((await listDrives({ q: 'front' }, NOW)).total).toBe(1); // case-insensitive on name/domain/stream
  });

  it('filters by month (YYYY-MM) using event dates', async () => {
    await seedThree();
    expect((await listDrives({ month: '2026-08' }, NOW)).total).toBe(1); // only Beta (Aug)
    expect((await listDrives({ month: '2026-07' }, NOW)).total).toBe(2); // Alpha + Gamma (Jul)
  });

  it('sorts by name ascending', async () => {
    await seedThree();
    const res = await listDrives({ sort: 'name', order: 'asc' }, NOW);
    expect(res.items.map((d) => d.name)).toEqual(['Alpha Frontend', 'Beta Backend', 'Gamma Data']);
  });

  it('returns a month display label derived from the primary event date', async () => {
    await createDrive(baseInput(), 'Admin');
    const res = await listDrives({}, NOW);
    expect(res.items[0].month).toBe('Jul 2026');
  });

  it('gets, updates status, and 404s on missing', async () => {
    const d = await createDrive(baseInput(), 'Admin');
    const got = await getDrive(String(d._id));
    expect(got.name).toBe('Frontend Cohort');
    const upd = await updateDrive(String(d._id), { status: 'Published' });
    expect(upd.status).toBe('Published');
    await expect(getDrive('64b000000000000000000000')).rejects.toThrow();
  });

  it('clones a drive as a new Draft named "(copy)"', async () => {
    const d = await createDrive({ ...baseInput(), status: 'Published' }, 'Admin');
    const c = await cloneDrive(String(d._id));
    expect(c.status).toBe('Draft');
    expect(c.name).toBe('Frontend Cohort (copy)');
    expect(String(c._id)).not.toBe(String(d._id));
    expect(await Drive.countDocuments({})).toBe(2);
  });

  it('bulk-archives selected drives', async () => {
    await seedThree();
    const ids = (await Drive.find({}).select('_id')).map((d) => String(d._id));
    const res = await bulkAction(ids, 'archive');
    expect(res.affected).toBe(3);
    expect(await Drive.countDocuments({ status: 'Archived' })).toBe(3);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm run test -w server -- drives.service`
Expected: FAIL — `drives.service` module not found.

- [ ] **Step 4: Implement `server/src/modules/drives/drives.service.ts`**

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import type { DriveInput, ListQuery } from './drives.schemas.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type ListParams = Partial<ListQuery>;
export interface DriveListItem {
  id: string; name: string; domain: string; stream: string;
  month: string; frequency: string; eventDay: string;
  candCap: number; empCap: number; slotCap: number;
  status: string; createdBy: string; primaryEventDate: string | null;
}

function monthLabel(d: Date | null): string {
  if (!d) return '—';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function assertObjectId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Drive not found', 'not_found');
}

export async function createDrive(input: DriveInput, createdBy: string) {
  return Drive.create({ ...input, createdBy });
}

export async function getDrive(id: string) {
  assertObjectId(id);
  const d = await Drive.findById(id);
  if (!d) throw new HttpError(404, 'Drive not found', 'not_found');
  return d;
}

export async function updateDrive(id: string, patch: Partial<DriveInput> & { status?: string }) {
  assertObjectId(id);
  const d = await Drive.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
  if (!d) throw new HttpError(404, 'Drive not found', 'not_found');
  return d;
}

export async function cloneDrive(id: string) {
  const src = await getDrive(id);
  const obj = src.toObject();
  delete (obj as Record<string, unknown>)._id;
  delete (obj as Record<string, unknown>).createdAt;
  delete (obj as Record<string, unknown>).updatedAt;
  return Drive.create({ ...obj, name: `${src.name} (copy)`, status: 'Draft' });
}

export async function bulkAction(ids: string[], action: 'publish' | 'clone' | 'archive') {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id));
  if (action === 'clone') {
    let n = 0;
    for (const id of valid) { await cloneDrive(id); n++; }
    return { affected: n };
  }
  const status = action === 'publish' ? 'Published' : 'Archived';
  const res = await Drive.updateMany({ _id: { $in: valid } }, { $set: { status } });
  return { affected: res.modifiedCount };
}

export async function listDrives(params: ListParams, now: Date = new Date()) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 8;
  const match: Record<string, unknown> = {};
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { domain: rx }, { stream: rx }];
  }
  if (params.status) match.status = params.status;
  if (params.stream) match.stream = params.stream;
  if (params.domain) match.domain = params.domain;
  if (params.month) {
    const [y, m] = params.month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    match.eventDates = { $elemMatch: { $gte: start, $lt: end } };
  }

  const sortField = params.sort === 'month' ? 'primaryEventDate'
    : params.sort ?? 'createdAt';
  const sortDir = (params.order ?? (params.sort ? 'asc' : 'desc')) === 'asc' ? 1 : -1;

  const facet = await Drive.aggregate([
    { $match: match },
    { $addFields: {
      _upcoming: { $filter: { input: '$eventDates', as: 'd', cond: { $gte: ['$$d', now] } } },
    } },
    { $addFields: {
      primaryEventDate: { $ifNull: [{ $min: '$_upcoming' }, { $min: '$eventDates' }] },
    } },
    { $sort: { [sortField]: sortDir, _id: 1 } },
    { $facet: {
      items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      total: [{ $count: 'n' }],
    } },
  ]);

  const rows = facet[0]?.items ?? [];
  const total = facet[0]?.total?.[0]?.n ?? 0;
  const items: DriveListItem[] = rows.map((d: Record<string, unknown>) => {
    const primary = (d.primaryEventDate as Date | null) ?? null;
    return {
      id: String(d._id), name: d.name as string, domain: d.domain as string, stream: d.stream as string,
      month: monthLabel(primary), frequency: d.frequency as string, eventDay: d.eventDay as string,
      candCap: (d.candCap as number) ?? 0, empCap: (d.empCap as number) ?? 0, slotCap: (d.slotCap as number) ?? 0,
      status: d.status as string, createdBy: (d.createdBy as string) ?? '—',
      primaryEventDate: primary ? new Date(primary).toISOString() : null,
    };
  });
  return { items, total, page, limit };
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm run test -w server -- drives.service`
Expected: PASS (all cases). If a value is off, fix the service — do not weaken the assertions.

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0 errors.
```bash
git add server/src/modules/drives/drives.schemas.ts server/src/modules/drives/drives.service.ts server/test/drives.service.test.ts
git commit -m "feat(server): drives service (list/create/get/update/clone/bulk) with zod schemas"
```

---

## Task 3: Drives routes + controller (protected)

**Files:**
- Create: `server/src/modules/drives/drives.controller.ts`, `server/src/modules/drives/drives.routes.ts`
- Modify: `server/src/app.ts` (mount `/api/drives`)
- Test: `server/test/drives.route.test.ts`

**Interfaces:**
- Consumes: the service functions + schemas, `requireAuth`, `asyncHandler`.
- Produces: `driveRoutes` router: `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `POST /:id/clone`, `POST /bulk` — all behind `requireAuth`.

- [ ] **Step 1: Create `server/src/modules/drives/drives.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { createDriveSchema, updateDriveSchema, listQuerySchema } from './drives.schemas.js';
import { listDrives, createDrive, getDrive, updateDrive, cloneDrive, bulkAction } from './drives.service.js';

const CREATED_BY = 'Platform Admin';

export async function listController(req: Request, res: Response) {
  const params = listQuerySchema.parse(req.query);
  res.json(await listDrives(params));
}
export async function createController(req: Request, res: Response) {
  const input = createDriveSchema.parse(req.body);
  res.status(201).json(await createDrive(input, CREATED_BY));
}
export async function getController(req: Request, res: Response) {
  res.json(await getDrive(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  const patch = updateDriveSchema.parse(req.body);
  res.json(await updateDrive(req.params.id, patch));
}
export async function cloneController(req: Request, res: Response) {
  res.status(201).json(await cloneDrive(req.params.id));
}
const bulkSchema = z.object({ ids: z.array(z.string()).min(1), action: z.enum(['publish', 'clone', 'archive']) });
export async function bulkController(req: Request, res: Response) {
  const { ids, action } = bulkSchema.parse(req.body);
  res.json(await bulkAction(ids, action));
}
```

- [ ] **Step 2: Create `server/src/modules/drives/drives.routes.ts`**

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, createController, getController, patchController, cloneController, bulkController,
} from './drives.controller.js';

export const driveRoutes = Router();
driveRoutes.use(requireAuth);
driveRoutes.get('/', asyncHandler(listController));
driveRoutes.post('/', asyncHandler(createController));
driveRoutes.post('/bulk', asyncHandler(bulkController));
driveRoutes.get('/:id', asyncHandler(getController));
driveRoutes.patch('/:id', asyncHandler(patchController));
driveRoutes.post('/:id/clone', asyncHandler(cloneController));
```
(Note: `/bulk` is declared before `/:id` so it isn't captured as an id.)

- [ ] **Step 3: Mount in `server/src/app.ts`**

Add the import and mount (BEFORE `app.use(errorHandler)` — errorHandler stays last):
```ts
import { driveRoutes } from './modules/drives/drives.routes.js';
```
```ts
  app.use('/api/drives', driveRoutes);
```

- [ ] **Step 4: Write the failing test `server/test/drives.route.test.ts`**

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const token = () => signToken({ sub: 'u1', role: 'admin' });
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);
const validBody = {
  name: 'FE Cohort', domain: 'Frontend', stream: 'B.Tech', candType: 'Freshers', mode: 'Hybrid',
  frequency: 'One-time', eventDay: 'Wednesday', eventDates: ['2026-07-15T04:30:00.000Z'],
  candCap: 500, empCap: 9, slotCap: 360,
  eligibility: { sources: ['Institutes'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
  evaluation: [{ key: 'mcq', enabled: true, config: { questions: 30 } }],
  visibility: { employerReg: 'Invite-only', instituteVis: 'Selected institutes', candidateAccess: 'Eligible only' },
};

describe('drives routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/drives')).status).toBe(401);
  });

  it('creates then lists a drive', async () => {
    const created = await auth(request(createApp()).post('/api/drives').send(validBody));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('Draft');
    const list = await auth(request(createApp()).get('/api/drives'));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].name).toBe('FE Cohort');
  });

  it('400s on invalid body (no enabled evaluation stage)', async () => {
    const bad = { ...validBody, evaluation: [{ key: 'mcq', enabled: false, config: {} }] };
    const res = await auth(request(createApp()).post('/api/drives').send(bad));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });

  it('patches status (publish) and 404s on unknown id', async () => {
    const created = await auth(request(createApp()).post('/api/drives').send(validBody));
    const id = created.body._id;
    const pub = await auth(request(createApp()).patch(`/api/drives/${id}`).send({ status: 'Published' }));
    expect(pub.body.status).toBe('Published');
    const miss = await auth(request(createApp()).get('/api/drives/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });

  it('bulk-archives', async () => {
    const c1 = await auth(request(createApp()).post('/api/drives').send(validBody));
    const c2 = await auth(request(createApp()).post('/api/drives').send(validBody));
    const res = await auth(request(createApp()).post('/api/drives/bulk').send({ ids: [c1.body._id, c2.body._id], action: 'archive' }));
    expect(res.body.affected).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm run test -w server -- drives.route` → PASS. Then `npx tsc --noEmit -p server/tsconfig.json` → 0 errors, and `npm run test -w server` → all suites pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/drives/drives.controller.ts server/src/modules/drives/drives.routes.ts server/src/app.ts server/test/drives.route.test.ts
git commit -m "feat(server): protected /api/drives routes (list/create/get/patch/clone/bulk)"
```

---

## Task 4: Migrate dashboard + seed to eventDates[] (remove legacy eventDate)

**Files:**
- Modify: `server/src/modules/dashboard/dashboard.service.ts`, `server/src/models/Drive.ts` (remove legacy `eventDate`), `server/src/seed/seed.ts`
- Test: `server/test/dashboard.service.test.ts` (update fixtures/assertions)

**Interfaces:**
- The dashboard reads `eventDates[]` instead of `eventDate`. Behavior preserved: "next MatchDay" = earliest `eventDate ≥ now` across Active drives; events list = the nearest upcoming per drive (limit 3, ascending); "Upcoming Wednesdays" = distinct upcoming Wednesday dates across Active drives' `eventDates`.

- [ ] **Step 1: Remove the legacy field from `server/src/models/Drive.ts`**

Delete the line `eventDate: { type: Date },` (the `// legacy` line). Keep `eventDates`.

- [ ] **Step 2: Update `dashboard.service.ts` — events + upcomingWed**

Replace the `upcomingWed` computation. Currently (post-Command-Center) it is an aggregation counting distinct upcoming Wednesday `eventDate`s. Change the `$match`/`$addFields` to unwind `eventDates`:

```ts
  const activeDrives = await Drive.countDocuments({ status: 'Active' });
  const upcomingWedAgg = await Drive.aggregate<{ n: number }>([
    { $match: { status: 'Active' } },
    { $unwind: '$eventDates' },
    { $match: { eventDates: { $gte: now } } },
    { $addFields: {
      _dow: { $dayOfWeek: { date: '$eventDates', timezone: 'UTC' } },
      _day: { $dateToString: { date: '$eventDates', format: '%Y-%m-%d', timezone: 'UTC' } },
    } },
    { $match: { _dow: 4 } },
    { $group: { _id: '$_day' } },
    { $count: 'n' },
  ]);
  const upcomingWed = upcomingWedAgg[0]?.n ?? 0;
```

Replace the events query (which used `eventDate`). Compute each Active drive's nearest-upcoming date, then take the 3 earliest:

```ts
  const eventDrives = await Drive.aggregate([
    { $match: { status: 'Active' } },
    { $addFields: {
      _upcoming: { $filter: { input: '$eventDates', as: 'd', cond: { $gte: ['$$d', new Date(now.getTime() - DAY)] } } },
    } },
    { $addFields: { nearest: { $min: '$_upcoming' } } },
    { $match: { nearest: { $ne: null } } },
    { $sort: { nearest: 1 } },
    { $limit: 3 },
  ]);
  const events = await Promise.all(eventDrives.map(async (d: Record<string, unknown>) => {
    const nearest = new Date(d.nearest as Date);
    const [slotCount, bookedForDrive] = await Promise.all([
      Slot.countDocuments({ driveId: d._id }),
      Slot.countDocuments({ driveId: d._id, status: 'booked' }),
    ]);
    const candCount = await Jobseeker.countDocuments({});
    const sameUtcDay =
      nearest.getUTCFullYear() === nextMd.getUTCFullYear() &&
      nearest.getUTCMonth() === nextMd.getUTCMonth() &&
      nearest.getUTCDate() === nextMd.getUTCDate();
    return {
      date: nearest.toISOString(),
      title: `MatchDay · ${d.name}`,
      employers: (d.empCap as number) ?? 0,
      slots: slotCount,
      candidates: candCount,
      prepPct: pct(bookedForDrive, slotCount),
      status: (sameUtcDay ? 'prep' : 'open') as 'prep' | 'open',
    };
  }));
```
Ensure `nextMd` (from `nextWednesday(now)`) is still computed above this block (it is). Remove the old `eventDocs`/`events` block that referenced `d.eventDate`. Keep everything else (KPIs, funnels, readiness, slot util, leaderboards, calendar) unchanged.

- [ ] **Step 3: Update `server/test/dashboard.service.test.ts`**

In `seedFixture()`, change every `Drive.create({... eventDate: X ...})` to `eventDates: [X]`. Keep the same dates (Frontend Jul 15, Fullstack Jul 22, Thursday Drive Jul 16, Old Draft Jun 1 Draft). The existing assertions (activeDrives 3, upcomingWednesdays 2, events[0].status 'prep', nextMatchDay 2026-07-15, events[0].title contains 'Frontend') must still hold. Run and confirm.

- [ ] **Step 4: Update `server/src/seed/seed.ts`**

Change drive creation to use `eventDates` and populate the new fields. Replace the drive loop's `Drive.create({...})` object with:

```ts
    drives.push(await Drive.create({
      name: upcoming ? driveNames[i] : `Drive ${i + 1}`,
      domain: pick(rng, ['Frontend', 'Backend', 'Full-stack', 'Data / ML', 'DevOps']),
      stream: pick(rng, ['B.Tech', 'M.Tech', 'MCA', 'MBA']),
      status: 'Active',
      candType: pick(rng, ['Freshers', 'Experienced', 'Both']),
      mode: pick(rng, ['Online', 'Onsite', 'Hybrid']),
      frequency: pick(rng, ['Weekly', 'Bi-weekly', 'Monthly', 'One-time']),
      eventDay: 'Wednesday',
      eventDates: upcoming ? [upcomingDates[i]] : [new Date(NOW.getTime() + intBetween(rng, 30, 90) * DAY)],
      candCap: intBetween(rng, 150, 500), empCap: intBetween(rng, 5, 9), slotCap: intBetween(rng, 180, 360),
      eligibility: {
        sources: ['Institutes'], branches: ['CSE', 'IT', 'ECE'], gradYears: [2025, 2026], expType: 'Freshers only',
      },
      evaluation: [
        { key: 'mcq', enabled: true, config: { questions: 30, durationMin: 30 } },
        { key: 'coding', enabled: true, config: { problems: 3, durationMin: 60 } },
        { key: 'tara', enabled: true, config: { durationMin: 20 } },
        { key: 'assignments', enabled: false, config: { deadlineDays: 3 } },
      ],
      visibility: { employerReg: 'Invite-only', instituteVis: 'Selected institutes', candidateAccess: 'Eligible only' },
      createdBy: 'Platform Admin',
      createdAt: spread(),
    }));
```
Give the first upcoming drive multiple dates to exercise the array: after the loop, e.g. `drives[0].eventDates = upcomingDates.slice(0, 2); await drives[0].save();` (Jul 15 + 22). The Slot seed still references `drives[0]` and `upcomingDates[0]` — unchanged.

- [ ] **Step 5: Verify server**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0 errors.
Run: `npm run test -w server` → all suites pass (dashboard included), pristine.

- [ ] **Step 6: Commit**

```bash
git add server/src/models/Drive.ts server/src/modules/dashboard/dashboard.service.ts server/src/seed/seed.ts server/test/dashboard.service.test.ts
git commit -m "refactor(server): migrate dashboard + seed to Drive.eventDates[]; drop legacy eventDate"
```

---

## Task 5: Drives list page (client) + routing/nav

**Files:**
- Create: `client/src/types/drives.ts`, `client/src/pages/Drives/index.tsx`, `DrivesToolbar.tsx`, `DrivesTable.tsx`, `BulkBar.tsx`, `client/src/pages/Drives/hooks/useDrives.ts`, `useDriveMutations.ts`
- Modify: `client/src/App.tsx` (add `/drives` route), `client/src/components/Sidebar.tsx` (Drives → `/drives`)
- Test: `client/src/test/DrivesTable.test.tsx`

**Interfaces:**
- Produces: `useDrives(params)` (TanStack Query → `GET /api/drives`), `useDriveMutations()` (create/update/clone/bulk mutations that invalidate `['drives']`), and the list page. `types/drives.ts` mirrors the server DTOs (`DriveListItem`, `DriveListResponse`, the wizard `DriveInput`/`DriveDoc` shapes).

- [ ] **Step 1: Create `client/src/types/drives.ts`**

```ts
export interface DriveListItem {
  id: string; name: string; domain: string; stream: string;
  month: string; frequency: string; eventDay: string;
  candCap: number; empCap: number; slotCap: number;
  status: 'Active' | 'Published' | 'Draft' | 'Archived';
  createdBy: string; primaryEventDate: string | null;
}
export interface DriveListResponse { items: DriveListItem[]; total: number; page: number; limit: number; }
export interface DriveListParams {
  q?: string; status?: string; month?: string; stream?: string; domain?: string;
  sort?: string; order?: 'asc' | 'desc'; page?: number; limit?: number;
}
export interface EvaluationStage { key: 'mcq' | 'coding' | 'tara' | 'assignments'; enabled: boolean; config: Record<string, number>; }
export interface DriveInput {
  name: string; domain: string; stream: string; status?: string;
  candType: 'Freshers' | 'Experienced' | 'Both'; mode: 'Online' | 'Onsite' | 'Hybrid';
  frequency: 'Weekly' | 'Bi-weekly' | 'Monthly' | 'One-time'; eventDay: 'Wednesday' | 'Saturday';
  eventDates: string[]; candCap: number; empCap: number; slotCap: number;
  eligibility: { sources: string[]; branches: string[]; gradYears: number[]; expType: string };
  evaluation: EvaluationStage[];
  visibility: { employerReg: string; instituteVis: string; candidateAccess: string };
}
```

- [ ] **Step 2: Create `client/src/pages/Drives/hooks/useDrives.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { DriveListParams, DriveListResponse } from '../../../types/drives.js';

export function useDrives(params: DriveListParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['drives', params],
    queryFn: () => apiFetch<DriveListResponse>(`/drives${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
```

- [ ] **Step 3: Create `client/src/pages/Drives/hooks/useDriveMutations.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { DriveInput } from '../../../types/drives.js';

export function useDriveMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['drives'] });

  const create = useMutation({
    mutationFn: (body: DriveInput) => apiFetch('/drives', { method: 'POST', body, token }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<DriveInput> & { status?: string } }) =>
      apiFetch(`/drives/${id}`, { method: 'PATCH', body, token }),
    onSuccess: invalidate,
  });
  const clone = useMutation({
    mutationFn: (id: string) => apiFetch(`/drives/${id}/clone`, { method: 'POST', token }),
    onSuccess: invalidate,
  });
  const bulk = useMutation({
    mutationFn: (body: { ids: string[]; action: 'publish' | 'clone' | 'archive' }) =>
      apiFetch('/drives/bulk', { method: 'POST', body, token }),
    onSuccess: invalidate,
  });
  return { create, update, clone, bulk };
}
```
(Note: `apiFetch` already supports `{ method, body, token }` and JSON-encodes the body.)

- [ ] **Step 4: Create `DrivesToolbar.tsx`, `DrivesTable.tsx`, `BulkBar.tsx`, and `index.tsx`**

Port the prototype's Drive Management markup (`matchday-admin-app_23.html` lines 1344–1396) using its real classes: `.dm-toolbar`, `.dm-search`, `.select`, `.bulkbar`, `.dm-table-wrap`, `.dm-scroll`, `table.dm`, `.sortable`, `.cb`, `.dm-pager`, `.pinfo`, `.rpp`, `.pctrl`, and the status badge classes (`.st-active`/`.st-published`/`.st-draft`/`.st-archived` — verify names in `theme.css`, matching the Command Center approach).

- `index.tsx` — `AppShell` (crumb "Operations", title "Drive Management") wrapping the toolbar + BulkBar + table + pager. Holds state: `params` (DriveListParams), `selectedIds: string[]`. `useDrives(params)` drives the table. "Create Drive" opens the wizard in create mode (wizard added in Task 6 — for now wire a `onCreate` prop/stub that Task 6 replaces; leave a clear `// TODO(Task 6): open DriveWizard` and render a disabled button OR a placeholder handler). Row action "Edit" → open wizard in edit mode (Task 6). "Publish"/"Archive" → `useDriveMutations().update`. "Clone" → `.clone`. Export → build CSV client-side from `data.items`.
- `DrivesToolbar.tsx` — search input (debounced → `params.q`), four `<select>`s (status/month/stream/domain) updating `params`, Export + Create Drive buttons. Month options: build from a small set (e.g. next few months) as `{value:'2026-07', label:'Jul 2026'}`.
- `DrivesTable.tsx` — sortable headers (click → set `params.sort`/`order`), a select-all checkbox + per-row checkboxes (update `selectedIds`), status badge, and a per-row action menu. Renders `items` from the query; shows loading/empty states.
- `BulkBar.tsx` — shown when `selectedIds.length > 0`; Publish/Clone/Archive call `useDriveMutations().bulk` with the ids; Clear resets selection.
- Pager: compute pages from `total`/`limit`; render prev/next + page buttons; a rows-per-page `<select>` (8/15/25) sets `params.limit`.

- [ ] **Step 5: Wire routing + nav**

In `client/src/App.tsx`, add inside the protected area:
```tsx
import { DrivesPage } from './pages/Drives/index.js';
```
```tsx
        <Route path="/drives" element={<ProtectedRoute><DrivesPage /></ProtectedRoute>} />
```
In `client/src/components/Sidebar.tsx`, change the Drives nav item's `to` from `/coming-soon/drives` to `/drives`.

- [ ] **Step 6: Write the test `client/src/test/DrivesTable.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrivesTable } from '../pages/Drives/DrivesTable.js';
import type { DriveListItem } from '../types/drives.js';

const items: DriveListItem[] = [
  { id: '1', name: 'Alpha Frontend', domain: 'Frontend', stream: 'B.Tech', month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday', candCap: 500, empCap: 9, slotCap: 360, status: 'Published', createdBy: 'Platform Admin', primaryEventDate: '2026-07-15T04:30:00.000Z' },
];

describe('DrivesTable', () => {
  it('renders a drive row with name and status', () => {
    render(<DrivesTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="desc" onRowAction={vi.fn()} />);
    expect(screen.getByText('Alpha Frontend')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Jul 2026')).toBeInTheDocument();
  });
});
```
(Adjust the `DrivesTable` prop signature to match; keep the component's props explicit so it is testable in isolation.)

- [ ] **Step 7: Verify + commit**

Run: `npx tsc --noEmit -p client/tsconfig.json` → 0 errors. `npm run test -w client` → all pass, pristine. `npm run build -w client` → success.
```bash
git add client/src/types/drives.ts client/src/pages/Drives client/src/App.tsx client/src/components/Sidebar.tsx client/src/test/DrivesTable.test.tsx
git commit -m "feat(client): drives list page with filters, sort, pagination, bulk actions"
```

---

## Task 6: Drive wizard shell + form model + submit

**Files:**
- Create: `client/src/pages/Drives/wizard/DriveWizard.tsx`, `client/src/pages/Drives/wizard/validation.ts`
- Modify: `client/src/pages/Drives/index.tsx` (open wizard for create/edit), `client/src/pages/Dashboard/index.tsx` or `ReadinessHero`/topbar wiring for the Command Center "New Drive" button

**Interfaces:**
- Produces:
  - `validation.ts`: `validateStep(step: number, model: DriveInput): string[]` — returns error messages for the given step (empty = valid). Rules per spec §8 (step 1 name; step 2 ≥1 date; step 3 ≥1 source & ≥1 branch; step 4 ≥1 enabled eval stage).
  - `DriveWizard.tsx`: `<DriveWizard mode="create" | "edit" driveId?={string} onClose={() => void} />` — full-screen overlay; holds the `DriveInput` model (blank default for create; fetched via `GET /api/drives/:id` for edit); renders the active step (step components from Task 7); footer Back/Continue/Save-draft/Publish; on submit calls `useDriveMutations().create`/`.update`. Exports a `blankDriveModel()` factory.

- [ ] **Step 1: Create `client/src/pages/Drives/wizard/validation.ts`**

```ts
import type { DriveInput } from '../../../types/drives.js';

export function validateStep(step: number, m: DriveInput): string[] {
  const errs: string[] = [];
  if (step === 0 && !m.name.trim()) errs.push('A drive name is required.');
  if (step === 1 && m.eventDates.length === 0) errs.push('Select at least one drive date.');
  if (step === 2) {
    if (m.eligibility.sources.length === 0) errs.push('Pick at least one source.');
    if (m.eligibility.branches.length === 0) errs.push('Pick at least one branch.');
  }
  if (step === 3 && !m.evaluation.some((e) => e.enabled)) errs.push('Enable at least one evaluation stage.');
  return errs;
}

export function isDriveValid(m: DriveInput): boolean {
  return [0, 1, 2, 3].every((s) => validateStep(s, m).length === 0);
}
```

- [ ] **Step 2: Create `DriveWizard.tsx` shell**

Port the prototype's `#wizard` overlay (`matchday-admin-app_23.html` lines ~2040–2208): `.wiz-top` (title + close), `.wiz-body` with `.wiz-rail` (the 6 `.st` step items with `.dot`/`.si`, current highlighted) and `.wiz-main` (`.wiz-progress` bar + the active `.wstep`), and `.wiz-foot` (Back / step number / Save draft & exit / Continue|Publish). Behavior:
- State: `step` (0–5), `model: DriveInput` (from `blankDriveModel()` or fetched for edit via a `useQuery` on `/drives/:id` mapped into `DriveInput`), `showErrors: string[]`.
- `blankDriveModel()` returns sensible defaults matching the prototype's pre-selected options (candType 'Freshers', mode 'Hybrid', frequency 'One-time', eventDay 'Wednesday', eventDates [], sources ['Institutes'], branches ['CSE','IT'], gradYears [2025,2026], expType 'Freshers only', evaluation all four stages with mcq/coding/tara enabled + assignments disabled and the prototype's default configs, visibility Invite-only/Selected/Eligible-only, caps 500/10/360).
- "Continue": run `validateStep(step, model)`; if errors, show them; else `step++`. On the last step, the primary button becomes "Publish".
- "Publish": set `model.status='Published'`, submit. "Save draft & exit": set `status='Draft'`, submit.
- Submit: create mode → `create.mutateAsync(model)`; edit mode → `update.mutateAsync({ id, body: model })`; on success call `onClose()` (the list query is invalidated by the mutation).
- Render the active step component (Task 7) passing `model` + an `onChange(patch: Partial<DriveInput>)` updater.

- [ ] **Step 3: Open the wizard from the list + Command Center**

In `client/src/pages/Drives/index.tsx`: add `wizard` state (`{ mode: 'create' } | { mode: 'edit', id } | null`); "Create Drive" → set `{mode:'create'}`; row "Edit" → `{mode:'edit', id}`; render `<DriveWizard ... onClose={() => setWizard(null)} />` when non-null.
For the Command Center "New Drive" button: the simplest cross-page wiring is to navigate to `/drives?new=1`; in `DrivesPage`, read the `new` query param on mount and open the create wizard. Wire the dashboard's "New Drive" button (`ReadinessHero`/filters area) to `navigate('/drives?new=1')`.

- [ ] **Step 4: Type-check + commit** (steps render placeholders until Task 7; the shell must compile and the list must still build)

Run: `npx tsc --noEmit -p client/tsconfig.json` → 0 errors. `npm run build -w client` → success.
```bash
git add client/src/pages/Drives/wizard/DriveWizard.tsx client/src/pages/Drives/wizard/validation.ts client/src/pages/Drives/index.tsx client/src/pages/Dashboard
git commit -m "feat(client): drive wizard shell with step nav, validation, and submit"
```

---

## Task 7: Wizard step components + wizard test

**Files:**
- Create: `client/src/pages/Drives/wizard/StepBasics.tsx`, `StepSchedule.tsx`, `StepEligibility.tsx`, `StepEvaluation.tsx`, `StepVisibility.tsx`, `StepReview.tsx`
- Modify: `DriveWizard.tsx` (render the real steps)
- Test: `client/src/test/DriveWizard.test.tsx`

**Interfaces:**
- Each step: `<StepX model={DriveInput} onChange={(patch: Partial<DriveInput>) => void} errors={string[]} />`. Steps port the prototype's real field markup so `theme.css` styles them.

- [ ] **Step 1: Create the six step components (port prototype markup)**

Port from `matchday-admin-app_23.html`:
- **StepBasics** (lines 2073–2086): name input (`.wfld.full`, error `.emsg`), domain + stream `<select>`s (`.wgrid`), candidate-type `.pick`/`.opt` (Freshers/Experienced/Both), mode `.pick`/`.opt` (Online/Onsite/Hybrid). `.opt.on` reflects `model`; clicking sets it via `onChange`.
- **StepSchedule** (2089–2106): frequency `<select>`, event-day `.pick` (Wednesday/Saturday), **drive dates** `.datechips` — generate the next ~6 dates matching `model.eventDay` (Wednesdays or Saturdays) as toggle chips writing `model.eventDates` (store ISO strings); candidate/employer/slot capacity number inputs.
- **StepEligibility** (2110–2145): sources `.chips`/`.chipc` (multi), branches `.chips`/`.chipc` (multi), grad-years `.chips` (multi), experience `.pick` (single). Toggling updates the arrays / value.
- **StepEvaluation** (2150–2181): four `.evrow` (mcq/coding/tara/assignments) each with a `.switch` toggling `enabled` and `.evcfg` mini-fields writing `config`. Show the "enable at least one" error when relevant.
- **StepVisibility** (2185–2190): three `.pick` groups (employerReg, instituteVis, candidateAccess).
- **StepReview** (2193–2197): summarize the model in a `.rev-grid` (name, domain/stream, dates, capacities, eligibility, enabled evaluation stages, visibility) and show any blocking warnings from `isDriveValid`.

Bind every field to `model` and write through `onChange`. Use the prototype's exact class names.

- [ ] **Step 2: Render the real steps in `DriveWizard.tsx`**

Replace the placeholder step render with a switch over `step` → the six components, passing `model`, `onChange`, and `validateStep(step, model)` (when `showErrors`).

- [ ] **Step 3: Write the test `client/src/test/DriveWizard.test.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { DriveWizard } from '../pages/Drives/wizard/DriveWizard.js';

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><AuthProvider>
      <DriveWizard mode="create" onClose={vi.fn()} />
    </AuthProvider></MemoryRouter></QueryClientProvider>,
  );
}

describe('DriveWizard', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('blocks Continue on step 1 when the name is empty and shows the error', async () => {
    renderWizard();
    // clear the default name if any, then try to continue
    const next = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(next);
    expect(await screen.findByText(/drive name is required/i)).toBeInTheDocument();
  });
});
```
(If `blankDriveModel()` pre-fills a name, first clear the name input in the test before clicking Continue. Adjust to assert the real validation behavior — the test must exercise a genuine invalid→error path.)

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit -p client/tsconfig.json` → 0 errors. `npm run test -w client` → all pass, pristine. `npm run build -w client` → success.
```bash
git add client/src/pages/Drives/wizard client/src/test/DriveWizard.test.tsx
git commit -m "feat(client): drive wizard steps (basics/schedule/eligibility/evaluation/visibility/review)"
```

---

## Task 8: End-to-end verification

**Files:**
- Modify: `README.md` (note the Drives module)

- [ ] **Step 1: Full test suite** — `npm test` → server + client all green, pristine.
- [ ] **Step 2: Type-check both** — `npx tsc --noEmit -p server/tsconfig.json` and `-p client/tsconfig.json` → 0 errors. `npm run build -w client` → success.
- [ ] **Step 3: Re-seed + API smoke** (with mongod running): `npm run seed`, then start the server and, with a login token, exercise: `GET /api/drives` (paginated list), `POST /api/drives` (create → 201), `PATCH /api/drives/:id` (publish), `POST /api/drives/:id/clone`, `POST /api/drives/bulk`, and `GET /api/dashboard/overview` (confirm Command Center still returns readiness 82, matchReady 531, upcomingWednesdays 3, events[0] status 'prep' — i.e. the eventDates[] migration preserved the numbers).
- [ ] **Step 4: Manual smoke** — `npm run dev`, log in, open `/drives`: list renders with filters/sort/pagination; Create Drive opens the wizard; complete the 6 steps and Publish → the new drive appears; Edit a drive; publish/archive/clone a row; bulk-archive; Command Center "New Drive" opens the wizard.
- [ ] **Step 5: Update `README.md`** — add a short "Drives" line under a Modules/Features section.
- [ ] **Step 6: Commit** — `docs: note Drives module and verify end-to-end`.

---

## Self-Review Notes (author checklist — resolved)

- **Spec coverage:** expanded schema (T1) · list filter/sort/paginate + create/get/patch/clone/bulk service+routes (T2/T3) · zod validation §8 (T2/T3) · eventDates[] migration of dashboard + seed (T4) · list UI + bulk + export + routing/nav (T5) · 6-step wizard create/edit/draft/publish (T6/T7) · Command Center "New Drive" + list "Create Drive" wiring (T6) · E2E + re-verify Command Center (T8). ✔
- **Green at each step:** T1 keeps legacy `eventDate` optional (additive); T2/T3 add the drives module on the new fields; T4 completes the `eventDates[]` migration and removes the legacy field atomically (model+dashboard+seed+tests together). ✔
- **Type consistency:** `DriveInput`/`DriveListItem` shapes match across server (`drives.schemas.ts`, `drives.service.ts`) and client (`types/drives.ts`); `useDriveMutations` calls match the route contracts; `validateStep` rules mirror the zod rules. ✔
- **Placeholder scan:** UI steps are "port from prototype lines X" (copy-from-source, markup exists); all authored logic (schema, zod, service, routes, dashboard migration, hooks, validation) is complete code. The only intentional interim stub is the list's Create-Drive handler in T5, explicitly replaced in T6. ✔
