# Streams Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Streams area — a versioned CRUD table of hiring streams (`/streams`, new `Stream` collection) and a global singleton settings page (`/streams/rules`, new `StreamRules` collection) — faithful to `matchday-admin-app_23.html` (Stream Config 1439–1504 + runtime 2992–3147; Selection Rules 1711–1781 + runtime 3149–3190).

**Architecture:** New `Stream` Mongoose collection + `/api/streams` REST module mirroring the templates module's versioning (bumpVersion, versions[], restore). New `StreamRules` singleton collection + `/api/stream-rules` (GET creates-from-defaults, PUT upserts). React pages under `client/src/pages/Streams/` mirroring the Templates/Evaluations shells. The Command Center is NOT modified. This branch is stacked on `feat/evaluations-module`.

**Tech Stack:** Express 4 + Mongoose 8 + zod (server, TS strict, ESM `.js`); React 18 + Vite + react-router-dom 6 + @tanstack/react-query 5 (client); Vitest + supertest + mongodb-memory-server (server tests); Vitest + RTL + jsdom (client).

## Global Constraints

- **Error contract:** `{ error: { message, code } }`. zod → 400 `validation`; not-found → 404 `not_found`; missing/invalid token → 401. Copy from the templates/eval-configs modules.
- **ESM:** every relative import ends in `.js`. `"strict": true` — no implicit `any`.
- **`tsc --noEmit` MUST pass** each task (`npx -w server tsc --noEmit` / `npx -w client tsc --noEmit`).
- **No `timestamps: true`** — explicit `createdAt`/`updatedAt`.
- **`parent`/`status` enums baked at the model** (matches Slot/DriveTemplate precedent); zod is the API source of truth. Enum values verbatim — parent: `Engineering`, `Data Science`, `Business`, `Design`, `Product`; status: `Active`, `Disabled`; flow: `MCQ`, `Coding`, `TARA`, `Assignment`.
- **Version rule (prototype-exact):** `bumpVersion` increments the minor component (identical to Templates). Create → v1.0 + `{note:'Initial stream'}`. A PATCH that contains **any config field other than `status` alone** bumps + prepends `{note:'Edited stream configuration'}`; a **status-only** PATCH does NOT bump. Restore → bump + `{note:'Restored v{v}'}`, sections NOT rolled back (ledger-only). Actor = `'Platform Admin'`.
- **`flow` canonical order:** always reorder to `MCQ→Coding→TARA→Assignment` on every write (`orderedFlow`).
- **PATCH clobber guard:** `updateStreamSchema` is an explicit all-optional shape (NOT `.partial()` of the defaulted base) — learned from eval-configs.
- **`StreamRules` is a singleton:** exactly one doc; GET creates it from `SR_DEFAULTS` if absent; PUT upserts. Reset = the client PUT-ing `SR_DEFAULTS`.
- **No delete, no clone** for streams (the prototype offers neither).
- **Faithful CSS:** reuse prototype classes already in `client/src/styles/theme.css` (confirmed present). Streams table: `.dm-table-wrap`/`.dm-scroll`/`.dm`/`.dm-name`/`.skill-pill`/`.vbadge`/`.badge-st`/`.st-active`/`.st-archived`/`.rowact`/`.kebab-menu`/`.chip.stream`/`.cap`/`.dm-pager`/`.pinfo`/`.sortable`/`.sa`/`.sorted`. Editor: `.modal.wide`/`.se-grid`/`.fld`(+`.full`)/`.taginput`/`.tag`(+`.gh`)/`.flow-chips`/`.chipc`(+`.on`)/`.arr`/`.cutoff-row`/`.cv`/`.schips`/`.fnote`/`.modal-h`/`.modal-f`/`.x`. Rules: `.backlink`/`.sr-summary`/`.lab`/`.hl`/`.set-card`/`.sc-h`/`.sic`(+`.i-*`)/`.set-body`/`.set-row`(+`.disabled`)/`.sl`/`.sc`/`.pick`/`.opt`(+`.on`)/`.switch`(+`.on`)/`.rv`/`.sr-foot`/`.sr-dirty`(+`.show`). No new CSS.

---

## File Structure

```
server/src/
  models/Stream.ts  models/StreamRules.ts                                   # T1/T3
  modules/streams/      streams.schemas.ts service.ts controller.ts routes.ts   # T1/T2
  modules/streamRules/  stream-rules.schemas.ts service.ts controller.ts routes.ts  # T3
  app.ts                                                                     # T2+T3 (mount)
  seed/seed.ts                                                               # T4
server/test/
  streams.service.test.ts streams.route.test.ts                             # T1/T2
  stream-rules.service.test.ts stream-rules.route.test.ts                    # T3
client/src/
  types/streams.ts                                                          # T5
  pages/Streams/
    streamsConstants.ts                                                     # T5
    rules/streamRulesUtils.ts                                               # T5
    hooks/useStreams.ts useStreamMutations.ts useStreamRules.ts useStreamRulesMutation.ts  # T5
    StreamEditorModal.tsx                                                   # T6
    StreamTable.tsx StreamVersionHistoryModal.tsx index.tsx                 # T7
    rules/StreamRulesPage.tsx                                               # T8
  App.tsx components/Sidebar.tsx                                            # T7 (route+nav) + T8 (rules route)
client/src/test/
  streamRulesUtils.test.ts                                                  # T5
  StreamEditor.test.tsx                                                     # T6
  StreamTable.test.tsx                                                      # T7
  StreamRules.test.tsx                                                      # T8
```

---

## Task 1: Server — Stream model, schemas, service (+ service tests)

**Files:** Create `server/src/models/Stream.ts`, `server/src/modules/streams/streams.schemas.ts`, `server/src/modules/streams/service.ts`; Test `server/test/streams.service.test.ts`.

**Interfaces:** Produces (used by T2): `bumpVersion`, `codeFor`, `orderedFlow`, and async `listStreams`, `createStream`, `getStream`, `updateStream`, `restoreStream`; zod `createStreamSchema`, `updateStreamSchema`, `restoreSchema`, `listQuerySchema`; `StreamItem`, `CreateStreamInput`, `UpdateStreamInput`; consts `PARENTS`, `ALL_FLOW`.

- [ ] **Step 1: Model** — `server/src/models/Stream.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const versionSchema = new Schema(
  { v: { type: String, required: true }, date: { type: Date, required: true }, by: { type: String, required: true }, note: { type: String, default: '' } },
  { _id: false },
);

const streamSchema = new Schema({
  name: { type: String, required: true },
  parent: { type: String, enum: ['Engineering', 'Data Science', 'Business', 'Design', 'Product'], default: 'Engineering' },
  label: { type: String, default: '' },
  skills: { type: [String], default: [] },
  good: { type: [String], default: [] },
  flow: { type: [String], default: [] },
  cutoff: { type: Number, default: 65 },
  cgpa: { type: Number, default: 6.5 },
  backlogs: { type: Number, default: 1 },
  grad: { type: [String], default: [] },
  branches: { type: [String], default: [] },
  sources: { type: [String], default: [] },
  status: { type: String, enum: ['Active', 'Disabled'], default: 'Active' },
  version: { type: String, default: '1.0' },
  versions: { type: [versionSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export type StreamDoc = InferSchemaType<typeof streamSchema>;
export const Stream = model('Stream', streamSchema);
```

- [ ] **Step 2: Schemas** — `server/src/modules/streams/streams.schemas.ts`:

```ts
import { z } from 'zod';

export const PARENTS = ['Engineering', 'Data Science', 'Business', 'Design', 'Product'] as const;
export const ALL_FLOW = ['MCQ', 'Coding', 'TARA', 'Assignment'] as const;

export const createStreamSchema = z.object({
  name: z.string().trim().min(1),
  parent: z.enum(PARENTS),
  label: z.string().trim().default(''),
  skills: z.array(z.string().trim().min(1)).default([]),
  good: z.array(z.string().trim().min(1)).default([]),
  flow: z.array(z.enum(ALL_FLOW)).default([]),
  cutoff: z.coerce.number().int().min(0).max(100).default(65),
  cgpa: z.coerce.number().min(0).max(10).default(6.5),
  backlogs: z.coerce.number().int().min(0).default(1),
  grad: z.array(z.string()).default([]),
  branches: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  status: z.enum(['Active', 'Disabled']).default('Active'),
});

// Explicit all-optional (NOT .partial() of the defaulted base — that would inject defaults on
// omitted PATCH keys and clobber stored data).
export const updateStreamSchema = z.object({
  name: z.string().trim().min(1).optional(),
  parent: z.enum(PARENTS).optional(),
  label: z.string().trim().optional(),
  skills: z.array(z.string().trim().min(1)).optional(),
  good: z.array(z.string().trim().min(1)).optional(),
  flow: z.array(z.enum(ALL_FLOW)).optional(),
  cutoff: z.coerce.number().int().min(0).max(100).optional(),
  cgpa: z.coerce.number().min(0).max(10).optional(),
  backlogs: z.coerce.number().int().min(0).optional(),
  grad: z.array(z.string()).optional(),
  branches: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  status: z.enum(['Active', 'Disabled']).optional(),
});

export const restoreSchema = z.object({ v: z.string().trim().min(1) });
export const listQuerySchema = z.object({
  q: z.string().optional(),
  parent: z.string().optional(),
  status: z.string().optional(),
  sort: z.enum(['name', 'parent', 'cutoff']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type CreateStreamInput = z.infer<typeof createStreamSchema>;
export type UpdateStreamInput = z.infer<typeof updateStreamSchema>;
```

