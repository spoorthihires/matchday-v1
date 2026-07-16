# Institute ↔ Drive Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make institute↔drive assignment a real many-to-many relationship — a `DriveAssignment` linking collection + nested institutes-module API + the institute-side UI (Drives tab, Assign modal, real count, bulk assign) — wiring the currently-disabled prototype stubs.

**Architecture:** New `DriveAssignment` collection (unique `(instituteId, driveId)`). Assignment logic added to the existing `institutes` module (service/controller/routes), matching its `:id/candidates` and `:id/audit` sub-resource pattern. React work extends `client/src/pages/Institutes/` (new `TabDrives`, `AssignDrivesModal`, `BulkAssignDrivesModal`, hooks; edits to `InstituteDetail`, `BulkBar`, the list page). Command Center NOT modified. Idempotency (upsert on the pair) is the core correctness property.

**Tech Stack:** Express 4 + Mongoose 8 + zod (server, TS strict, ESM `.js`); React 18 + Vite + react-router-dom 6 + @tanstack/react-query 5 (client); Vitest + supertest + mongodb-memory-server (server); Vitest + RTL + jsdom (client).

## Global Constraints

- **Error contract:** `{ error: { message, code } }`. zod → 400 `validation`; not-found → 404 `not_found`; 401 via `requireAuth`. Copy from the institutes module.
- **ESM:** relative imports end in `.js`. `"strict": true` — no implicit `any`. `tsc --noEmit` MUST pass each task (`npx -w server tsc --noEmit` / `npx -w client tsc --noEmit`).
- **No `timestamps: true`** on `DriveAssignment` — explicit `createdAt`.
- **Idempotency:** assign uses `updateOne(pairFilter, { $setOnInsert }, { upsert: true })` so re-assigning an existing pair is a no-op. Unassign uses `deleteOne` (idempotent — deleting a missing link still succeeds). The unique compound index `(instituteId, driveId)` is the DB-layer guard.
- **`assignedDrives` is a live aggregation, never stored** — `countDocuments({ instituteId })` on the detail. (The whole point of this slice is to replace faked stats with real derivation.)
- **Actor** constant `'Platform Admin'` (matches the institutes controller).
- **CC untouched** — do not edit `dashboard.service.ts`.
- **Faithful CSS:** reuse classes already in `client/src/styles/theme.css` (`.card`/`.card-h`/`.dm-empty`, `.dm`/`.dm-table-wrap`/`.dm-scroll`/`.dm-name`, `.chip`/`.chip.dom`/`.chip.stream`, `.badge-st`/`.st-*`, `.btn`/`.btn-ghost`/`.btn-primary`, `.modal-scrim`/`.modal`/`.modal-h`/`.modal-b`/`.modal-f`/`.x`, `.dm-search`, `.bulkbar`/`.bb`, `.rowact`). No new CSS.
- **Drive status → badge class** (reuse the existing map): Active→`st-active`, Published→`st-published`, Draft→`st-draft`, Archived→`st-archived`.

---

## File Structure

```
server/src/
  models/DriveAssignment.ts                       # T1 create
  modules/institutes/institutes.service.ts        # T1 modify (assignment fns + assignedDrives on getInstitute)
  modules/institutes/institutes.schemas.ts        # T2 modify (assign body schemas)
  modules/institutes/institutes.controller.ts     # T2 modify (5 controllers)
  modules/institutes/institutes.routes.ts         # T2 modify (routes; /assign-drives before /:id)
  seed/seed.ts                                    # T3 modify
server/test/
  institute-drives.service.test.ts                # T1
  institute-drives.route.test.ts                  # T2
client/src/
  types/institutes.ts                             # T4 modify (assignedDrives + AssignedDriveItem)
  pages/Institutes/hooks/useInstituteDrives.ts    # T4 create
  pages/Institutes/hooks/useDriveAssignmentMutations.ts  # T4 create
  pages/Institutes/detail/TabDrives.tsx           # T5 create
  pages/Institutes/detail/AssignDrivesModal.tsx   # T5 create
  pages/Institutes/detail/InstituteDetail.tsx     # T5 modify
  pages/Institutes/BulkAssignDrivesModal.tsx      # T6 create
  pages/Institutes/BulkBar.tsx                    # T6 modify
  pages/Institutes/index.tsx                      # T6 modify (wire bulk)
client/src/test/
  TabDrives.test.tsx AssignDrivesModal.test.tsx   # T5
  BulkAssignDrives.test.tsx                        # T6
```

---

## Task 1: Server — DriveAssignment model + assignment service (+ service tests)

**Files:** Create `server/src/models/DriveAssignment.ts`; Modify `server/src/modules/institutes/institutes.service.ts`; Test `server/test/institute-drives.service.test.ts`.

**Interfaces:**
- Produces (used by T2): `AssignedDriveItem` type; async `listInstituteDrives(id)`, `assignDrives(id, driveIds)`, `unassignDrive(id, driveId)`, `bulkAssignDrives(instituteIds, driveIds)`; and `getInstitute` now returns an added `assignedDrives: number`.