- [ ] **Step 3: Failing service test** — `server/test/streams.service.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Stream } from '../src/models/Stream.js';
import {
  bumpVersion, codeFor, orderedFlow, listStreams, createStream,
  getStream, updateStream, restoreStream,
} from '../src/modules/streams/service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const input = (over: Record<string, unknown> = {}) => ({
  name: 'Frontend Engineering', parent: 'Engineering' as const, label: 'Frontend Developer',
  skills: ['React'], good: ['Next.js'], flow: ['TARA', 'MCQ', 'Coding'] as ('MCQ'|'Coding'|'TARA'|'Assignment')[],
  cutoff: 65, cgpa: 6.5, backlogs: 1, grad: ['2025'], branches: ['CSE'], sources: ['Institutes'], status: 'Active' as const, ...over,
});

describe('streams.service', () => {
  it('bumpVersion increments minor; orderedFlow canonicalizes', () => {
    expect(bumpVersion('1.3')).toBe('1.4');
    expect(orderedFlow(['TARA', 'MCQ', 'Coding'])).toEqual(['MCQ', 'Coding', 'TARA']);
    expect(codeFor('64b000000000000000000abc')).toBe('STR-ABC');
  });

  it('creates at v1.0 with an initial entry and canonical flow', async () => {
    const s = await createStream(input());
    expect(s.version).toBe('1.0');
    expect(s.versions).toHaveLength(1);
    expect(s.versions[0]).toMatchObject({ v: '1.0', by: 'Platform Admin', note: 'Initial stream' });
    expect(s.flow).toEqual(['MCQ', 'Coding', 'TARA']);   // canonicalized on create
  });

  it('lists with q/parent/status filters and sorts by cutoff', async () => {
    await createStream(input({ name: 'Alpha', parent: 'Engineering', cutoff: 60 }));
    await createStream(input({ name: 'Beta', parent: 'Business', cutoff: 80, status: 'Disabled' }));
    expect((await listStreams({})).items).toHaveLength(2);
    expect((await listStreams({ parent: 'Business' })).items).toHaveLength(1);
    expect((await listStreams({ status: 'Disabled' })).items).toHaveLength(1);
    expect((await listStreams({ q: 'alpha' })).items).toHaveLength(1);
    const byCutoffDesc = await listStreams({ sort: 'cutoff', order: 'desc' });
    expect(byCutoffDesc.items[0].name).toBe('Beta');   // cutoff 80 first
    expect(byCutoffDesc.items[0].code).toMatch(/^STR-[0-9A-F]{3}$/);
  });

  it('PATCH with a config field bumps + logs; status-only does NOT bump', async () => {
    const s = await createStream(input());
    const edited = await updateStream(String(s._id), { cutoff: 70 });
    expect(edited.version).toBe('1.1');
    expect(edited.versions[0].note).toBe('Edited stream configuration');
    const toggled = await updateStream(String(s._id), { status: 'Disabled' });
    expect(toggled.version).toBe('1.1');            // unchanged
    expect(toggled.versions).toHaveLength(2);       // no new entry
    expect(toggled.status).toBe('Disabled');
    // flow re-canonicalized on edit
    const reflowed = await updateStream(String(s._id), { flow: ['Assignment', 'MCQ'] });
    expect(reflowed.flow).toEqual(['MCQ', 'Assignment']);
  });

  it('restores an older version: bump + "Restored v{v}"; unknown v → 400', async () => {
    const s = await createStream(input());
    await updateStream(String(s._id), { cutoff: 70 });   // v1.1
    const restored = await restoreStream(String(s._id), '1.0');
    expect(restored.version).toBe('1.2');
    expect(restored.versions[0].note).toBe('Restored v1.0');
    await expect(restoreStream(String(s._id), '9.9')).rejects.toMatchObject({ status: 400, code: 'validation' });
  });

  it('404s on unknown/malformed ids', async () => {
    await expect(getStream('64b000000000000000000000')).rejects.toThrow();
    await expect(getStream('nope')).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run — expect FAIL** — `npm test -w server -- streams.service`.

- [ ] **Step 5: Service** — `server/src/modules/streams/service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Stream, type StreamDoc } from '../../models/Stream.js';
import { ALL_FLOW, type CreateStreamInput, type UpdateStreamInput } from './streams.schemas.js';

const ACTOR = 'Platform Admin';

export interface StreamItem {
  id: string; code: string; name: string; parent: string; label: string;
  skills: string[]; good: string[]; flow: string[]; cutoff: number; cgpa: number; backlogs: number;
  grad: string[]; branches: string[]; sources: string[]; status: string;
  version: string; versions: { v: string; date: string; by: string; note: string }[];
  createdAt: string; updatedAt: string;
}

export function bumpVersion(v: string): string {
  const parts = v.split('.').map(Number);
  parts[1] = (parts[1] || 0) + 1;
  return parts.join('.');
}
export function codeFor(id: unknown): string { return `STR-${String(id).slice(-3).toUpperCase()}`; }
export function orderedFlow(flow: string[]): string[] { return ALL_FLOW.filter((f) => flow.includes(f)); }
function assertId(id: string) { if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Stream not found', 'not_found'); }

function toItem(d: StreamDoc & { _id: unknown }): StreamItem {
  return {
    id: String(d._id), code: codeFor(d._id), name: d.name, parent: d.parent ?? 'Engineering', label: d.label ?? '',
    skills: d.skills ?? [], good: d.good ?? [], flow: d.flow ?? [], cutoff: d.cutoff ?? 0, cgpa: d.cgpa ?? 0, backlogs: d.backlogs ?? 0,
    grad: d.grad ?? [], branches: d.branches ?? [], sources: d.sources ?? [], status: d.status ?? 'Active',
    version: d.version ?? '1.0',
    versions: (d.versions ?? []).map((v) => ({ v: v.v, date: new Date(v.date).toISOString(), by: v.by, note: v.note ?? '' })),
    createdAt: new Date(d.createdAt as Date).toISOString(), updatedAt: new Date(d.updatedAt as Date).toISOString(),
  };
}

export async function listStreams(params: { q?: string; parent?: string; status?: string; sort?: string; order?: string }) {
  const match: Record<string, unknown> = {};
  if (params.parent) match.parent = params.parent;
  if (params.status) match.status = params.status;
  if (params.q && params.q.trim()) {
    const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { parent: rx }, { label: rx }, { skills: rx }];
  }
  const key = (params.sort === 'parent' || params.sort === 'cutoff') ? params.sort : 'name';
  const dir = params.order === 'desc' ? -1 : 1;
  const rows = await Stream.find(match).collation({ locale: 'en', strength: 2 }).sort({ [key]: dir }).lean();
  return { items: rows.map((r) => toItem(r as never)) };
}

export async function createStream(input: CreateStreamInput) {
  const now = new Date();
  return Stream.create({
    ...input, flow: orderedFlow(input.flow), version: '1.0',
    versions: [{ v: '1.0', date: now, by: ACTOR, note: 'Initial stream' }], createdAt: now, updatedAt: now,
  });
}
export async function getStream(id: string) {
  assertId(id);
  const s = await Stream.findById(id);
  if (!s) throw new HttpError(404, 'Stream not found', 'not_found');
  return s;
}
export async function updateStream(id: string, patch: UpdateStreamInput) {
  const s = await getStream(id);
  const configKeys = Object.keys(patch).filter((k) => k !== 'status');
  if (patch.flow !== undefined) patch = { ...patch, flow: orderedFlow(patch.flow) as UpdateStreamInput['flow'] };
  Object.assign(s, patch);
  if (configKeys.length > 0) {
    const nv = bumpVersion(s.version ?? '1.0');
    s.version = nv;
    s.versions.unshift({ v: nv, date: new Date(), by: ACTOR, note: 'Edited stream configuration' });
  }
  s.updatedAt = new Date();
  await s.save();
  return s;
}
export async function restoreStream(id: string, v: string) {
  const s = await getStream(id);
  if (!(s.versions ?? []).some((e) => e.v === v)) throw new HttpError(400, `Unknown version ${v}`, 'validation');
  const nv = bumpVersion(s.version ?? '1.0');
  s.version = nv;
  s.versions.unshift({ v: nv, date: new Date(), by: ACTOR, note: `Restored v${v}` });
  s.updatedAt = new Date();
  await s.save();
  return s;
}
```

- [ ] **Step 6: Run — expect PASS** — `npm test -w server -- streams.service` (6 tests).
- [ ] **Step 7: Type-check** — `npx -w server tsc --noEmit`.
- [ ] **Step 8: Commit**

```bash
git add server/src/models/Stream.ts server/src/modules/streams/streams.schemas.ts server/src/modules/streams/service.ts server/test/streams.service.test.ts
git commit -m "feat(server): Stream model, schemas, and streams service"
```

---

## Task 2: Server — streams controller, routes, mount (+ route tests)

**Files:** Create `server/src/modules/streams/controller.ts`, `routes.ts`; Modify `server/src/app.ts`; Test `server/test/streams.route.test.ts`.

**Interfaces:** Consumes T1 service + schemas. `POST /` → 201; others → 200. No DELETE.

- [ ] **Step 1: Controller** — `server/src/modules/streams/controller.ts`:

```ts
import type { Request, Response } from 'express';
import { createStreamSchema, updateStreamSchema, restoreSchema, listQuerySchema } from './streams.schemas.js';
import { listStreams, getStream, createStream, updateStream, restoreStream } from './service.js';