- [ ] **Step 1: Model** — `server/src/models/DriveAssignment.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const driveAssignmentSchema = new Schema({
  instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true },
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  createdAt: { type: Date, default: Date.now },
});
driveAssignmentSchema.index({ instituteId: 1, driveId: 1 }, { unique: true });

export type DriveAssignmentDoc = InferSchemaType<typeof driveAssignmentSchema>;
export const DriveAssignment = model('DriveAssignment', driveAssignmentSchema);
```

- [ ] **Step 2: Write the failing service test** — `server/test/institute-drives.service.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Drive } from '../src/models/Drive.js';
import { DriveAssignment } from '../src/models/DriveAssignment.js';
import { listInstituteDrives, assignDrives, unassignDrive, bulkAssignDrives, getInstitute } from '../src/modules/institutes/institutes.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function inst(name = 'VNR') { return Institute.create({ name, city: 'Hyderabad', type: 'Engineering', status: 'Active', owner: 'A', email: 'a@b.io', ownershipHistory: [] }); }
async function drive(name: string) { return Drive.create({ name, domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] }); }

describe('institute-drives service', () => {
  it('assigns drives idempotently and lists them newest-first', async () => {
    const i = await inst(); const d1 = await drive('FE'); const d2 = await drive('BE');
    await assignDrives(String(i._id), [String(d1._id), String(d2._id)]);
    await assignDrives(String(i._id), [String(d1._id)]);            // re-assign existing → no-op
    expect(await DriveAssignment.countDocuments({})).toBe(2);
    const { items } = await listInstituteDrives(String(i._id));
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('BE');                                // newest assignment first (d2 last of the pair… order by createdAt desc)
    expect(items.map((x) => x.name).sort()).toEqual(['BE', 'FE']);
    expect(items[0]).toHaveProperty('domain');
    expect(items[0]).toHaveProperty('status');
  });

  it('the unique index rejects a raw duplicate pair', async () => {
    const i = await inst(); const d = await drive('FE');
    await DriveAssignment.init();                                    // ensure the unique index is built
    await DriveAssignment.create({ instituteId: i._id, driveId: d._id });
    await expect(DriveAssignment.create({ instituteId: i._id, driveId: d._id })).rejects.toThrow();
  });

  it('unassigns (idempotent) and only resolvable drives are assigned', async () => {
    const i = await inst(); const d = await drive('FE');
    await assignDrives(String(i._id), [String(d._id), '64b000000000000000000000']);  // 2nd id resolves to no Drive
    expect(await DriveAssignment.countDocuments({})).toBe(1);        // only the real drive assigned
    expect(await unassignDrive(String(i._id), String(d._id))).toEqual({ deleted: true });
    expect(await unassignDrive(String(i._id), String(d._id))).toEqual({ deleted: true });  // idempotent
    expect(await DriveAssignment.countDocuments({})).toBe(0);
  });

  it('bulk-assigns the cartesian product idempotently and reports newly-created count', async () => {
    const i1 = await inst('A'); const i2 = await inst('B'); const d1 = await drive('FE'); const d2 = await drive('BE');
    const r1 = await bulkAssignDrives([String(i1._id), String(i2._id)], [String(d1._id), String(d2._id)]);
    expect(r1.assigned).toBe(4);
    const r2 = await bulkAssignDrives([String(i1._id)], [String(d1._id)]);   // already exists
    expect(r2.assigned).toBe(0);
    expect(await DriveAssignment.countDocuments({})).toBe(4);
  });

  it('getInstitute returns a live assignedDrives count; 404 on unknown', async () => {
    const i = await inst(); const d = await drive('FE');
    await assignDrives(String(i._id), [String(d._id)]);
    const res = await getInstitute(String(i._id));
    expect(res.assignedDrives).toBe(1);
    await expect(getInstitute('nope')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run — expect FAIL** — `npm test -w server -- institute-drives.service`.

- [ ] **Step 4: Service** — add to `server/src/modules/institutes/institutes.service.ts`. Add the imports at the top:
```ts
import { Drive } from '../../models/Drive.js';
import { DriveAssignment } from '../../models/DriveAssignment.js';
```
Then add (near the other exports):

```ts
export interface AssignedDriveItem { id: string; name: string; domain: string; stream: string; status: string; month: string; }

const A_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function driveMonth(dates: unknown): string {
  const arr = Array.isArray(dates) ? (dates as Date[]) : [];
  if (!arr.length) return '—';
  const min = new Date(Math.min(...arr.map((d) => new Date(d).getTime())));
  return `${A_MONTHS[min.getUTCMonth()]} ${min.getUTCFullYear()}`;
}

async function requireInstitute(id: string) {
  assertId(id);
  const inst = await Institute.findById(id).select('_id').lean();
  if (!inst) throw new HttpError(404, 'Institute not found', 'not_found');
  return inst;
}

export async function listInstituteDrives(id: string) {
  await requireInstitute(id);
  const rows = await DriveAssignment.find({ instituteId: new Types.ObjectId(id) }).sort({ createdAt: -1 }).lean();
  const drives = await Drive.find({ _id: { $in: rows.map((r) => r.driveId) } }).lean();
  const byId = new Map(drives.map((d) => [String(d._id), d]));
  const items: AssignedDriveItem[] = rows.flatMap((r) => {
    const d = byId.get(String(r.driveId));
    if (!d) return [];   // drive was deleted — drop the orphaned assignment from the view
    return [{ id: String(d._id), name: (d.name as string) || '(untitled)', domain: (d.domain as string) ?? '', stream: (d.stream as string) ?? '', status: (d.status as string) ?? 'Draft', month: driveMonth(d.eventDates) }];
  });
  return { items };
}