export async function listController(req: Request, res: Response) {
  res.json(await listStreams(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createStream(createStreamSchema.parse(req.body)));
}
export async function getController(req: Request, res: Response) {
  res.json(await getStream(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateStream(req.params.id, updateStreamSchema.parse(req.body)));
}
export async function restoreController(req: Request, res: Response) {
  res.json(await restoreStream(req.params.id, restoreSchema.parse(req.body).v));
}
```

- [ ] **Step 2: Routes** — `server/src/modules/streams/routes.ts` (sub-path before bare `/:id`):

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { listController, createController, getController, patchController, restoreController } from './controller.js';

export const streamRoutes = Router();
streamRoutes.use(requireAuth);
streamRoutes.get('/', asyncHandler(listController));
streamRoutes.post('/', asyncHandler(createController));
streamRoutes.post('/:id/restore', asyncHandler(restoreController));
streamRoutes.get('/:id', asyncHandler(getController));
streamRoutes.patch('/:id', asyncHandler(patchController));
```

- [ ] **Step 3: Mount** — in `server/src/app.ts` add the import and the mount after `evalMonitorRoutes` (before `errorHandler`):
```ts
import { streamRoutes } from './modules/streams/routes.js';
```
```ts
  app.use('/api/streams', streamRoutes);
```

- [ ] **Step 4: Failing route test** — `server/test/streams.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
const body = { name: 'Frontend Engineering', parent: 'Engineering', label: 'Frontend Developer', skills: ['React'], flow: ['TARA', 'MCQ'], cutoff: 65 };

describe('streams routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/streams')).status).toBe(401);
  });
  it('creates (201, canonical flow, v1.0), lists, edits (bump), restores; 400 bad parent; 404 unknown', async () => {
    const c = await auth(request(createApp()).post('/api/streams').send(body));
    expect(c.status).toBe(201);
    expect(c.body.version).toBe('1.0');
    expect(c.body.flow).toEqual(['MCQ', 'TARA']);         // canonicalized
    const id = c.body._id;
    const list = await auth(request(createApp()).get('/api/streams?parent=Engineering'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].code).toMatch(/^STR-/);
    const edited = await auth(request(createApp()).patch(`/api/streams/${id}`).send({ cutoff: 80 }));
    expect(edited.body.version).toBe('1.1');
    const restored = await auth(request(createApp()).post(`/api/streams/${id}/restore`).send({ v: '1.0' }));
    expect(restored.body.version).toBe('1.2');
    expect(restored.body.versions[0].note).toBe('Restored v1.0');
    const bad = await auth(request(createApp()).post('/api/streams').send({ ...body, parent: 'Nope' }));
    expect(bad.status).toBe(400);
    const miss = await auth(request(createApp()).get('/api/streams/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run — expect PASS** — `npm test -w server -- streams.route`.
- [ ] **Step 6: Type-check + full server suite** — `npx -w server tsc --noEmit && npm test -w server`.
- [ ] **Step 7: Commit**

```bash
git add server/src/modules/streams/controller.ts server/src/modules/streams/routes.ts server/src/app.ts server/test/streams.route.test.ts
git commit -m "feat(server): streams controller, routes, and /api/streams mount"
```

---

## Task 3: Server — StreamRules model, schemas, service, routes (+ tests)

**Files:** Create `server/src/models/StreamRules.ts`, `server/src/modules/streamRules/stream-rules.schemas.ts`, `service.ts`, `controller.ts`, `routes.ts`; Modify `server/src/app.ts`; Test `server/test/stream-rules.service.test.ts`, `stream-rules.route.test.ts`.

**Interfaces:** Produces `SR_DEFAULTS`, `getStreamRules()`, `saveStreamRules(input)`, `streamRulesSchema`, `streamRulesRoutes`. GET → 200; PUT → 200.

- [ ] **Step 1: Model** — `server/src/models/StreamRules.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const streamRulesSchema = new Schema({
  numAllowed: { type: String, default: '2' },
  requirePrimary: { type: Boolean, default: true },
  defaultPrimary: { type: String, default: 'First selected stream' },
  allowSecondary: { type: Boolean, default: true },
  maxSecondary: { type: Number, default: 2 },
  changePolicy: { type: String, default: 'Before evaluation only' },
  cooldown: { type: Number, default: 14 },
  reuseEval: { type: Boolean, default: true },
  reuseScope: { type: String, default: 'Same domain only' },
  validityDays: { type: Number, default: 90 },
  validityExpires: { type: Boolean, default: true },
  autoSuggest: { type: Boolean, default: true },
  suggestBasis: { type: String, default: 'Skills + evaluations' },
  confidence: { type: Number, default: 70 },
  updatedAt: { type: Date, default: Date.now },
});

export type StreamRulesDoc = InferSchemaType<typeof streamRulesSchema>;
export const StreamRules = model('StreamRules', streamRulesSchema);
```

- [ ] **Step 2: Schemas** — `server/src/modules/streamRules/stream-rules.schemas.ts`:

```ts
import { z } from 'zod';

export const streamRulesSchema = z.object({
  numAllowed: z.enum(['1', '2', '3', 'Unlimited']),
  requirePrimary: z.boolean(),
  defaultPrimary: z.string(),
  allowSecondary: z.boolean(),
  maxSecondary: z.coerce.number().int().min(0).max(5),
  changePolicy: z.enum(['Anytime', 'Before evaluation only', 'Requires admin approval', 'Locked after drive assignment']),
  cooldown: z.coerce.number().int().min(0).max(365),
  reuseEval: z.boolean(),
  reuseScope: z.enum(['Any stream', 'Same domain only', 'Exact match only']),
  validityDays: z.coerce.number().int().min(1).max(720),
  validityExpires: z.boolean(),
  autoSuggest: z.boolean(),
  suggestBasis: z.enum(['Skills', 'Past evaluations', 'Skills + evaluations']),
  confidence: z.coerce.number().int().min(0).max(100),
});
export type StreamRulesInput = z.infer<typeof streamRulesSchema>;
```

- [ ] **Step 3: Failing service test** — `server/test/stream-rules.service.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { StreamRules } from '../src/models/StreamRules.js';
import { SR_DEFAULTS, getStreamRules, saveStreamRules } from '../src/modules/streamRules/service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('streamRules.service', () => {
  it('GET creates the singleton from defaults when none exists', async () => {
    expect(await StreamRules.countDocuments({})).toBe(0);
    const r = await getStreamRules();
    expect(r.numAllowed).toBe(SR_DEFAULTS.numAllowed);
    expect(r.confidence).toBe(SR_DEFAULTS.confidence);
    expect(await StreamRules.countDocuments({})).toBe(1);
  });

  it('PUT upserts and keeps exactly one doc; round-trips', async () => {
    await getStreamRules();
    const saved = await saveStreamRules({ ...SR_DEFAULTS, numAllowed: '3', confidence: 55, autoSuggest: false });
    expect(saved.numAllowed).toBe('3');
    expect(saved.confidence).toBe(55);
    expect(saved.autoSuggest).toBe(false);
    expect(await StreamRules.countDocuments({})).toBe(1);   // still one
    const reread = await getStreamRules();
    expect(reread.numAllowed).toBe('3');
  });
});
```

- [ ] **Step 4: Run — expect FAIL**.

- [ ] **Step 5: Service** — `server/src/modules/streamRules/service.ts`:

```ts
import { StreamRules } from '../../models/StreamRules.js';
import type { StreamRulesInput } from './stream-rules.schemas.js';

export const SR_DEFAULTS: StreamRulesInput = {
  numAllowed: '2', requirePrimary: true, defaultPrimary: 'First selected stream',
  allowSecondary: true, maxSecondary: 2, changePolicy: 'Before evaluation only', cooldown: 14,
  reuseEval: true, reuseScope: 'Same domain only', validityDays: 90, validityExpires: true,
  autoSuggest: true, suggestBasis: 'Skills + evaluations', confidence: 70,
};

export interface StreamRulesView extends StreamRulesInput { updatedAt: string }

function toView(d: Record<string, unknown>): StreamRulesView {
  return {
    numAllowed: d.numAllowed as StreamRulesInput['numAllowed'], requirePrimary: !!d.requirePrimary,
    defaultPrimary: String(d.defaultPrimary), allowSecondary: !!d.allowSecondary, maxSecondary: Number(d.maxSecondary),
    changePolicy: d.changePolicy as StreamRulesInput['changePolicy'], cooldown: Number(d.cooldown),
    reuseEval: !!d.reuseEval, reuseScope: d.reuseScope as StreamRulesInput['reuseScope'],
    validityDays: Number(d.validityDays), validityExpires: !!d.validityExpires, autoSuggest: !!d.autoSuggest,
    suggestBasis: d.suggestBasis as StreamRulesInput['suggestBasis'], confidence: Number(d.confidence),
    updatedAt: new Date(d.updatedAt as Date).toISOString(),
  };
}