async function upsertPair(instituteId: string, driveId: string) {
  await DriveAssignment.updateOne(
    { instituteId: new Types.ObjectId(instituteId), driveId: new Types.ObjectId(driveId) },
    { $setOnInsert: { instituteId: new Types.ObjectId(instituteId), driveId: new Types.ObjectId(driveId), createdAt: new Date() } },
    { upsert: true },
  );
}

export async function assignDrives(id: string, driveIds: string[]) {
  await requireInstitute(id);
  const valid = driveIds.filter((d) => Types.ObjectId.isValid(d));
  const resolvable = (await Drive.find({ _id: { $in: valid } }).select('_id').lean()).map((d) => String(d._id));
  for (const dId of resolvable) await upsertPair(id, dId);
  return listInstituteDrives(id);
}

export async function unassignDrive(id: string, driveId: string) {
  assertId(id);
  if (Types.ObjectId.isValid(driveId)) {
    await DriveAssignment.deleteOne({ instituteId: new Types.ObjectId(id), driveId: new Types.ObjectId(driveId) });
  }
  return { deleted: true as const };
}

export async function bulkAssignDrives(instituteIds: string[], driveIds: string[]) {
  const insts = (await Institute.find({ _id: { $in: instituteIds.filter((i) => Types.ObjectId.isValid(i)) } }).select('_id').lean()).map((i) => String(i._id));
  const drives = (await Drive.find({ _id: { $in: driveIds.filter((d) => Types.ObjectId.isValid(d)) } }).select('_id').lean()).map((d) => String(d._id));
  let assigned = 0;
  for (const iId of insts) for (const dId of drives) {
    const res = await DriveAssignment.updateOne(
      { instituteId: new Types.ObjectId(iId), driveId: new Types.ObjectId(dId) },
      { $setOnInsert: { instituteId: new Types.ObjectId(iId), driveId: new Types.ObjectId(dId), createdAt: new Date() } },
      { upsert: true },
    );
    if (res.upsertedCount) assigned += 1;
  }
  return { assigned };
}
```

Then in `getInstitute`, after computing `performance`, add the count and include it in the return:
```ts
  const assignedDrives = await DriveAssignment.countDocuments({ instituteId: new Types.ObjectId(id) });
  // ...
  return { institute: inst, funnel, kpis, performance, assignedDrives };
```

- [ ] **Step 5: Run — expect PASS** — `npm test -w server -- institute-drives.service` (5 tests).
- [ ] **Step 6: Type-check** — `npx -w server tsc --noEmit`.
- [ ] **Step 7: Commit**

```bash
git add server/src/models/DriveAssignment.ts server/src/modules/institutes/institutes.service.ts server/test/institute-drives.service.test.ts
git commit -m "feat(server): DriveAssignment model + institute-drive assignment service"
```

---

## Task 2: Server — assignment controllers + routes (+ route tests)

**Files:** Modify `institutes.schemas.ts`, `institutes.controller.ts`, `institutes.routes.ts`; Test `server/test/institute-drives.route.test.ts`.

- [ ] **Step 1: Schemas** — add to `server/src/modules/institutes/institutes.schemas.ts`:
```ts
export const assignDrivesSchema = z.object({ driveIds: z.array(z.string()).default([]) });
export const bulkAssignDrivesSchema = z.object({ instituteIds: z.array(z.string()).min(1), driveIds: z.array(z.string()).min(1) });
```
(Ensure `z` is already imported in that file — it is.)

- [ ] **Step 2: Controllers** — add to `institutes.controller.ts` (import the new service fns + schemas):
```ts
export async function instituteDrivesController(req: Request, res: Response) {
  res.json(await listInstituteDrives(req.params.id));
}
export async function assignDrivesController(req: Request, res: Response) {
  res.json(await assignDrives(req.params.id, assignDrivesSchema.parse(req.body).driveIds));
}
export async function unassignDriveController(req: Request, res: Response) {
  res.json(await unassignDrive(req.params.id, req.params.driveId));
}
export async function bulkAssignDrivesController(req: Request, res: Response) {
  const { instituteIds, driveIds } = bulkAssignDrivesSchema.parse(req.body);
  res.json(await bulkAssignDrives(instituteIds, driveIds));
}
```
(Add `listInstituteDrives, assignDrives, unassignDrive, bulkAssignDrives` to the existing service import, and `assignDrivesSchema, bulkAssignDrivesSchema` to the schemas import.)

- [ ] **Step 3: Routes** — add to `institutes.routes.ts` (import the 4 new controllers). Declare `/assign-drives` alongside `/bulk` (before `/:id...`), and the `/:id/drives` routes before the bare `/:id`:
```ts
instituteRoutes.post('/assign-drives', asyncHandler(bulkAssignDrivesController));
instituteRoutes.get('/:id/drives', asyncHandler(instituteDrivesController));
instituteRoutes.post('/:id/drives', asyncHandler(assignDrivesController));
instituteRoutes.delete('/:id/drives/:driveId', asyncHandler(unassignDriveController));
```
Place the `/assign-drives` line right after the existing `post('/bulk', ...)`; place the three `/:id/drives*` lines with the other `/:id/*` sub-resource routes (before `get('/:id', ...)`). `/api/institutes` is already mounted in `app.ts` — no app change.

- [ ] **Step 4: Failing route test** — `server/test/institute-drives.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { Drive } from '../src/models/Drive.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
const mkInst = () => Institute.create({ name: 'VNR', city: 'Hyderabad', type: 'Engineering', status: 'Active', owner: 'A', email: 'a@b.io', ownershipHistory: [] });
const mkDrive = (n: string) => Drive.create({ name: n, domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });

describe('institute-drives routes', () => {
  it('401s without a token', async () => {
    const i = await mkInst();
    expect((await request(createApp()).get(`/api/institutes/${i._id}/drives`)).status).toBe(401);
  });
  it('assigns, lists (with count on detail), unassigns, bulk-assigns', async () => {
    const i = await mkInst(); const d1 = await mkDrive('FE'); const d2 = await mkDrive('BE');
    const a = await auth(request(createApp()).post(`/api/institutes/${i._id}/drives`).send({ driveIds: [String(d1._id), String(d2._id)] }));
    expect(a.status).toBe(200);
    expect(a.body.items).toHaveLength(2);
    const list = await auth(request(createApp()).get(`/api/institutes/${i._id}/drives`));
    expect(list.body.items).toHaveLength(2);
    const detail = await auth(request(createApp()).get(`/api/institutes/${i._id}`));
    expect(detail.body.assignedDrives).toBe(2);
    const del = await auth(request(createApp()).delete(`/api/institutes/${i._id}/drives/${d1._id}`));
    expect(del.body).toEqual({ deleted: true });
    expect((await auth(request(createApp()).get(`/api/institutes/${i._id}/drives`))).body.items).toHaveLength(1);
    const i2 = await mkInst();
    const bulk = await auth(request(createApp()).post('/api/institutes/assign-drives').send({ instituteIds: [String(i._id), String(i2._id)], driveIds: [String(d2._id)] }));
    expect(bulk.status).toBe(200);
    expect(bulk.body.assigned).toBe(1);   // (i,d2) already existed; only (i2,d2) is new
  });
});
```

- [ ] **Step 5: Run — expect PASS** — `npm test -w server -- institute-drives.route`.
- [ ] **Step 6: Type-check + full server suite** — `npx -w server tsc --noEmit && npm test -w server`.
- [ ] **Step 7: Commit**

```bash
git add server/src/modules/institutes/
git add server/test/institute-drives.route.test.ts
git commit -m "feat(server): institute-drive assignment routes"
```

---

## Task 3: Server — seed assignments

**Files:** Modify `server/src/seed/seed.ts`.

- [ ] **Step 1: Import + cleanup** — add `import { DriveAssignment } from '../models/DriveAssignment.js';` and add `DriveAssignment.deleteMany({})` to the `Promise.all([...])` cleanup group.
- [ ] **Step 2: Insert** — after both `institutes` and `drives` arrays are created (find where drives are inserted — search for the drives `insertMany`/`create`), and before the "Seed complete" log, add a deterministic assignment block using the existing seed PRNG (`rng`/`intBetween`/`pick`):

```ts
  // ---- Institute↔Drive assignments (each institute gets ~2–5 drives, deterministic) ----
  const assignmentDocs = [];
  for (const inst of institutes) {
    const n = intBetween(rng, 2, 5);
    const pickedIds = new Set<string>();
    for (let k = 0; k < n; k++) pickedIds.add(String(pick(rng, drives)._id));
    for (const dId of pickedIds) assignmentDocs.push({ instituteId: inst._id, driveId: dId, createdAt: spread() });
  }
  await DriveAssignment.insertMany(assignmentDocs);
```
(Use the seed's existing `institutes`, `drives`, `rng`, `intBetween`, `pick`, `spread` bindings — confirm their names in `run()` and adapt if they differ. The `Set` dedups within one institute so no duplicate pair is inserted.)

- [ ] **Step 3: Run seed** — `npm run seed -w server` (expect "Seed complete.", no throw).
- [ ] **Step 4: Type-check** — `npx -w server tsc --noEmit`.
- [ ] **Step 5: Commit**

```bash
git add server/src/seed/seed.ts
git commit -m "feat(server): seed institute-drive assignments"
```

---

## Task 4: Client — types + hooks

**Files:** Modify `client/src/types/institutes.ts`; Create `hooks/useInstituteDrives.ts`, `hooks/useDriveAssignmentMutations.ts`.

- [ ] **Step 1: Types** — in `client/src/types/institutes.ts`, add `assignedDrives: number` to `InstituteDetailResponse`, and add:
```ts
export interface AssignedDriveItem { id: string; name: string; domain: string; stream: string; status: string; month: string; }
export interface AssignedDrivesResponse { items: AssignedDriveItem[] }
```
(Add `assignedDrives: number` as a top-level field of `InstituteDetailResponse`, sibling to `institute`/`funnel`/`kpis`/`performance`.)

- [ ] **Step 2: Query hook** — `client/src/pages/Institutes/hooks/useInstituteDrives.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { AssignedDrivesResponse } from '../../../types/institutes.js';

export function useInstituteDrives(id: string | undefined) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['institute-drives', id],
    queryFn: () => apiFetch<AssignedDrivesResponse>(`/institutes/${id}/drives`, { token }),
    enabled: !!token && !!id,
  });
}
```

- [ ] **Step 3: Mutations hook** — `client/src/pages/Institutes/hooks/useDriveAssignmentMutations.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';

export function useDriveAssignmentMutations(instituteId?: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['institute-drives'] });
    qc.invalidateQueries({ queryKey: ['institute'] });
    qc.invalidateQueries({ queryKey: ['institutes'] });
  };
  const assign = useMutation({
    mutationFn: (driveIds: string[]) => apiFetch(`/institutes/${instituteId}/drives`, { method: 'POST', body: { driveIds }, token }),
    onSuccess: invalidate,
  });
  const unassign = useMutation({
    mutationFn: (driveId: string) => apiFetch(`/institutes/${instituteId}/drives/${driveId}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
  });
  const bulkAssign = useMutation({
    mutationFn: (body: { instituteIds: string[]; driveIds: string[] }) => apiFetch('/institutes/assign-drives', { method: 'POST', body, token }),
    onSuccess: invalidate,
  });
  return { assign, unassign, bulkAssign };
}
```

- [ ] **Step 4: Type-check** — `npx -w client tsc --noEmit`.
- [ ] **Step 5: Commit**

```bash
git add client/src/types/institutes.ts client/src/pages/Institutes/hooks/useInstituteDrives.ts client/src/pages/Institutes/hooks/useDriveAssignmentMutations.ts
git commit -m "feat(client): institute-drive assignment types + hooks"
```

---

## Task 5: Client — TabDrives + AssignDrivesModal + InstituteDetail wiring (+ tests)

**Files:** Create `detail/TabDrives.tsx`, `detail/AssignDrivesModal.tsx`; Modify `detail/InstituteDetail.tsx`; Test `client/src/test/TabDrives.test.tsx`, `AssignDrivesModal.test.tsx`.

**Interfaces:** `TabDrives({ instituteId })`, `AssignDrivesModal({ instituteId, onClose })`. Drive-status badge map reused from InstituteDetail's `STATUS_CLASS` idea (Active→st-active, Published→st-published, Draft→st-draft, Archived→st-archived).

- [ ] **Step 1: Failing TabDrives test** — `client/src/test/TabDrives.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { TabDrives } from '../pages/Institutes/detail/TabDrives.js';

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><TabDrives instituteId="i1" /></AuthProvider></QueryClientProvider>);
}

describe('TabDrives', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/institutes/i1/drives') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [{ id: 'd1', name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', status: 'Active', month: 'Jul 2026' }] }) });
      }
      if (url.includes('/institutes/i1/drives/d1') && method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: async () => ({ deleted: true }) });
      if (url.includes('/drives') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [], total: 0, page: 1, limit: 100 }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders assigned drives and × fires an unassign DELETE', async () => {
    renderTab();
    const user = userEvent.setup();
    expect(await screen.findByText('FE Cohort')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /unassign FE Cohort/i }));
    await waitFor(() => {
      const fm = fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fm.mock.calls.some(([u, o]) => typeof u === 'string' && u.includes('/institutes/i1/drives/d1') && (o as RequestInit | undefined)?.method === 'DELETE')).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: TabDrives.tsx** — `client/src/pages/Institutes/detail/TabDrives.tsx`:

```tsx
import { useState } from 'react';
import { useInstituteDrives } from '../hooks/useInstituteDrives.js';
import { useDriveAssignmentMutations } from '../hooks/useDriveAssignmentMutations.js';
import { AssignDrivesModal } from './AssignDrivesModal.js';

const STATUS_CLASS: Record<string, string> = { Active: 'st-active', Published: 'st-published', Draft: 'st-draft', Archived: 'st-archived' };

export function TabDrives({ instituteId }: { instituteId: string }) {
  const { data, isLoading } = useInstituteDrives(instituteId);
  const { unassign } = useDriveAssignmentMutations(instituteId);
  const [assignOpen, setAssignOpen] = useState(false);
  const items = data?.items ?? [];

  return (
    <div className="card">
      <div className="card-h">
        <h3>Assigned Drives</h3>
        <div className="grow" />
        <button className="btn btn-ghost" onClick={() => setAssignOpen(true)}><i className="ti ti-calendar-plus" /> Assign Drives</button>
      </div>
      {isLoading && <p style={{ padding: '0 18px 20px', color: 'var(--muted)' }}>Loading…</p>}
      {!isLoading && items.length === 0 && (
        <div className="dm-empty" style={{ padding: 30 }}><i className="ti ti-calendar-off" /> No drives assigned yet.</div>
      )}
      {!isLoading && items.length > 0 && (
        <div className="dm-table-wrap"><div className="dm-scroll">
          <table className="dm" style={{ minWidth: 640 }}>
            <thead><tr><th>Drive</th><th>Domain</th><th>Stream</th><th>Month</th><th>Status</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td><div className="dm-name"><b>{d.name}</b></div></td>
                  <td><span className="chip dom">{d.domain}</span></td>
                  <td><span className="chip stream">{d.stream}</span></td>
                  <td>{d.month}</td>
                  <td><span className={`badge-st ${STATUS_CLASS[d.status] ?? 'st-draft'}`}><i className="ti ti-circle-filled" /> {d.status}</span></td>
                  <td className="r"><div className="rowact"><button title="Unassign" aria-label={`Unassign ${d.name}`} onClick={() => unassign.mutate(d.id)}><i className="ti ti-x" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {assignOpen && <AssignDrivesModal instituteId={instituteId} onClose={() => setAssignOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 4: Failing AssignDrivesModal test** — `client/src/test/AssignDrivesModal.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { AssignDrivesModal } from '../pages/Institutes/detail/AssignDrivesModal.js';

const ALL_DRIVES = { items: [
  { id: 'd1', name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday', candCap: 100, empCap: 5, slotCap: 20, status: 'Active', createdBy: 'Admin', primaryEventDate: null },
  { id: 'd2', name: 'BE Cohort', domain: 'Backend', stream: 'B.Tech', month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday', candCap: 100, empCap: 5, slotCap: 20, status: 'Active', createdBy: 'Admin', primaryEventDate: null },
], total: 2, page: 1, limit: 100 };

function renderModal(onClose = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><AssignDrivesModal instituteId="i1" onClose={onClose} /></AuthProvider></QueryClientProvider>);
}

describe('AssignDrivesModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/institutes/i1/drives') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [{ id: 'd1', name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', status: 'Active', month: 'Jul 2026' }] }) });
      if (url.includes('/drives') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ALL_DRIVES });
      if (url.includes('/institutes/i1/drives') && method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [] }) });
      if (url.includes('/institutes/i1/drives/d1') && method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: async () => ({ deleted: true }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('pre-checks current assignments and Save diffs (assign added, unassign removed)', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    // d1 currently assigned → its checkbox is checked; d2 unchecked
    const d1 = await screen.findByRole('checkbox', { name: /FE Cohort/i });
    const d2 = screen.getByRole('checkbox', { name: /BE Cohort/i });
    expect(d1).toBeChecked();
    expect(d2).not.toBeChecked();
    // uncheck d1 (→ unassign), check d2 (→ assign)
    await user.click(d1);
    await user.click(d2);
    await user.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fm = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fm.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/institutes/i1/drives') && (o as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ driveIds: ['d2'] });   // added
    expect(fm.mock.calls.some(([u, o]) => typeof u === 'string' && u.includes('/institutes/i1/drives/d1') && (o as RequestInit | undefined)?.method === 'DELETE')).toBe(true);  // removed
  });
});
```

- [ ] **Step 5: Run — expect FAIL**.

- [ ] **Step 6: AssignDrivesModal.tsx** — `client/src/pages/Institutes/detail/AssignDrivesModal.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useDrives } from '../../Drives/hooks/useDrives.js';
import { useInstituteDrives } from '../hooks/useInstituteDrives.js';
import { useDriveAssignmentMutations } from '../hooks/useDriveAssignmentMutations.js';

export function AssignDrivesModal({ instituteId, onClose }: { instituteId: string; onClose: () => void }) {
  const { data: allDrives } = useDrives({ page: 1, limit: 100 });
  const { data: current } = useInstituteDrives(instituteId);
  const { assign, unassign } = useDriveAssignmentMutations(instituteId);
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState<Set<string> | null>(null);

  const initial = useMemo(() => new Set((current?.items ?? []).map((d) => d.id)), [current]);
  const sel = checked ?? initial;   // start from current assignments once loaded
  const drives = (allDrives?.items ?? []).filter((d) => (d.name + ' ' + d.domain).toLowerCase().includes(q.trim().toLowerCase()));

  function toggle(id: string) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
  }
  async function save() {
    const added = [...sel].filter((id) => !initial.has(id));
    const removed = [...initial].filter((id) => !sel.has(id));
    if (added.length) await assign.mutateAsync(added);
    await Promise.all(removed.map((id) => unassign.mutateAsync(id)));
    onClose();
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="adTitle" style={{ maxWidth: 560 }}>
        <div className="modal-h"><div><h3 id="adTitle">Assign Drives</h3><p>Select the drives this institute participates in.</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button></div>
        <div className="modal-b" style={{ gridTemplateColumns: '1fr' }}>
          <div className="dm-search"><i className="ti ti-search" /><input placeholder="Search drives…" aria-label="Search drives" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ maxHeight: '46vh', overflowY: 'auto', marginTop: 10 }}>
            {drives.map((d) => (
              <label key={d.id} className="asmt-row" style={{ cursor: 'pointer' }}>
                <div className="an"><b>{d.name}</b><span>{d.domain} · {d.stream} · {d.status}</span></div>
                <input type="checkbox" aria-label={d.name} checked={sel.has(d.id)} onChange={() => toggle(d.id)} />
              </label>
            ))}
            {drives.length === 0 && <div className="dm-empty" style={{ padding: 20 }}>No drives match.</div>}
          </div>
        </div>
        <div className="modal-f"><div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save}><i className="ti ti-device-floppy" /> Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run — expect PASS** — `npm test -w client -- TabDrives AssignDrivesModal`.

- [ ] **Step 8: Wire InstituteDetail** — in `client/src/pages/Institutes/detail/InstituteDetail.tsx`:
  - Replace the `TabDrivesComingSoon` import with `import { TabDrives } from './TabDrives.js';`.
  - Replace `{activeTab === 'drives' && <TabDrivesComingSoon />}` with `{activeTab === 'drives' && <TabDrives instituteId={institute._id} />}`.
  - Destructure `assignedDrives`: `const { institute, funnel, kpis, performance, assignedDrives } = data;`.
  - Replace the hardcoded `<span><i className="ti ti-calendar-event" /> 0 drives</span>` (and its comment) with `<span><i className="ti ti-calendar-event" /> {assignedDrives} drive{assignedDrives === 1 ? '' : 's'}</span>`.
  - Add modal state `const [assignOpen, setAssignOpen] = useState(false);` and enable the header button: change the disabled "Assign Drives" button to `<button className="btn btn-ghost" onClick={() => setAssignOpen(true)}><i className="ti ti-calendar-plus" /> Assign Drives</button>`, and render `{assignOpen && <AssignDrivesModal instituteId={institute._id} onClose={() => setAssignOpen(false)} />}` inside the content. Import `AssignDrivesModal`.

- [ ] **Step 9: Type-check + client tests** — `npx -w client tsc --noEmit && npm test -w client -- TabDrives AssignDrivesModal`.
- [ ] **Step 10: Commit**

```bash
git add client/src/pages/Institutes/detail/TabDrives.tsx client/src/pages/Institutes/detail/AssignDrivesModal.tsx client/src/pages/Institutes/detail/InstituteDetail.tsx client/src/test/TabDrives.test.tsx client/src/test/AssignDrivesModal.test.tsx
git commit -m "feat(client): Drives tab + Assign Drives modal + institute detail wiring"
```

---

## Task 6: Client — bulk assign (+ test)

**Files:** Create `pages/Institutes/BulkAssignDrivesModal.tsx`; Modify `pages/Institutes/BulkBar.tsx`, `pages/Institutes/index.tsx`; Test `client/src/test/BulkAssignDrives.test.tsx`.

- [ ] **Step 1: BulkBar** — in `client/src/pages/Institutes/BulkBar.tsx`, add `onAssignDrives: () => void;` to `BulkBarProps`, and change the disabled Assign-Drives button to `<button className="bb" onClick={onAssignDrives}><i className="ti ti-calendar-plus" /> Assign Drives</button>`.

- [ ] **Step 2: Failing bulk test** — `client/src/test/BulkAssignDrives.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { BulkAssignDrivesModal } from '../pages/Institutes/BulkAssignDrivesModal.js';

const ALL_DRIVES = { items: [
  { id: 'd1', name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday', candCap: 1, empCap: 1, slotCap: 1, status: 'Active', createdBy: 'A', primaryEventDate: null },
], total: 1, page: 1, limit: 100 };

function renderModal(onClose = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><BulkAssignDrivesModal instituteIds={['i1', 'i2']} onClose={onClose} /></AuthProvider></QueryClientProvider>);
}

describe('BulkAssignDrivesModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/drives') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ALL_DRIVES });
      if (url.includes('/institutes/assign-drives') && method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ assigned: 2 }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('assigns the checked drives to all selected institutes', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /FE Cohort/i }));
    await user.click(screen.getByRole('button', { name: /Assign to 2 institutes/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fm = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fm.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/institutes/assign-drives') && (o as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ instituteIds: ['i1', 'i2'], driveIds: ['d1'] });
  });
});
```

- [ ] **Step 3: Run — expect FAIL**.

- [ ] **Step 4: BulkAssignDrivesModal.tsx** — `client/src/pages/Institutes/BulkAssignDrivesModal.tsx` (assign-only, none pre-checked):

```tsx
import { useMemo, useState } from 'react';
import { useDrives } from '../Drives/hooks/useDrives.js';
import { useDriveAssignmentMutations } from './hooks/useDriveAssignmentMutations.js';

export function BulkAssignDrivesModal({ instituteIds, onClose }: { instituteIds: string[]; onClose: () => void }) {
  const { data: allDrives } = useDrives({ page: 1, limit: 100 });
  const { bulkAssign } = useDriveAssignmentMutations();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const drives = useMemo(() => (allDrives?.items ?? []).filter((d) => (d.name + ' ' + d.domain).toLowerCase().includes(q.trim().toLowerCase())), [allDrives, q]);

  function toggle(id: string) { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); }
  async function save() {
    if (sel.size) await bulkAssign.mutateAsync({ instituteIds, driveIds: [...sel] });
    onClose();
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="baTitle" style={{ maxWidth: 560 }}>
        <div className="modal-h"><div><h3 id="baTitle">Assign Drives</h3><p>Assign to {instituteIds.length} selected institute{instituteIds.length === 1 ? '' : 's'}.</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button></div>
        <div className="modal-b" style={{ gridTemplateColumns: '1fr' }}>
          <div className="dm-search"><i className="ti ti-search" /><input placeholder="Search drives…" aria-label="Search drives" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ maxHeight: '46vh', overflowY: 'auto', marginTop: 10 }}>
            {drives.map((d) => (
              <label key={d.id} className="asmt-row" style={{ cursor: 'pointer' }}>
                <div className="an"><b>{d.name}</b><span>{d.domain} · {d.stream} · {d.status}</span></div>
                <input type="checkbox" aria-label={d.name} checked={sel.has(d.id)} onChange={() => toggle(d.id)} />
              </label>
            ))}
            {drives.length === 0 && <div className="dm-empty" style={{ padding: 20 }}>No drives match.</div>}
          </div>
        </div>
        <div className="modal-f"><div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save}><i className="ti ti-device-floppy" /> Assign to {instituteIds.length} institute{instituteIds.length === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run — expect PASS** — `npm test -w client -- BulkAssignDrives`.

- [ ] **Step 6: Wire InstitutesPage** — in `client/src/pages/Institutes/index.tsx`: import `BulkAssignDrivesModal`; add `const [bulkAssignOpen, setBulkAssignOpen] = useState(false);`; pass `onAssignDrives={() => setBulkAssignOpen(true)}` to `<BulkBar .../>`; render `{bulkAssignOpen && <BulkAssignDrivesModal instituteIds={[...selected]} onClose={() => setBulkAssignOpen(false)} />}` (use the page's existing selected-ids set/array — match its current variable name; clear selection on close if that's the page's pattern).

- [ ] **Step 7: Type-check + full client suite** — `npx -w client tsc --noEmit && npm test -w client`.
- [ ] **Step 8: Commit**

```bash
git add client/src/pages/Institutes/BulkAssignDrivesModal.tsx client/src/pages/Institutes/BulkBar.tsx client/src/pages/Institutes/index.tsx client/src/test/BulkAssignDrives.test.tsx
git commit -m "feat(client): bulk assign drives from the institutes list"
```

---

## Task 7: Full-suite verification + live E2E smoke

**Files:** none (verification only).

- [ ] **Step 1: Full suites** — `npm test -w server && npm test -w client`.
- [ ] **Step 2: Type-check both + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Re-seed + live smoke** (controller, fresh admin token):
  - Re-seed; pick an institute id. `GET /api/institutes/:id` → `assignedDrives` matches `GET /api/institutes/:id/drives` items length (both non-zero from seed).
  - `POST /api/institutes/:id/drives {driveIds:[<a drive id>]}` twice → count increments once (idempotent).
  - `DELETE /api/institutes/:id/drives/:driveId` → `{deleted:true}`, count drops.
  - `POST /api/institutes/assign-drives {instituteIds:[a,b], driveIds:[x]}` → `{assigned:n}`; re-run → `{assigned:0}`.
  - Confirm `assignedDrives` on the detail equals the drives-list length after each step.
- [ ] **Step 4: No commit** (verification task).

---

## Self-Review Notes (author)

- **Spec coverage:** DriveAssignment collection + unique index → T1; nested API (list/assign/unassign/bulk) → T1/T2; real `assignedDrives` on detail → T1; seed → T3; Drives tab + Assign modal + detail count/button → T4/T5; bulk assign → T6; E2E → T7.
- **Deviation from spec §4 (transparent):** `assignedDrives` is added to the **detail DTO only**, not the list DTO — the institutes list/table has no drives column to display it, so a list-item field would be dead data (YAGNI). Easy to add later with a list aggregation if a column is introduced.
- **Idempotency** is enforced via `updateOne(pair, {$setOnInsert}, {upsert:true})` (assign/bulk) and `deleteOne` (unassign) — all safe to repeat; the unique index is the DB guard (tested via a raw duplicate `create` after `DriveAssignment.init()`).
- **assignedDrives is a live count** (`countDocuments`), never stored — the anti-faked-stat principle this slice exists to establish.
- **Modal semantics:** `AssignDrivesModal` (single institute) diffs against current assignments (assign added / unassign removed); `BulkAssignDrivesModal` (multi-institute) is assign-only/additive. Both reuse `useDrives({limit:100})` for the drive list and the `.asmt-row`/`.modal` classes already in theme.css.
- **Type consistency:** `AssignedDriveItem`/`AssignedDrivesResponse` defined once in `types/institutes.ts`; server `AssignedDriveItem` mirrors it; the mutation hook invalidates `['institute-drives']`, `['institute']`, `['institutes']` so the tab, detail count, and list all refresh.
- **Kebab/positioning n/a** — no kebab here; the unassign × is a plain row-action button.
- **Open item for the implementer (T6):** `InstitutesPage` (`index.tsx`) owns the selection state under an existing variable — the implementer must read that file and pass the correct selected-ids collection to `BulkAssignDrivesModal` and wire `onAssignDrives`; the plan can't name the variable without the file open.