export async function getStreamRules(): Promise<StreamRulesView> {
  let doc = await StreamRules.findOne().lean();
  if (!doc) { await StreamRules.create({ ...SR_DEFAULTS }); doc = await StreamRules.findOne().lean(); }
  return toView(doc as Record<string, unknown>);
}
export async function saveStreamRules(input: StreamRulesInput): Promise<StreamRulesView> {
  const doc = await StreamRules.findOneAndUpdate({}, { ...input, updatedAt: new Date() }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  return toView(doc as Record<string, unknown>);
}
```

- [ ] **Step 6: Run service test — expect PASS**.

- [ ] **Step 7: Controller + routes + mount** — `server/src/modules/streamRules/controller.ts`:

```ts
import type { Request, Response } from 'express';
import { streamRulesSchema } from './stream-rules.schemas.js';
import { getStreamRules, saveStreamRules } from './service.js';

export async function getController(_req: Request, res: Response) {
  res.json(await getStreamRules());
}
export async function putController(req: Request, res: Response) {
  res.json(await saveStreamRules(streamRulesSchema.parse(req.body)));
}
```

`server/src/modules/streamRules/routes.ts`:

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { getController, putController } from './controller.js';

export const streamRulesRoutes = Router();
streamRulesRoutes.use(requireAuth);
streamRulesRoutes.get('/', asyncHandler(getController));
streamRulesRoutes.put('/', asyncHandler(putController));
```

In `server/src/app.ts` add the import + mount (after `streamRoutes`):
```ts
import { streamRulesRoutes } from './modules/streamRules/routes.js';
```
```ts
  app.use('/api/stream-rules', streamRulesRoutes);
```

- [ ] **Step 8: Failing route test** — `server/test/stream-rules.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { SR_DEFAULTS } from '../src/modules/streamRules/service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);

describe('stream-rules routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/stream-rules')).status).toBe(401);
  });
  it('GET returns defaults; PUT saves and re-GET reflects it; 400 on bad enum', async () => {
    const g = await auth(request(createApp()).get('/api/stream-rules'));
    expect(g.status).toBe(200);
    expect(g.body.numAllowed).toBe('2');
    const put = await auth(request(createApp()).put('/api/stream-rules').send({ ...SR_DEFAULTS, numAllowed: 'Unlimited', reuseEval: false }));
    expect(put.status).toBe(200);
    expect(put.body.numAllowed).toBe('Unlimited');
    const g2 = await auth(request(createApp()).get('/api/stream-rules'));
    expect(g2.body.numAllowed).toBe('Unlimited');
    const bad = await auth(request(createApp()).put('/api/stream-rules').send({ ...SR_DEFAULTS, changePolicy: 'whenever' }));
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 9: Run route test — expect PASS**.
- [ ] **Step 10: Type-check + full server suite** — `npx -w server tsc --noEmit && npm test -w server`.
- [ ] **Step 11: Commit**

```bash
git add server/src/models/StreamRules.ts server/src/modules/streamRules/ server/src/app.ts server/test/stream-rules.service.test.ts server/test/stream-rules.route.test.ts
git commit -m "feat(server): StreamRules singleton model, service, and /api/stream-rules"
```

---

## Task 4: Server — seed 5 streams + 1 rules doc

**Files:** Modify `server/src/seed/seed.ts`.

- [ ] **Step 1: Imports** — add:
```ts
import { Stream } from '../models/Stream.js';
import { StreamRules } from '../models/StreamRules.js';
import { SR_DEFAULTS } from '../modules/streamRules/service.js';
```

- [ ] **Step 2: Cleanup** — add `Stream.deleteMany({})` and `StreamRules.deleteMany({})` to the `Promise.all([...])` group.

- [ ] **Step 3: Insert** — immediately before `console.log('Seed complete.');` (reuse the existing `daysAgo` and `D(y,m,d)` helpers already in `run()` scope — do NOT redeclare):

```ts
  // ---- Streams (5, verbatim from the prototype's `streams` array) ----
  const streamDocs = [
    { name: 'Frontend Engineering', parent: 'Engineering', label: 'Frontend Developer', skills: ['React', 'TypeScript', 'CSS', 'HTML'], good: ['Next.js', 'Testing'], flow: ['MCQ', 'Coding', 'TARA'], cutoff: 65, cgpa: 6.5, backlogs: 1, grad: ['2025', '2026'], branches: ['CSE', 'IT'], sources: ['Institutes', 'Resume Vault'], status: 'Active', version: '1.3', updatedAt: daysAgo(2), createdAt: D(2026, 4, 30),
      versions: [ { v: '1.3', date: D(2026, 6, 10), by: 'Sharath P.', note: 'Added TypeScript to required skills' }, { v: '1.0', date: D(2026, 4, 30), by: 'Sharath P.', note: 'Initial stream' } ] },
    { name: 'Backend Engineering', parent: 'Engineering', label: 'Backend Developer', skills: ['Node.js', 'Databases', 'REST APIs'], good: ['Docker', 'Kubernetes'], flow: ['MCQ', 'Coding', 'TARA', 'Assignment'], cutoff: 70, cgpa: 6.5, backlogs: 1, grad: ['2025', '2026'], branches: ['CSE', 'IT'], sources: ['Institutes', 'Resume Vault', 'Referrals'], status: 'Active', version: '1.5', updatedAt: daysAgo(4), createdAt: D(2026, 5, 1),
      versions: [ { v: '1.5', date: D(2026, 6, 8), by: 'Asha N.', note: 'Raised cutoff to 70%' }, { v: '1.0', date: D(2026, 5, 1), by: 'Sharath P.', note: 'Initial stream' } ] },
    { name: 'Data / ML', parent: 'Data Science', label: 'ML Engineer', skills: ['Python', 'Machine Learning', 'Statistics'], good: ['PyTorch', 'MLOps'], flow: ['MCQ', 'Coding', 'TARA'], cutoff: 72, cgpa: 7.0, backlogs: 0, grad: ['2025', '2026'], branches: ['CSE', 'IT', 'ECE'], sources: ['Institutes'], status: 'Active', version: '2.0', updatedAt: daysAgo(1), createdAt: D(2026, 4, 18),
      versions: [ { v: '2.0', date: D(2026, 6, 11), by: 'Asha N.', note: 'Zero-backlog eligibility' }, { v: '1.0', date: D(2026, 4, 18), by: 'Sharath P.', note: 'Initial stream' } ] },
    { name: 'Full-stack', parent: 'Engineering', label: 'Full-stack Developer', skills: ['React', 'Node.js', 'Databases'], good: ['AWS', 'CI/CD'], flow: ['MCQ', 'Coding', 'TARA', 'Assignment'], cutoff: 68, cgpa: 6.5, backlogs: 1, grad: ['2025', '2026'], branches: ['CSE', 'IT'], sources: ['Institutes', 'Resume Vault'], status: 'Active', version: '1.1', updatedAt: daysAgo(6), createdAt: D(2026, 5, 10),
      versions: [ { v: '1.1', date: D(2026, 6, 5), by: 'Sharath P.', note: 'Added assignment stage' }, { v: '1.0', date: D(2026, 5, 10), by: 'Sharath P.', note: 'Initial stream' } ] },
    { name: 'Business Analytics', parent: 'Business', label: 'Business Analyst', skills: ['SQL', 'Excel', 'Storytelling'], good: ['Power BI', 'Python'], flow: ['MCQ', 'TARA', 'Assignment'], cutoff: 60, cgpa: 6.0, backlogs: 2, grad: ['2025', '2026'], branches: ['MBA', 'MCA'], sources: ['Institutes', 'Direct Apply'], status: 'Disabled', version: '1.0', updatedAt: daysAgo(14), createdAt: D(2026, 5, 28),
      versions: [ { v: '1.0', date: D(2026, 5, 28), by: 'Asha N.', note: 'Initial stream' } ] },
  ];
  await Stream.insertMany(streamDocs);
  await StreamRules.create({ ...SR_DEFAULTS });
```

- [ ] **Step 4: Run seed** — `npm run seed -w server` (expect "Seed complete.", no throw).
- [ ] **Step 5: Type-check** — `npx -w server tsc --noEmit`.
- [ ] **Step 6: Commit**

```bash
git add server/src/seed/seed.ts
git commit -m "feat(server): seed 5 streams and default selection rules"
```

---

## Task 5: Client — types, constants, rules utils, hooks (+ utils test)

**Files:** Create `client/src/types/streams.ts`, `client/src/pages/Streams/streamsConstants.ts`, `client/src/pages/Streams/rules/streamRulesUtils.ts`, `client/src/pages/Streams/hooks/useStreams.ts`, `useStreamMutations.ts`, `useStreamRules.ts`, `useStreamRulesMutation.ts`; Test `client/src/test/streamRulesUtils.test.ts`.

**Interfaces:** Produces types `StreamItem`, `StreamInput`, `StreamListResponse`, `StreamRules`; consts `PARENTS`, `ALL_FLOW`, `ALL_GRAD`, `ALL_BRANCHES`, `ALL_SOURCES`, `orderedFlow`, `SR_DEFAULTS`; util `streamRulesSummary`; hooks `useStreams(params)` (key `['streams', q, parent, status, sort, order]`), `useStreamMutations()` (`{create, update, restore}` → invalidate `['streams']`), `useStreamRules()` (key `['stream-rules']`), `useStreamRulesMutation()` (invalidate `['stream-rules']`).

- [ ] **Step 1: Types** — `client/src/types/streams.ts`:

```ts
export const PARENTS = ['Engineering', 'Data Science', 'Business', 'Design', 'Product'] as const;
export const ALL_FLOW = ['MCQ', 'Coding', 'TARA', 'Assignment'] as const;

export interface StreamVersion { v: string; date: string; by: string; note: string }
export interface StreamItem {
  id: string; code: string; name: string; parent: string; label: string;
  skills: string[]; good: string[]; flow: string[]; cutoff: number; cgpa: number; backlogs: number;
  grad: string[]; branches: string[]; sources: string[]; status: 'Active' | 'Disabled';
  version: string; versions: StreamVersion[]; createdAt: string; updatedAt: string;
}
export interface StreamInput {
  name: string; parent: string; label: string; skills: string[]; good: string[]; flow: string[];
  cutoff: number; cgpa: number; backlogs: number; grad: string[]; branches: string[]; sources: string[]; status: string;
}
export interface StreamListResponse { items: StreamItem[] }

export interface StreamRules {
  numAllowed: string; requirePrimary: boolean; defaultPrimary: string; allowSecondary: boolean;
  maxSecondary: number; changePolicy: string; cooldown: number; reuseEval: boolean; reuseScope: string;
  validityDays: number; validityExpires: boolean; autoSuggest: boolean; suggestBasis: string; confidence: number;
}
```

- [ ] **Step 2: Constants** — `client/src/pages/Streams/streamsConstants.ts`:

```ts
import { ALL_FLOW } from '../../types/streams.js';

export const ALL_GRAD = ['2024', '2025', '2026', '2027'];
export const ALL_BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'MCA', 'MBA'];
export const ALL_SOURCES = ['Institutes', 'Resume Vault', 'Referrals', 'Direct Apply', 'Recruiter Uploads'];

// Canonical MCQ→Coding→TARA→Assignment order (mirrors the server's orderedFlow).
export function orderedFlow(flow: string[]): string[] { return ALL_FLOW.filter((f) => flow.includes(f)); }
```

- [ ] **Step 3: Failing utils test** — `client/src/test/streamRulesUtils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SR_DEFAULTS, streamRulesSummary } from '../pages/Streams/rules/streamRulesUtils.js';

describe('streamRulesUtils', () => {
  it('summary reflects the defaults (all features on)', () => {
    const s = streamRulesSummary(SR_DEFAULTS);
    expect(s).toContain('up to 2 stream');
    expect(s).toContain('required');
    expect(s).toContain('2 secondary');
    expect(s).toContain('before evaluation only');
    expect(s).toContain('cooldown 14 days');
    expect(s).toContain('reusable');
    expect(s).toContain('valid for 90 days');
    expect(s).toContain('at ≥70%');
  });
  it('summary reflects the off branches', () => {
    const s = streamRulesSummary({ ...SR_DEFAULTS, requirePrimary: false, allowSecondary: false, reuseEval: false, validityExpires: false, autoSuggest: false });
    expect(s).toContain('no required primary');
    expect(s).toContain('no secondary streams');
    expect(s).toContain('are not reusable');
    expect(s).toContain('no expiry');
    expect(s).toContain('Auto-suggestion is off');
  });
});
```

- [ ] **Step 4: Run — expect FAIL**.

- [ ] **Step 5: Rules utils** — `client/src/pages/Streams/rules/streamRulesUtils.ts`:

```ts
import type { StreamRules } from '../../../types/streams.js';

export const SR_DEFAULTS: StreamRules = {
  numAllowed: '2', requirePrimary: true, defaultPrimary: 'First selected stream', allowSecondary: true,
  maxSecondary: 2, changePolicy: 'Before evaluation only', cooldown: 14, reuseEval: true,
  reuseScope: 'Same domain only', validityDays: 90, validityExpires: true, autoSuggest: true,
  suggestBasis: 'Skills + evaluations', confidence: 70,
};

// Ported from the prototype's srSummary (line 3169) as a plain sentence (the prototype bolds values
// via <span class="hl">; we render plain text — accepted minor fidelity trade for a pure/testable util).
export function streamRulesSummary(c: StreamRules): string {
  return (
    `Candidates may join up to ${c.numAllowed} stream(s)` +
    `${c.requirePrimary ? ', with a required primary stream' : ', with no required primary'}` +
    `${c.allowSecondary ? ` and up to ${c.maxSecondary} secondary` : ' and no secondary streams'}. ` +
    `Stream changes are allowed ${c.changePolicy.toLowerCase()} (cooldown ${c.cooldown} days). ` +
    `Evaluations ${c.reuseEval ? `are reusable · ${c.reuseScope.toLowerCase()}` : 'are not reusable'}` +
    `${c.validityExpires ? `, valid for ${c.validityDays} days` : ', with no expiry'}. ` +
    `Auto-suggestion is ${c.autoSuggest ? `on using ${c.suggestBasis.toLowerCase()} at ≥${c.confidence}%` : 'off'}.`
  );
}
```

- [ ] **Step 6: Run — expect PASS**.

- [ ] **Step 7: Hooks** — `client/src/pages/Streams/hooks/useStreams.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { StreamListResponse } from '../../../types/streams.js';

export interface StreamParams { q?: string; parent?: string; status?: string; sort?: string; order?: string }

export function useStreams(params: StreamParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['streams', params.q, params.parent, params.status, params.sort, params.order],
    queryFn: () => apiFetch<StreamListResponse>(`/streams${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
```

`useStreamMutations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { StreamInput } from '../../../types/streams.js';

export function useStreamMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['streams'] });
  const create = useMutation({
    mutationFn: (body: StreamInput) => apiFetch('/streams', { method: 'POST', body, token }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<StreamInput> }) =>
      apiFetch(`/streams/${id}`, { method: 'PATCH', body, token }),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: ({ id, v }: { id: string; v: string }) =>
      apiFetch(`/streams/${id}/restore`, { method: 'POST', body: { v }, token }),
    onSuccess: invalidate,
  });
  return { create, update, restore };
}
```

`useStreamRules.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { StreamRules } from '../../../types/streams.js';

export function useStreamRules() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['stream-rules'],
    queryFn: () => apiFetch<StreamRules>('/stream-rules', { token }),
    enabled: !!token,
  });
}
```

`useStreamRulesMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { StreamRules } from '../../../types/streams.js';

export function useStreamRulesMutation() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StreamRules) => apiFetch('/stream-rules', { method: 'PUT', body, token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stream-rules'] }),
  });
}
```

- [ ] **Step 8: Type-check** — `npx -w client tsc --noEmit`.
- [ ] **Step 9: Commit**

```bash
git add client/src/types/streams.ts client/src/pages/Streams/streamsConstants.ts client/src/pages/Streams/rules/streamRulesUtils.ts client/src/pages/Streams/hooks/ client/src/test/streamRulesUtils.test.ts
git commit -m "feat(client): streams types, constants, rules utils, and hooks"
```

---

## Task 6: Client — StreamEditorModal (+ editor test)

**Files:** Create `client/src/pages/Streams/StreamEditorModal.tsx`; Test `client/src/test/StreamEditor.test.tsx`.

**Interfaces:** Consumes `useStreamMutations`, constants, `PARENTS`, `StreamItem`. Produces `StreamEditorModal({ mode, stream?, onClose })`. Save → create `{name,parent,label,skills,good,flow (canonical),cutoff,cgpa,backlogs,grad,branches,sources,status}` / edit `{id, body:{...}}`; both onClose on success. Name required (inline).

**Notes:** deep-clone arrays into local state on mount. Tag input: Enter or comma adds (trimmed, dedup), × removes. Flow chips render in `ALL_FLOW` order with `.arr` chevrons between; toggling adds/removes; the saved `flow` is `orderedFlow(selected)`. Chip groups (`.schips`) for grad/branches/sources toggle membership. Cutoff `.cutoff-row` range with live `.cv` %.

- [ ] **Step 1: Failing editor test** — `client/src/test/StreamEditor.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { StreamEditorModal } from '../pages/Streams/StreamEditorModal.js';

function renderModal(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><StreamEditorModal mode="create" onClose={onClose} /></AuthProvider></QueryClientProvider>);
}

describe('StreamEditorModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/streams') && (opts?.method ?? 'GET') === 'POST') return Promise.resolve({ ok: true, status: 201, json: async () => ({ _id: 's-new' }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('adds a skill tag, requires a name, then POSTs a canonical-flow payload', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();

    // add a skill tag
    const skillIn = screen.getByPlaceholderText(/Type a skill and press Enter/i);
    await user.type(skillIn, 'React{Enter}');
    expect(screen.getByText('React')).toBeInTheDocument();

    // toggle flow chips out of order: click TARA then MCQ (both are chips)
    await user.click(screen.getByRole('button', { name: /^TARA$/ }));
    await user.click(screen.getByRole('button', { name: /^MCQ$/ }));

    // name required: save blocked first
    await user.click(screen.getByRole('button', { name: /Save stream/i }));
    expect(onClose).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Stream name/i), 'Frontend Engineering');
    await user.click(screen.getByRole('button', { name: /Save stream/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fetchMock.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/streams') && (o as RequestInit | undefined)?.method === 'POST');
    const b = JSON.parse((post![1] as RequestInit).body as string);
    expect(b.name).toBe('Frontend Engineering');
    expect(b.skills).toContain('React');
    // flow canonicalized regardless of click order
    expect(b.flow).toEqual(['MCQ', 'TARA']);
  });
});
```

(If the default create-mode flow is non-empty, adjust the test to toggle to the intended `['MCQ','TARA']` set; the assertion is that the saved flow is in canonical order. Create-mode default flow = `['MCQ','Coding','TARA']` per the prototype's `openStreamEditor(null)` — so clicking TARA (removes it) and MCQ (removes it) would leave `['Coding']`. **Set the create-mode default `flow` to `[]`** in the component so the test's two clicks add MCQ+TARA → canonical `['MCQ','TARA']`; this is a deliberate, documented simplification of the prototype's create default. Alternatively keep the prototype default and rewrite the test to assert canonical order after a couple of toggles — the implementer may choose, but the saved flow MUST be canonical.)

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: Component** — `client/src/pages/Streams/StreamEditorModal.tsx`. Port the prototype's stream editor (markup 1475–1504, runtime 3064–3126). Full implementation:

```tsx
import { useState } from 'react';
import { useStreamMutations } from './hooks/useStreamMutations.js';
import { ALL_GRAD, ALL_BRANCHES, ALL_SOURCES, orderedFlow } from './streamsConstants.js';
import { ALL_FLOW, PARENTS, type StreamItem } from '../../types/streams.js';

export interface StreamEditorModalProps { mode: 'create' | 'edit'; stream?: StreamItem; onClose: () => void }

export function StreamEditorModal({ mode, stream, onClose }: StreamEditorModalProps) {
  const { create, update } = useStreamMutations();
  const [name, setName] = useState(stream?.name ?? '');
  const [parent, setParent] = useState(stream?.parent ?? 'Engineering');
  const [label, setLabel] = useState(stream?.label ?? '');
  const [skills, setSkills] = useState<string[]>(() => [...(stream?.skills ?? [])]);
  const [good, setGood] = useState<string[]>(() => [...(stream?.good ?? [])]);
  const [flow, setFlow] = useState<string[]>(() => [...(stream?.flow ?? [])]);   // create default [] (see plan note)
  const [cutoff, setCutoff] = useState(stream?.cutoff ?? 65);
  const [cgpa, setCgpa] = useState(stream?.cgpa ?? 6.5);
  const [backlogs, setBacklogs] = useState(stream?.backlogs ?? 1);
  const [grad, setGrad] = useState<string[]>(() => [...(stream?.grad ?? ['2025', '2026'])]);
  const [branches, setBranches] = useState<string[]>(() => [...(stream?.branches ?? ['CSE', 'IT'])]);
  const [sources, setSources] = useState<string[]>(() => [...(stream?.sources ?? ['Institutes'])]);
  const [status, setStatus] = useState(stream?.status ?? 'Active');
  const [skillIn, setSkillIn] = useState('');
  const [goodIn, setGoodIn] = useState('');
  const [nameError, setNameError] = useState(false);

  const addTag = (val: string, list: string[], set: (v: string[]) => void, clear: () => void) => {
    const v = val.trim();
    if (v && !list.includes(v)) set([...list, v]);
    clear();
  };
  const toggle = (v: string, list: string[], set: (x: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function save() {
    if (!name.trim()) { setNameError(true); return; }
    const body = {
      name: name.trim(), parent, label: label.trim(), skills, good, flow: orderedFlow(flow),
      cutoff, cgpa, backlogs, grad, branches, sources, status,
    };
    if (mode === 'edit' && stream) update.mutate({ id: stream.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  }

  const chipGroup = (all: string[], sel: string[], set: (x: string[]) => void) => (
    <div className="schips">
      {all.map((v) => (
        <button key={v} type="button" aria-pressed={sel.includes(v)} className={`chipc${sel.includes(v) ? ' on' : ''}`} onClick={() => toggle(v, sel, set)}>
          <i className="ti ti-check" />{v}
        </button>
      ))}
    </div>
  );
  const tagBox = (list: string[], set: (x: string[]) => void, inVal: string, setIn: (s: string) => void, ph: string, gh = false) => (
    <div className="taginput">
      {list.map((t, i) => (
        <span className={`tag${gh ? ' gh' : ''}`} key={`${t}-${i}`}>{t} <i className="ti ti-x" role="button" aria-label={`Remove ${t}`} onClick={() => set(list.filter((_, idx) => idx !== i))} /></span>
      ))}
      <input placeholder={ph} value={inVal} onChange={(e) => setIn(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(inVal, list, set, () => setIn('')); } }} />
    </div>
  );

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="seTitle">
        <div className="modal-h">
          <div><h3 id="seTitle">{mode === 'edit' ? 'Edit Stream' : 'Create Stream'}</h3><p>Define a hiring stream and its evaluation settings.</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
          <div className="se-grid">
            <div className="fld"><label htmlFor="seName">Stream name</label>
              <input id="seName" placeholder="e.g. Frontend Engineering" value={name}
                style={nameError ? { borderColor: 'var(--danger)' } : undefined}
                onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }} /></div>
            <div className="fld"><label htmlFor="seParent">Parent category</label>
              <select id="seParent" value={parent} onChange={(e) => setParent(e.target.value)}>{PARENTS.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div className="fld full"><label htmlFor="seLabel">Employer-visible label</label>
              <input id="seLabel" placeholder="e.g. Frontend Developer" value={label} onChange={(e) => setLabel(e.target.value)} />
              <span className="fnote" style={{ fontSize: 11.5, color: 'var(--faint)' }}>Shown to employers on the drive listing.</span></div>
            <div className="fld full"><label>Skills required</label>{tagBox(skills, setSkills, skillIn, setSkillIn, 'Type a skill and press Enter…')}</div>
            <div className="fld full"><label>Good-to-have skills</label>{tagBox(good, setGood, goodIn, setGoodIn, 'Type a skill and press Enter…', true)}</div>
            <div className="fld full"><label>Evaluation flow</label>
              <div className="flow-chips">
                {ALL_FLOW.map((f, i) => (
                  <span key={f}>
                    {i > 0 && <i className="ti ti-chevron-right arr" />}
                    <button type="button" aria-pressed={flow.includes(f)} className={`chipc${flow.includes(f) ? ' on' : ''}`} onClick={() => toggle(f, flow, setFlow)}><i className="ti ti-check" />{f}</button>
                  </span>
                ))}
              </div>
              <span className="fnote" style={{ fontSize: 11.5, color: 'var(--faint)' }}>Enabled stages run in this order.</span></div>
            <div className="fld full"><label>Cutoff score</label>
              <div className="cutoff-row"><input type="range" min={0} max={100} value={cutoff} aria-label="Cutoff score" onChange={(e) => setCutoff(Number(e.target.value))} /><span className="cv">{cutoff}%</span></div></div>
            <div className="fld"><label htmlFor="seCgpa">Eligibility · min CGPA</label>
              <input id="seCgpa" type="number" min={0} max={10} step={0.1} value={cgpa} onChange={(e) => setCgpa(e.target.value === '' ? 0 : Number(e.target.value))} /></div>
            <div className="fld"><label htmlFor="seBacklogs">Eligibility · max backlogs</label>
              <input id="seBacklogs" type="number" min={0} value={backlogs} onChange={(e) => setBacklogs(e.target.value === '' ? 0 : Number(e.target.value))} /></div>
            <div className="fld full"><label>Eligibility · graduation years</label>{chipGroup(ALL_GRAD, grad, setGrad)}</div>
            <div className="fld full"><label>Allowed branches</label>{chipGroup(ALL_BRANCHES, branches, setBranches)}</div>
            <div className="fld full"><label>Candidate sources</label>{chipGroup(ALL_SOURCES, sources, setSources)}</div>
            <div className="fld"><label htmlFor="seStatus">Status</label>
              <select id="seStatus" value={status} onChange={(e) => setStatus(e.target.value)}><option>Active</option><option>Disabled</option></select></div>
          </div>
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save}><i className="ti ti-device-floppy" /> Save stream</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run editor test — expect PASS**.
- [ ] **Step 5: Type-check** — `npx -w client tsc --noEmit`.
- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Streams/StreamEditorModal.tsx client/src/test/StreamEditor.test.tsx
git commit -m "feat(client): StreamEditorModal (tags, flow chips, chip groups, cutoff)"
```

---

## Task 7: Client — StreamTable + version modal + StreamsPage + route/nav (+ table test)

**Files:** Create `client/src/pages/Streams/StreamTable.tsx`, `StreamVersionHistoryModal.tsx`, `index.tsx`; Modify `client/src/App.tsx`, `client/src/components/Sidebar.tsx`; Test `client/src/test/StreamTable.test.tsx`.

**Interfaces:** Produces `StreamAction` = `'edit'|'version'|'toggle'` (defined once in StreamTable.tsx); `StreamTable({ items, sort, order, onSort, onAction })`; `StreamVersionHistoryModal({ stream, onClose })`; `StreamsPage`.

- [ ] **Step 1: Failing table test** — `client/src/test/StreamTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StreamTable } from '../pages/Streams/StreamTable.js';
import type { StreamItem } from '../types/streams.js';

const item = (over: Partial<StreamItem> = {}): StreamItem => ({
  id: 's1', code: 'STR-ABC', name: 'Frontend Engineering', parent: 'Engineering', label: 'Frontend Developer',
  skills: ['React', 'TypeScript', 'CSS', 'HTML'], good: [], flow: ['MCQ', 'Coding', 'TARA'], cutoff: 65, cgpa: 6.5, backlogs: 1,
  grad: ['2025'], branches: ['CSE', 'IT'], sources: ['Institutes'], status: 'Active', version: '1.3', versions: [],
  createdAt: '2026-05-30T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z', ...over,
});

describe('StreamTable', () => {
  it('renders a row with code, skills (first 3 + overflow), version and status', () => {
    render(<StreamTable items={[item()]} sort="name" order="asc" onSort={() => {}} onAction={() => {}} />);
    expect(screen.getByText('Frontend Engineering')).toBeInTheDocument();
    expect(screen.getByText('STR-ABC')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();      // 4 skills → first 3 + "+1"
    expect(screen.getByText('v1.3')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
  it('clicking a sortable header fires onSort with the column key', async () => {
    const onSort = vi.fn();
    render(<StreamTable items={[item()]} sort="name" order="asc" onSort={onSort} onAction={() => {}} />);
    await userEvent.setup().click(screen.getByText(/Cutoff/i));
    expect(onSort).toHaveBeenCalledWith('cutoff');
  });
  it('kebab version action fires onAction', async () => {
    const onAction = vi.fn();
    render(<StreamTable items={[item()]} sort="name" order="asc" onSort={() => {}} onAction={onAction} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    await user.click(screen.getByText(/Version history/i));
    expect(onAction).toHaveBeenCalledWith('version', expect.objectContaining({ id: 's1' }));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: StreamTable.tsx** — port of prototype rows (3017–3035); positioned kebab (More + menu share a `position:relative` container):

```tsx
import { useState } from 'react';
import type { StreamItem } from '../../types/streams.js';

export type StreamAction = 'edit' | 'version' | 'toggle';
const COLS: { key: 'name' | 'parent' | 'cutoff'; label: string }[] = [
  { key: 'name', label: 'Stream' }, { key: 'parent', label: 'Parent Category' }, { key: 'cutoff', label: 'Cutoff' },
];

export interface StreamTableProps {
  items: StreamItem[];
  sort: string; order: string;
  onSort: (key: 'name' | 'parent' | 'cutoff') => void;
  onAction: (action: StreamAction, s: StreamItem) => void;
}

function RowKebab({ s, onAction }: { s: StreamItem; onAction: StreamTableProps['onAction'] }) {
  const [open, setOpen] = useState(false);
  const act = (a: StreamAction) => { setOpen(false); onAction(a, s); };
  return (
    <div className="rowact" style={{ position: 'relative' }}>
      <button title="Edit" onClick={() => act('edit')}><i className="ti ti-edit" /></button>
      <button title="Version history" onClick={() => act('version')}><i className="ti ti-history" /></button>
      <button title="More" onClick={() => setOpen((v) => !v)}><i className="ti ti-dots-vertical" /></button>
      {open && (
        <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
          <button onClick={() => act('edit')}><i className="ti ti-edit" /> Edit stream</button>
          <button onClick={() => act('version')}><i className="ti ti-history" /> Version history</button>
          <button onClick={() => act('toggle')}><i className={`ti ti-${s.status === 'Active' ? 'circle-off' : 'circle-check'}`} /> {s.status === 'Active' ? 'Disable' : 'Enable'} stream</button>
        </div>
      )}
    </div>
  );
}

function sortIcon(active: boolean, order: string): string {
  if (!active) return 'ti-arrows-sort';
  return order === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending';
}

export function StreamTable({ items, sort, order, onSort, onAction }: StreamTableProps) {
  return (
    <div className="dm-table-wrap">
      <div className="dm-scroll">
        <table className="dm" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`sortable${sort === c.key ? ' sorted' : ''}`} onClick={() => onSort(c.key)} style={c.key === 'cutoff' ? { textAlign: 'right' } : undefined}>
                  {c.label} <i className={`ti ${sortIcon(sort === c.key, order)} sa`} />
                </th>
              ))}
              <th>Skills Required</th><th>Evaluation Flow</th><th>Branches</th><th>Employer Label</th><th>Version</th><th>Status</th><th className="r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={10}><div className="dm-empty"><i className="ti ti-git-branch" /> No streams match these filters.</div></td></tr>}
            {items.map((s) => (
              <tr key={s.id}>
                <td><div className="dm-name"><b>{s.name}</b><span>{s.code}</span></div></td>
                <td><span className="chip stream">{s.parent}</span></td>
                <td className="r cap">{s.cutoff}%</td>
                <td>{s.skills.slice(0, 3).map((k) => <span className="skill-pill" key={k}>{k}</span>)}{s.skills.length > 3 && <span className="skill-pill">+{s.skills.length - 3}</span>}</td>
                <td>{s.flow.map((f, i) => <span key={f}>{i > 0 && <i className="ti ti-chevron-right" style={{ fontSize: 12, color: 'var(--faint)', verticalAlign: -1 }} />} {f}</span>)}</td>
                <td>{s.branches.join(', ')}</td>
                <td>{s.label}</td>
                <td><span className="vbadge">v{s.version}</span></td>
                <td><span className={`badge-st ${s.status === 'Active' ? 'st-active' : 'st-archived'}`}><i className="ti ti-circle-filled" /> {s.status}</span></td>
                <td className="r"><RowKebab s={s} onAction={onAction} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dm-pager"><div className="pinfo"><b>{items.length}</b> stream{items.length === 1 ? '' : 's'}</div></div>
    </div>
  );
}
```

- [ ] **Step 4: StreamVersionHistoryModal.tsx** — mirrors the Templates version modal (stream-scoped, `fmtDate` inline):

```tsx
import { useStreamMutations } from './hooks/useStreamMutations.js';
import type { StreamItem } from '../../types/streams.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso: string) => { const d = new Date(iso); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };

export interface StreamVersionHistoryModalProps { stream: StreamItem; onClose: () => void }

export function StreamVersionHistoryModal({ stream, onClose }: StreamVersionHistoryModalProps) {
  const { restore } = useStreamMutations();
  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="verTitle" style={{ maxWidth: 480 }}>
        <div className="modal-h"><div><h3 id="verTitle">Version history</h3><p>{stream.name} · currently v{stream.version}</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button></div>
        <div className="modal-b" style={{ gridTemplateColumns: '1fr', paddingBottom: 16 }}>
          <div>
            {stream.versions.map((v) => {
              const cur = v.v === stream.version;
              return (
                <div className={`ver-item${cur ? ' cur' : ''}`} key={`${v.v}-${v.date}`}>
                  <span className="vtag">v{v.v}</span>
                  <div className="vb"><b>{v.note}</b><span><time>{fmtDate(v.date)}</time> · {v.by}</span></div>
                  {cur ? <span className="vrestore">Current</span> : <button className="vrestore" type="button" onClick={() => restore.mutate({ id: stream.id, v: v.v }, { onSuccess: onClose })}>Restore</button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: index.tsx (StreamsPage)** — `client/src/pages/Streams/index.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.js';
import { PARENTS, type StreamItem } from '../../types/streams.js';
import { useStreams } from './hooks/useStreams.js';
import { useStreamMutations } from './hooks/useStreamMutations.js';
import { StreamTable, type StreamAction } from './StreamTable.js';
import { StreamEditorModal } from './StreamEditorModal.js';
import { StreamVersionHistoryModal } from './StreamVersionHistoryModal.js';

type EditorState = { mode: 'create' } | { mode: 'edit'; stream: StreamItem } | null;

export function StreamsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [parent, setParent] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<'name' | 'parent' | 'cutoff'>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [editor, setEditor] = useState<EditorState>(null);
  const [versions, setVersions] = useState<StreamItem | null>(null);

  const { data, isLoading, isError, error } = useStreams({ q, parent, status, sort, order });
  const { update } = useStreamMutations();
  const items = data?.items ?? [];

  function onSort(key: 'name' | 'parent' | 'cutoff') {
    if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder('asc'); }
  }
  function onAction(action: StreamAction, s: StreamItem) {
    if (action === 'edit') setEditor({ mode: 'edit', stream: s });
    else if (action === 'version') setVersions(s);
    else if (action === 'toggle') update.mutate({ id: s.id, body: { status: s.status === 'Active' ? 'Disabled' : 'Active' } });
  }
  function exportCsv() {
    const head = ['Stream Name', 'Parent Category', 'Employer Label', 'Skills Required', 'Good To Have', 'Evaluation Flow', 'Cutoff Score', 'Min CGPA', 'Max Backlogs', 'Graduation Years', 'Allowed Branches', 'Candidate Sources', 'Version', 'Status'];
    const rows = items.map((s) => [s.name, s.parent, s.label, s.skills.join('; '), s.good.join('; '), s.flow.join(' > '), s.cutoff, s.cgpa, s.backlogs, s.grad.join('; '), s.branches.join('; '), s.sources.join('; '), s.version, s.status].map((v) => `"${v}"`).join(','));
    const csv = [head.join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'matchday-streams.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <AppShell crumb="Configuration" title="Stream Configuration">
      <div className="content">
        <div className="dm-toolbar">
          <div className="dm-search"><i className="ti ti-search" /><input placeholder="Search streams by name, skill or label…" aria-label="Search streams" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by category" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">All categories</option>{PARENTS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option><option>Active</option><option>Disabled</option>
          </select>
          <div className="grow" />
          <button className="btn btn-ghost" onClick={() => navigate('/streams/rules')}><i className="ti ti-adjustments" /> Selection Rules</button>
          <button className="btn btn-ghost" onClick={exportCsv}><i className="ti ti-download" /> Export</button>
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'create' })}><i className="ti ti-plus" /> Create Stream</button>
        </div>
        {isError && <div className="card"><p style={{ padding: 20, color: 'var(--danger)' }}>Failed to load streams: {error instanceof Error ? error.message : 'Unknown error'}</p></div>}
        {isLoading && <div className="dm-empty" style={{ padding: 20 }}>Loading streams…</div>}
        {!isLoading && <StreamTable items={items} sort={sort} order={order} onSort={onSort} onAction={onAction} />}
        {editor && <StreamEditorModal mode={editor.mode} stream={editor.mode === 'edit' ? editor.stream : undefined} onClose={() => setEditor(null)} />}
        {versions && <StreamVersionHistoryModal stream={versions} onClose={() => setVersions(null)} />}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 6: Route + nav** — in `client/src/App.tsx`:
```tsx
import { StreamsPage } from './pages/Streams/index.js';
```
```tsx
        <Route path="/streams" element={<ProtectedRoute><StreamsPage /></ProtectedRoute>} />
```
In `client/src/components/Sidebar.tsx` change the Streams entry `to` to `/streams`:
```tsx
  { label: 'Streams', icon: 'ti-git-branch', to: '/streams' },
```

- [ ] **Step 7: Run tests + type-check** — `npm test -w client -- StreamTable && npx -w client tsc --noEmit`.
- [ ] **Step 8: Commit**

```bash
git add client/src/pages/Streams/StreamTable.tsx client/src/pages/Streams/StreamVersionHistoryModal.tsx client/src/pages/Streams/index.tsx client/src/App.tsx client/src/components/Sidebar.tsx client/src/test/StreamTable.test.tsx
git commit -m "feat(client): Stream Configuration page (table + version history) + route/nav"
```

---

## Task 8: Client — Stream Selection Rules page + route (+ test)

**Files:** Create `client/src/pages/Streams/rules/StreamRulesPage.tsx`; Modify `client/src/App.tsx` (route); Test `client/src/test/StreamRules.test.tsx`.

**Interfaces:** Consumes `useStreamRules`, `useStreamRulesMutation`, `SR_DEFAULTS`, `streamRulesSummary`, `useStreams` (for the primary-stream dropdown), `StreamRules` type. Produces `StreamRulesPage`.

- [ ] **Step 1: Failing rules test** — `client/src/test/StreamRules.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { StreamRulesPage } from '../pages/Streams/rules/StreamRulesPage.js';
import { SR_DEFAULTS } from '../pages/Streams/rules/streamRulesUtils.js';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={qc}><AuthProvider><StreamRulesPage /></AuthProvider></QueryClientProvider></MemoryRouter>);
}

describe('StreamRulesPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/stream-rules') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...SR_DEFAULTS, updatedAt: '2026-07-12T00:00:00.000Z' }) });
      if (url.includes('/stream-rules') && method === 'PUT') return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...SR_DEFAULTS, updatedAt: '2026-07-12T00:00:00.000Z' }) });
      if (url.includes('/streams')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads defaults into the summary and Save PUTs the rules', async () => {
    renderPage();
    const user = userEvent.setup();
    expect(await screen.findByText(/Candidates may join up to 2 stream/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Save rules/i }));
    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock.mock.calls.some(([u, o]) => typeof u === 'string' && u.includes('/stream-rules') && (o as RequestInit | undefined)?.method === 'PUT')).toBe(true);
    });
  });

  it('turning off "Allow secondary streams" greys its dependent row and updates the summary', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText(/Candidates may join up to 2 stream/i);
    const sw = screen.getByLabelText(/Allow secondary streams/i);
    await user.click(sw);
    expect(await screen.findByText(/no secondary streams/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: Component** — `client/src/pages/Streams/rules/StreamRulesPage.tsx`. Port the prototype (markup 1711–1781, runtime 3149–3190). Uses local state seeded from the query, dependent-row `.disabled`, dirty tracking, summary via `streamRulesSummary`, Save via the mutation, Reset to `SR_DEFAULTS`. Switches/picks are real `<button>`s. Full implementation:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../../components/AppShell.js';
import { useStreamRules } from '../hooks/useStreamRules.js';
import { useStreamRulesMutation } from '../hooks/useStreamRulesMutation.js';
import { useStreams } from '../hooks/useStreams.js';
import { SR_DEFAULTS, streamRulesSummary } from './streamRulesUtils.js';
import type { StreamRules } from '../../../types/streams.js';

const Switch = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} onClick={onClick} />
);
const Pick = ({ opts, value, onPick }: { opts: string[]; value: string; onPick: (v: string) => void }) => (
  <div className="pick">{opts.map((o) => <span key={o} role="button" aria-pressed={value === o} className={`opt${value === o ? ' on' : ''}`} onClick={() => onPick(o)}>{o}</span>)}</div>
);

export function StreamRulesPage() {
  const navigate = useNavigate();
  const { data } = useStreamRules();
  const { data: streamsData } = useStreams({ status: 'Active' });
  const save = useStreamRulesMutation();
  const [cfg, setCfg] = useState<StreamRules>(SR_DEFAULTS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (data) { setCfg(data); setDirty(false); } }, [data]);
  const set = <K extends keyof StreamRules>(k: K, v: StreamRules[K]) => { setCfg((c) => ({ ...c, [k]: v })); setDirty(true); };

  const primaryOpts = ['First selected stream', ...(streamsData?.items ?? []).map((s) => s.name)];

  function onSave() { save.mutate(cfg, { onSuccess: () => setDirty(false) }); }
  function onReset() {
    // eslint-disable-next-line no-alert
    if (window.confirm('Reset all stream selection rules to defaults?')) save.mutate(SR_DEFAULTS, { onSuccess: () => { setCfg(SR_DEFAULTS); setDirty(false); } });
  }

  return (
    <AppShell crumb="Configuration · Streams" title="Stream Selection Rules">
      <div className="content" style={{ maxWidth: 860 }}>
        <button className="backlink" onClick={() => navigate('/streams')}><i className="ti ti-arrow-left" /> Back to Streams</button>

        <div className="sr-summary"><b className="lab"><i className="ti ti-info-circle" /> Current policy</b><p>{streamRulesSummary(cfg)}</p></div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-indigo"><i className="ti ti-stack-2" /></span><div><b>Number of Streams Allowed</b><p>How many streams a candidate can be enrolled in.</p></div></div>
          <div className="set-body"><div className="set-row"><div className="sl"><b>Max streams per candidate</b><span>Includes primary and secondary streams.</span></div>
            <div className="sc"><Pick opts={['1', '2', '3', 'Unlimited']} value={cfg.numAllowed} onPick={(v) => set('numAllowed', v)} /></div></div></div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-teal"><i className="ti ti-star" /></span><div><b>Primary Stream</b><p>Every candidate's main hiring track.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Require a primary stream</b><span>Candidates must designate one primary track.</span></div><div className="sc"><Switch on={cfg.requirePrimary} label="Require a primary stream" onClick={() => set('requirePrimary', !cfg.requirePrimary)} /></div></div>
            <div className={`set-row${cfg.requirePrimary ? '' : ' disabled'}`}><div className="sl"><b>Default primary stream</b><span>Applied when a candidate hasn't chosen one.</span></div><div className="sc"><select value={cfg.defaultPrimary} onChange={(e) => set('defaultPrimary', e.target.value)}>{primaryOpts.map((o) => <option key={o}>{o}</option>)}</select></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-violet"><i className="ti ti-git-branch" /></span><div><b>Secondary Streams</b><p>Additional tracks a candidate may join.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Allow secondary streams</b><span>Let candidates opt into more than one track.</span></div><div className="sc"><Switch on={cfg.allowSecondary} label="Allow secondary streams" onClick={() => set('allowSecondary', !cfg.allowSecondary)} /></div></div>
            <div className={`set-row${cfg.allowSecondary ? '' : ' disabled'}`}><div className="sl"><b>Max secondary streams</b><span>Cap beyond the primary stream.</span></div><div className="sc"><input type="number" min={0} max={5} value={cfg.maxSecondary} onChange={(e) => set('maxSecondary', e.target.value === '' ? 0 : Number(e.target.value))} /></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-amber"><i className="ti ti-switch-horizontal" /></span><div><b>Stream Change Policy</b><p>When and how candidates can switch streams.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Change window</b><span>Governs when switching is permitted.</span></div><div className="sc"><select value={cfg.changePolicy} onChange={(e) => set('changePolicy', e.target.value)}><option>Anytime</option><option>Before evaluation only</option><option>Requires admin approval</option><option>Locked after drive assignment</option></select></div></div>
            <div className="set-row"><div className="sl"><b>Cooldown between changes</b><span>Minimum days before switching again.</span></div><div className="sc"><input type="number" min={0} max={365} value={cfg.cooldown} onChange={(e) => set('cooldown', e.target.value === '' ? 0 : Number(e.target.value))} /> <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>days</span></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-green"><i className="ti ti-recycle" /></span><div><b>Evaluation Reusability</b><p>Whether scores carry across streams.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Reuse evaluations across streams</b><span>Avoid re-testing candidates for shared skills.</span></div><div className="sc"><Switch on={cfg.reuseEval} label="Reuse evaluations across streams" onClick={() => set('reuseEval', !cfg.reuseEval)} /></div></div>
            <div className={`set-row${cfg.reuseEval ? '' : ' disabled'}`}><div className="sl"><b>Reuse scope</b><span>Which evaluations may be reused.</span></div><div className="sc"><Pick opts={['Any stream', 'Same domain only', 'Exact match only']} value={cfg.reuseScope} onPick={(v) => set('reuseScope', v)} /></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-indigo"><i className="ti ti-clock-hour-4" /></span><div><b>Evaluation Validity</b><p>How long evaluation results stay valid.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Evaluations expire</b><span>Require re-evaluation after a period.</span></div><div className="sc"><Switch on={cfg.validityExpires} label="Evaluations expire" onClick={() => set('validityExpires', !cfg.validityExpires)} /></div></div>
            <div className={`set-row${cfg.validityExpires ? '' : ' disabled'}`}><div className="sl"><b>Validity period</b><span>Days a completed evaluation remains valid.</span></div><div className="sc"><input type="number" min={1} max={720} value={cfg.validityDays} onChange={(e) => set('validityDays', e.target.value === '' ? 1 : Number(e.target.value))} /> <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>days</span></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-violet"><i className="ti ti-wand" /></span><div><b>Auto Stream Suggestion</b><p>Recommend streams from candidate profiles.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Suggest streams automatically</b><span>Surface best-fit streams during signup.</span></div><div className="sc"><Switch on={cfg.autoSuggest} label="Suggest streams automatically" onClick={() => set('autoSuggest', !cfg.autoSuggest)} /></div></div>
            <div className={`set-row${cfg.autoSuggest ? '' : ' disabled'}`}><div className="sl"><b>Suggestion basis</b><span>Signals used to rank streams.</span></div><div className="sc"><Pick opts={['Skills', 'Past evaluations', 'Skills + evaluations']} value={cfg.suggestBasis} onPick={(v) => set('suggestBasis', v)} /></div></div>
            <div className={`set-row${cfg.autoSuggest ? '' : ' disabled'}`}><div className="sl"><b>Confidence threshold</b><span>Minimum match to show a suggestion.</span></div><div className="sc"><input type="range" min={0} max={100} value={cfg.confidence} aria-label="Confidence threshold" onChange={(e) => set('confidence', Number(e.target.value))} /> <span className="rv">{cfg.confidence}%</span></div></div>
          </div>
        </div>

        <div className="sr-foot">
          <span className={`sr-dirty${dirty ? ' show' : ''}`}><i className="ti ti-point-filled" /> Unsaved changes</span>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn btn-ghost" type="button" onClick={onReset}><i className="ti ti-rotate" /> Reset to defaults</button>
          <button className="btn btn-primary" type="button" onClick={onSave}><i className="ti ti-device-floppy" /> Save rules</button>
        </div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Route** — in `client/src/App.tsx`:
```tsx
import { StreamRulesPage } from './pages/Streams/rules/StreamRulesPage.js';
```
```tsx
        <Route path="/streams/rules" element={<ProtectedRoute><StreamRulesPage /></ProtectedRoute>} />
```

- [ ] **Step 5: Run test + type-check** — `npm test -w client -- StreamRules && npx -w client tsc --noEmit`.
- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Streams/rules/StreamRulesPage.tsx client/src/App.tsx client/src/test/StreamRules.test.tsx
git commit -m "feat(client): Stream Selection Rules settings page + route"
```

---

## Task 9: Full-suite verification + live E2E smoke

**Files:** none (verification only).

- [ ] **Step 1: Full suites** — `npm test -w server && npm test -w client`.
- [ ] **Step 2: Type-check both** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit`.
- [ ] **Step 3: Build** — `npm run -w client build`.
- [ ] **Step 4: Re-seed + live smoke** (controller, fresh admin token):
  - `GET /api/streams` → 5 streams; `Business Analytics` Disabled; each `flow` canonical order.
  - `GET /api/streams?parent=Engineering` → 3; `?status=Disabled` → 1; `?sort=cutoff&order=desc` → Data/ML (72) first.
  - `PATCH /api/streams/:id {cutoff:75}` → version bumps + "Edited stream configuration"; `{status:'Disabled'}` PATCH → NO bump.
  - `POST /api/streams/:id/restore {v:'1.0'}` → bump + "Restored v1.0".
  - `GET /api/stream-rules` → defaults (`numAllowed:'2'`); `PUT` with a change → re-GET reflects it; restore defaults via `PUT SR_DEFAULTS`.
- [ ] **Step 5: No commit** (verification task).

---

## Self-Review Notes (author)

- **Spec coverage:** Stream CRUD/versioning/restore/sort/filters → T1/T2/T7; StreamRules singleton GET-defaults/PUT → T3/T8; seed 5 streams + rules → T4; editor (tags/flow/chips/cutoff) → T6; table + version modal + page + nav → T7; rules settings page (dependent rows, summary, save/reset) → T8. All spec §3/§4/§5/§6/§7 items map to a task.
- **Version rule:** editor save (any config field) bumps + "Edited stream configuration"; status-only PATCH doesn't (T1 test asserts both). `flow` canonicalized on every write (T1 + T2 assert).
- **PATCH clobber guard:** `updateStreamSchema` explicit all-optional (learned from eval-configs). No delete/clone (faithful).
- **Type consistency:** `StreamAction` once in StreamTable.tsx; `StreamItem`/`StreamInput`/`StreamRules` once in types/streams.ts; server `StreamItem` mirrors the client type; `PARENTS`/`ALL_FLOW` shared via types; the constant order in `orderedFlow` matches server + client.
- **Kebab positioning:** StreamTable's `RowKebab` uses the positioned `.rowact` container (the fix Templates needed) from the start.
- **Accepted minor drift:** `streamRulesSummary` returns a plain sentence (the prototype bolds values via `.hl`) — a pure/testable util over exact visual parity. The editor's create-mode default `flow` is `[]` (the prototype defaults to `['MCQ','Coding','TARA']`) to keep the editor test's canonical-order assertion clean — a deliberate, documented simplification; the saved flow is always canonical either way.
- **Sort:** server-side (collation for case-insensitive name/parent), driven by the page's sort/order state via the query key — exercises the API sort params rather than leaving them dead.
