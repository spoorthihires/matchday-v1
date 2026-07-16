# Evaluations Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Evaluations area — a card-grid CRUD of assessment configs (`/evaluations`, new `EvalConfig` collection) and a read-only live pipeline dashboard (`/evaluations/monitor`) derived from `Jobseeker` — faithful to `matchday-admin-app_23.html` (Management 1784–1816 + runtime 3194–3285; Monitoring 1849–1890 + runtime 3287–3360).

**Architecture:** New `EvalConfig` Mongoose collection + `/api/eval-configs` REST module (mirrors the slots/templates modules; no versioning). A read-only `/api/eval-monitor` endpoint that loads `Jobseeker` docs and **deterministically derives** each candidate's 10-stage monitoring position + contest/employer/score/minsAgo (`hash(_id)`, reproducible). React pages under `client/src/pages/Evaluations/` mirroring the Slots/Templates shells; the Monitoring page computes all counts/funnels/KPIs client-side from the returned candidate array and runs an ephemeral "advance one candidate / 3.5s" simulation over local state. The Command Center is NOT modified.

**Tech Stack:** Express 4 + Mongoose 8 + zod (server, TS strict, ESM `.js` suffixes); React 18 + Vite + react-router-dom 6 + @tanstack/react-query 5 (client); Vitest + supertest + mongodb-memory-server (server tests); Vitest + RTL + jsdom (client tests).

## Global Constraints

- **Error contract:** all API errors `{ error: { message, code } }`. zod parse failure → 400 `validation` (existing `errorHandler`); not-found → 404 `not_found`; missing/invalid token → 401 (`requireAuth`). Copy exactly from the slots module.
- **ESM imports:** every relative import ends in `.js`. `"strict": true` — no implicit `any`.
- **`tsc --noEmit` MUST pass** for every task (`npx -w server tsc --noEmit` / `npx -w client tsc --noEmit`) — vitest does not type-check.
- **No `timestamps: true`** — explicit `createdAt`/`updatedAt`.
- **`type` enum baked at the model** (matches `Slot.status`/`DriveTemplate.status` precedent); other multi-value fields (`retake`) are plain `String` at the model, zod-enforced. Type values verbatim: `MCQ`, `Coding`, `TARA`, `Assignments`. Retake values: `Not allowed`, `After cooldown`, `Unlimited`, `Admin approval`.
- **Actor / no versioning:** eval configs have NO version history. `contests` is a stored stat (default 0), never derived.
- **The Command Center is untouched** — do NOT edit `dashboard.service.ts` or its tests.
- **Monitoring stage-9 set** MUST equal the CC's match-ready definition — `stage ∈ {MatchReady, Shortlisted, Offer, Joined}` (see `dashboard.service.ts:59`) — so KPIs reconcile.
- **Deterministic derivation:** the monitor derivation uses a stable integer hash of the `_id` hex — NEVER `Math.random()` / `Date.now()` server-side. (The client simulation MAY use `Math.random()` — it is ephemeral and never persisted.)
- **Faithful CSS:** reuse prototype class names already in `client/src/styles/theme.css` — Management: `.tpl-grid`, `.tpl-card` (+`.ev-off`), `.tpl-head`, `.tpl-ic ic`, `.tt`, `.meta`, `.chip dom`, `.badge-st`/`.st-active`/`.st-draft`, `.switch`(+`.on`, `.ev-toggle`), `.tpl-sections`, `.tsec`(+`.wide`), `.tsv`, `.tpl-foot`, `.used`, `.grow`, `.kebab-menu`, `.dm-toolbar`, `.dm-search`, `.select`, `.btn`/`.btn-ghost`/`.btn-primary`, `.modal-scrim`/`.modal`/`.modal-h`/`.modal-b`/`.modal-f`/`.fld`(+`.full`)/`.x`/`.fnote`, `.dm-empty`. Monitoring: `.backlink`, `.live-dot`, `.kpis`/`.kpi`/`.kh`/`.kv`/`.kd`(+`.up`/`.flat`)/`.mono`/`.ic`(+`.i-*`), `.section-title`/`.rule`, `.stage-strip`/`.stage-card`(+`.on`)/`.top`/`.sc-n`/`.sc-l`, `.grid-2`/`.card`/`.card-h`/`.sub`, `.funnel`/`.fstep`/`.fl`/`.name`/`.v`/`.pct`/`.ftrack`, `.dm-table-wrap`/`.dm-scroll`/`.dm`/`.dm-name`/`.stbadge`/`.cap`/`.dm-pager`/`.pinfo`, `.row-flash`. Do NOT add new CSS.

---

## File Structure

```
server/src/
  models/EvalConfig.ts                              # T1 create
  modules/evalConfigs/
    eval-configs.schemas.ts service.ts controller.ts routes.ts   # T1/T2 create
  modules/evalMonitor/
    eval-monitor.service.ts controller.ts routes.ts # T3 create
  app.ts                                            # T2+T3 modify (mount)
  seed/seed.ts                                      # T4 modify (4 configs + cleanup)
server/test/
  eval-configs.service.test.ts eval-configs.route.test.ts   # T1/T2
  eval-monitor.service.test.ts eval-monitor.route.test.ts   # T3
client/src/
  types/evaluations.ts                              # T5
  pages/Evaluations/
    monitor/monitorUtils.ts                         # T5
    hooks/useEvalConfigs.ts useEvalConfigMutations.ts useEvalMonitor.ts  # T5
    EvalConfigCards.tsx EvalConfigModal.tsx index.tsx           # T6
    monitor/EvalMonitorPage.tsx                     # T7
  App.tsx components/Sidebar.tsx                    # T6 (route+nav) + T7 (monitor route)
client/src/test/
  monitorUtils.test.ts                              # T5
  EvalConfigCards.test.tsx EvalConfigModal.test.tsx # T6
  EvalMonitor.test.tsx                              # T7
```

---

## Task 1: Server — EvalConfig model, schemas, service (+ service tests)

**Files:** Create `server/src/models/EvalConfig.ts`, `server/src/modules/evalConfigs/eval-configs.schemas.ts`, `server/src/modules/evalConfigs/service.ts`; Test `server/test/eval-configs.service.test.ts`.

**Interfaces:**
- Consumes: `HttpError` from `../../middleware/errorHandler.js`; `Types` from `mongoose`.
- Produces (used by T2): `codeFor(id): string`; async `listEvalConfigs(params)`, `createEvalConfig(input)`, `getEvalConfig(id)`, `updateEvalConfig(id, patch)`, `duplicateEvalConfig(id)`, `deleteEvalConfig(id)`; zod `createEvalConfigSchema`, `updateEvalConfigSchema`, `listQuerySchema`, and inferred `CreateEvalConfigInput`/`UpdateEvalConfigInput`; `EvalConfigItem` type.

- [ ] **Step 1: Model** — `server/src/models/EvalConfig.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const evalConfigSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['MCQ', 'Coding', 'TARA', 'Assignments'], default: 'MCQ' },
  enabled: { type: Boolean, default: true },
  passing: { type: Number, default: 60 },
  attempts: { type: Number, default: 2 },
  retake: { type: String, default: 'After cooldown' },
  cooldown: { type: Number, default: 2 },
  validity: { type: Number, default: 90 },
  autoQual: { type: Boolean, default: false },
  threshold: { type: Number, default: 70 },
  contests: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export type EvalConfigDoc = InferSchemaType<typeof evalConfigSchema>;
export const EvalConfig = model('EvalConfig', evalConfigSchema);
```

- [ ] **Step 2: Schemas** — `server/src/modules/evalConfigs/eval-configs.schemas.ts`:

```ts
import { z } from 'zod';

export const EVAL_TYPES = ['MCQ', 'Coding', 'TARA', 'Assignments'] as const;
const RETAKES = ['Not allowed', 'After cooldown', 'Unlimited', 'Admin approval'] as const;

export const createEvalConfigSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(EVAL_TYPES).default('MCQ'),
  enabled: z.boolean().default(true),
  passing: z.coerce.number().int().min(0).max(100).default(60),
  attempts: z.coerce.number().int().min(1).max(10).default(2),
  retake: z.enum(RETAKES).default('After cooldown'),
  cooldown: z.coerce.number().int().min(0).max(90).default(2),
  validity: z.coerce.number().int().min(1).max(365).default(90),
  autoQual: z.boolean().default(false),
  threshold: z.coerce.number().int().min(0).max(100).default(70),
});

// NOT createEvalConfigSchema.partial() — the base carries .default()s that would inject values
// on omitted PATCH keys and clobber stored data. Declare an explicit all-optional shape.
export const updateEvalConfigSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(EVAL_TYPES).optional(),
  enabled: z.boolean().optional(),
  passing: z.coerce.number().int().min(0).max(100).optional(),
  attempts: z.coerce.number().int().min(1).max(10).optional(),
  retake: z.enum(RETAKES).optional(),
  cooldown: z.coerce.number().int().min(0).max(90).optional(),
  validity: z.coerce.number().int().min(1).max(365).optional(),
  autoQual: z.boolean().optional(),
  threshold: z.coerce.number().int().min(0).max(100).optional(),
});

export const listQuerySchema = z.object({
  q: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),   // 'Active' | 'Inactive'
});

export type CreateEvalConfigInput = z.infer<typeof createEvalConfigSchema>;
export type UpdateEvalConfigInput = z.infer<typeof updateEvalConfigSchema>;
```

- [ ] **Step 3: Failing service test** — `server/test/eval-configs.service.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { EvalConfig } from '../src/models/EvalConfig.js';
import {
  codeFor, listEvalConfigs, createEvalConfig, getEvalConfig,
  updateEvalConfig, duplicateEvalConfig, deleteEvalConfig,
} from '../src/modules/evalConfigs/service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const input = (over: Record<string, unknown> = {}) => ({
  name: 'Standard MCQ round', type: 'MCQ' as const, enabled: true, passing: 60, attempts: 2,
  retake: 'After cooldown' as const, cooldown: 2, validity: 90, autoQual: true, threshold: 70, ...over,
});

describe('evalConfigs.service', () => {
  it('creates with contests=0 and a TPL-style code + id', async () => {
    const c = await createEvalConfig(input());
    expect(c.contests).toBe(0);
    const { items } = await listEvalConfigs({});
    expect(items[0].code).toMatch(/^EVC-[0-9A-F]{3}$/);
    expect(items[0].id).toBeTruthy();
  });

  it('lists with q/type/status filters, newest-updated first', async () => {
    await createEvalConfig(input({ name: 'Alpha MCQ', type: 'MCQ', enabled: true }));
    await createEvalConfig(input({ name: 'Beta Coding', type: 'Coding', enabled: false }));
    const all = await listEvalConfigs({});
    expect(all.items).toHaveLength(2);
    expect(all.items[0].name).toBe('Beta Coding');           // newest-updated first
    expect((await listEvalConfigs({ q: 'alpha' })).items).toHaveLength(1);
    expect((await listEvalConfigs({ type: 'Coding' })).items).toHaveLength(1);
    expect((await listEvalConfigs({ status: 'Active' })).items).toHaveLength(1);   // enabled true
    expect((await listEvalConfigs({ status: 'Inactive' })).items).toHaveLength(1); // enabled false
  });

  it('patches (incl. enable toggle) and bumps updatedAt', async () => {
    const c = await createEvalConfig(input({ enabled: true }));
    const off = await updateEvalConfig(String(c._id), { enabled: false });
    expect(off.enabled).toBe(false);
    const rescored = await updateEvalConfig(String(c._id), { passing: 80 });
    expect(rescored.passing).toBe(80);
    expect(rescored.enabled).toBe(false);   // prior toggle preserved (no default clobber)
  });

  it('duplicates as "(Copy)", disabled, contests 0', async () => {
    const c = await createEvalConfig(input({ name: 'Coding challenge', enabled: true }));
    c.contests = 6; await c.save();
    const d = await duplicateEvalConfig(String(c._id));
    expect(d.name).toBe('Coding challenge (Copy)');
    expect(d.enabled).toBe(false);
    expect(d.contests).toBe(0);
    expect(d.passing).toBe(c.passing);
    expect(await EvalConfig.countDocuments({})).toBe(2);
  });

  it('deletes and 404s on unknown/malformed ids', async () => {
    const c = await createEvalConfig(input());
    expect(await deleteEvalConfig(String(c._id))).toEqual({ deleted: true });
    await expect(getEvalConfig(String(c._id))).rejects.toThrow();
    await expect(getEvalConfig('nope')).rejects.toThrow();
  });

  it('codeFor derives EVC-<3 upper hex>', () => {
    expect(codeFor('64b000000000000000000abc')).toBe('EVC-ABC');
  });
});
```

- [ ] **Step 4: Run test — expect FAIL** — `npm test -w server -- eval-configs.service` (module missing).

- [ ] **Step 5: Service** — `server/src/modules/evalConfigs/service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { EvalConfig, type EvalConfigDoc } from '../../models/EvalConfig.js';
import type { CreateEvalConfigInput, UpdateEvalConfigInput } from './eval-configs.schemas.js';

export interface EvalConfigItem {
  id: string; code: string; name: string; type: string; enabled: boolean;
  passing: number; attempts: number; retake: string; cooldown: number; validity: number;
  autoQual: boolean; threshold: number; contests: number;
  createdAt: string; updatedAt: string;
}

export function codeFor(id: unknown): string {
  return `EVC-${String(id).slice(-3).toUpperCase()}`;
}
function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Configuration not found', 'not_found');
}
function toItem(d: EvalConfigDoc & { _id: unknown }): EvalConfigItem {
  return {
    id: String(d._id), code: codeFor(d._id), name: d.name, type: d.type ?? 'MCQ',
    enabled: d.enabled ?? true, passing: d.passing ?? 0, attempts: d.attempts ?? 1,
    retake: d.retake ?? 'After cooldown', cooldown: d.cooldown ?? 0, validity: d.validity ?? 0,
    autoQual: d.autoQual ?? false, threshold: d.threshold ?? 0, contests: d.contests ?? 0,
    createdAt: new Date(d.createdAt as Date).toISOString(),
    updatedAt: new Date(d.updatedAt as Date).toISOString(),
  };
}

export async function listEvalConfigs(params: { q?: string; type?: string; status?: string }) {
  const match: Record<string, unknown> = {};
  if (params.type) match.type = params.type;
  if (params.status === 'Active') match.enabled = true;
  else if (params.status === 'Inactive') match.enabled = false;
  if (params.q && params.q.trim()) {
    const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { type: rx }];
  }
  const rows = await EvalConfig.find(match).sort({ updatedAt: -1 }).lean();
  return { items: rows.map((r) => toItem(r as never)) };
}

export async function createEvalConfig(input: CreateEvalConfigInput) {
  const now = new Date();
  return EvalConfig.create({ ...input, contests: 0, createdAt: now, updatedAt: now });
}
export async function getEvalConfig(id: string) {
  assertId(id);
  const c = await EvalConfig.findById(id);
  if (!c) throw new HttpError(404, 'Configuration not found', 'not_found');
  return c;
}
export async function updateEvalConfig(id: string, patch: UpdateEvalConfigInput) {
  const c = await getEvalConfig(id);
  Object.assign(c, patch);
  c.updatedAt = new Date();
  await c.save();
  return c;
}
export async function duplicateEvalConfig(id: string) {
  const c = await getEvalConfig(id);
  const now = new Date();
  return EvalConfig.create({
    name: `${c.name} (Copy)`, type: c.type, enabled: false,
    passing: c.passing, attempts: c.attempts, retake: c.retake, cooldown: c.cooldown,
    validity: c.validity, autoQual: c.autoQual, threshold: c.threshold, contests: 0,
    createdAt: now, updatedAt: now,
  });
}
export async function deleteEvalConfig(id: string) {
  const c = await getEvalConfig(id);
  await c.deleteOne();
  return { deleted: true as const };
}
```

- [ ] **Step 6: Run test — expect PASS** — `npm test -w server -- eval-configs.service` (6 tests).
- [ ] **Step 7: Type-check** — `npx -w server tsc --noEmit`.
- [ ] **Step 8: Commit**

```bash
git add server/src/models/EvalConfig.ts server/src/modules/evalConfigs/eval-configs.schemas.ts server/src/modules/evalConfigs/service.ts server/test/eval-configs.service.test.ts
git commit -m "feat(server): EvalConfig model, schemas, and eval-configs service"
```

---

## Task 2: Server — eval-configs controller, routes, mount (+ route tests)

**Files:** Create `server/src/modules/evalConfigs/controller.ts`, `routes.ts`; Modify `server/src/app.ts`; Test `server/test/eval-configs.route.test.ts`.

**Interfaces:** Consumes T1 service + schemas, `asyncHandler`, `requireAuth`. Produces `evalConfigRoutes`. `POST /` and `POST /:id/duplicate` → 201; others → 200.

- [ ] **Step 1: Controller** — `server/src/modules/evalConfigs/controller.ts`:

```ts
import type { Request, Response } from 'express';
import { createEvalConfigSchema, updateEvalConfigSchema, listQuerySchema } from './eval-configs.schemas.js';
import {
  listEvalConfigs, getEvalConfig, createEvalConfig, updateEvalConfig,
  duplicateEvalConfig, deleteEvalConfig,
} from './service.js';

export async function listController(req: Request, res: Response) {
  res.json(await listEvalConfigs(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createEvalConfig(createEvalConfigSchema.parse(req.body)));
}
export async function getController(req: Request, res: Response) {
  res.json(await getEvalConfig(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateEvalConfig(req.params.id, updateEvalConfigSchema.parse(req.body)));
}
export async function duplicateController(req: Request, res: Response) {
  res.status(201).json(await duplicateEvalConfig(req.params.id));
}
export async function deleteController(req: Request, res: Response) {
  res.json(await deleteEvalConfig(req.params.id));
}
```

- [ ] **Step 2: Routes** — `server/src/modules/evalConfigs/routes.ts` (sub-path before bare `/:id`):

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, createController, getController, patchController,
  duplicateController, deleteController,
} from './controller.js';

export const evalConfigRoutes = Router();
evalConfigRoutes.use(requireAuth);
evalConfigRoutes.get('/', asyncHandler(listController));
evalConfigRoutes.post('/', asyncHandler(createController));
evalConfigRoutes.post('/:id/duplicate', asyncHandler(duplicateController));
evalConfigRoutes.get('/:id', asyncHandler(getController));
evalConfigRoutes.patch('/:id', asyncHandler(patchController));
evalConfigRoutes.delete('/:id', asyncHandler(deleteController));
```

- [ ] **Step 3: Mount in app.ts** — add the import alongside the others and the mount after `slotRoutes` (before `errorHandler`):

```ts
import { evalConfigRoutes } from './modules/evalConfigs/routes.js';
```
```ts
  app.use('/api/eval-configs', evalConfigRoutes);
```

- [ ] **Step 4: Failing route test** — `server/test/eval-configs.route.test.ts`:

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
const body = { name: 'Standard MCQ round', type: 'MCQ', passing: 60, attempts: 2, retake: 'After cooldown', cooldown: 2, validity: 90, autoQual: true, threshold: 70 };

describe('eval-configs routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/eval-configs')).status).toBe(401);
  });
  it('creates (201), lists+filters, duplicates, patches, deletes; 400 bad type; 404 unknown', async () => {
    const c = await auth(request(createApp()).post('/api/eval-configs').send(body));
    expect(c.status).toBe(201);
    expect(c.body.contests).toBe(0);
    const id = c.body._id;
    const list = await auth(request(createApp()).get('/api/eval-configs?type=MCQ'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].code).toMatch(/^EVC-/);
    const dup = await auth(request(createApp()).post(`/api/eval-configs/${id}/duplicate`));
    expect(dup.status).toBe(201);
    expect(dup.body.name).toBe('Standard MCQ round (Copy)');
    expect(dup.body.enabled).toBe(false);
    const patched = await auth(request(createApp()).patch(`/api/eval-configs/${id}`).send({ enabled: false }));
    expect(patched.body.enabled).toBe(false);
    const bad = await auth(request(createApp()).post('/api/eval-configs').send({ ...body, type: 'Nope' }));
    expect(bad.status).toBe(400);
    const del = await auth(request(createApp()).delete(`/api/eval-configs/${id}`));
    expect(del.body).toEqual({ deleted: true });
    const miss = await auth(request(createApp()).get('/api/eval-configs/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run test — expect PASS** — `npm test -w server -- eval-configs.route`.
- [ ] **Step 6: Type-check + full server suite** — `npx -w server tsc --noEmit && npm test -w server`.
- [ ] **Step 7: Commit**

```bash
git add server/src/modules/evalConfigs/controller.ts server/src/modules/evalConfigs/routes.ts server/src/app.ts server/test/eval-configs.route.test.ts
git commit -m "feat(server): eval-configs controller, routes, and /api/eval-configs mount"
```

---

## Task 3: Server — eval-monitor derivation service + route (+ tests)

**Files:** Create `server/src/modules/evalMonitor/eval-monitor.service.ts`, `controller.ts`, `routes.ts`; Modify `server/src/app.ts`; Test `server/test/eval-monitor.service.test.ts`, `server/test/eval-monitor.route.test.ts`.

**Interfaces:**
- Consumes: `Jobseeker` model, `Institute` model, `asyncHandler`, `requireAuth`.
- Produces: `deriveStage(jsLike, h): number`, `hashId(id): number`, `MonitorCandidate` type, `getEvalMonitor(params): Promise<{candidates, contests, employers, institutes}>`; `evalMonitorRoutes`. GET → 200.

- [ ] **Step 1: Failing service test** — `server/test/eval-monitor.service.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { deriveStage, getEvalMonitor } from '../src/modules/evalMonitor/eval-monitor.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

let instId: string;
async function seedInst() { const i = await Institute.create({ name: 'VNR', location: 'Hyderabad', status: 'Active' }); instId = String(i._id); }
const js = (over: Record<string, unknown> = {}) => ({
  name: 'A B', instituteId: instId, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus',
  profileCompleted: false, evaluationStatus: 'na', stage: 'Applied', ...over,
});

describe('eval-monitor.service — derivation', () => {
  it('maps each jobseeker band to the right monitoring stage', async () => {
    await seedInst();
    // hash is deterministic; assert bands, not the exact spread index
    expect(deriveStage({ stage: 'Joined', evaluationStatus: 'completed', profileCompleted: true }, 0)).toBe(9);
    expect(deriveStage({ stage: 'Shortlisted', evaluationStatus: 'na', profileCompleted: true }, 3)).toBe(9);
    expect(deriveStage({ stage: 'Screened', evaluationStatus: 'completed', profileCompleted: true }, 1)).toBe(8);
    const pend = deriveStage({ stage: 'Screened', evaluationStatus: 'pending', profileCompleted: true }, 2);
    expect(pend).toBeGreaterThanOrEqual(3);
    expect(pend).toBeLessThanOrEqual(7);
    expect(deriveStage({ stage: 'Applied', evaluationStatus: 'na', profileCompleted: true }, 5)).toBe(2);
    const early = deriveStage({ stage: 'Applied', evaluationStatus: 'na', profileCompleted: false }, 4);
    expect(early === 0 || early === 1).toBe(true);
  });

  it('excludes DroppedOff and reconciles stage-9 with the match-ready set; deterministic', async () => {
    await seedInst();
    await Jobseeker.create(js({ stage: 'DroppedOff' }));
    await Jobseeker.create(js({ stage: 'MatchReady', evaluationStatus: 'completed', profileCompleted: true }));
    await Jobseeker.create(js({ stage: 'Joined', evaluationStatus: 'completed', profileCompleted: true }));
    await Jobseeker.create(js({ stage: 'Applied' }));
    const a = await getEvalMonitor({});
    const b = await getEvalMonitor({});
    expect(a.candidates).toHaveLength(3);                       // DroppedOff excluded
    expect(a.candidates.filter((c) => c.stage === 9)).toHaveLength(2);  // MatchReady + Joined
    // deterministic: same candidate → same derived dims across calls
    const byId = (r: typeof a) => r.candidates.map((c) => `${c.id}:${c.stage}:${c.contest}:${c.employer}`).sort();
    expect(byId(a)).toEqual(byId(b));
    expect(a.contests).toHaveLength(4);
    expect(a.employers).toHaveLength(4);
    expect(a.institutes).toContain('VNR');
  });

  it('filters by contest/employer/institute/date', async () => {
    await seedInst();
    for (let i = 0; i < 12; i++) await Jobseeker.create(js({ stage: 'Applied' }));
    const all = await getEvalMonitor({});
    const c0 = all.contests[0];
    const filtered = await getEvalMonitor({ contest: c0 });
    expect(filtered.candidates.every((x) => x.contest === c0)).toBe(true);
    expect(filtered.candidates.length).toBeLessThanOrEqual(all.candidates.length);
    const byInst = await getEvalMonitor({ institute: 'VNR' });
    expect(byInst.candidates.every((x) => x.institute === 'VNR')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**.

- [ ] **Step 3: Service** — `server/src/modules/evalMonitor/eval-monitor.service.ts`:

```ts
import { Jobseeker } from '../../models/Jobseeker.js';
import { Institute } from '../../models/Institute.js';

export const EM_CONTESTS = ['Frontend · Jul cohort', 'Backend · Jul cohort', 'Data/ML Specialists', 'Full-stack · Aug'];
export const EM_EMPLOYERS = ['Nexatech Labs', 'Aetherverse AI', 'Quantbridge', 'Helioserv'];
const MATCH_READY = new Set(['MatchReady', 'Shortlisted', 'Offer', 'Joined']);

export interface MonitorCandidate {
  id: string; code: string; name: string; institute: string;
  contest: string; employer: string; stage: number; score: number; minsAgo: number;
}

// Stable integer hash of the id hex — deterministic across requests (NOT Math.random).
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function deriveStage(
  js: { stage: string; evaluationStatus?: string; profileCompleted?: boolean },
  h: number,
): number {
  if (MATCH_READY.has(js.stage)) return 9;
  if (js.evaluationStatus === 'completed') return 8;
  if (js.evaluationStatus === 'pending') return 3 + (h % 5);   // 3..7
  if (js.profileCompleted) return 2;
  return h % 2;                                                // 0..1
}

const DATE_CAP: Record<string, number> = {
  'Today': 1440, 'Last 7 days': 10080, 'Last 30 days': 43200,
};

export async function getEvalMonitor(params: { contest?: string; employer?: string; institute?: string; date?: string }) {
  const insts = await Institute.find({}).select('name').lean();
  const instName = new Map(insts.map((i) => [String(i._id), i.name]));
  const rows = await Jobseeker.find({ stage: { $ne: 'DroppedOff' } }).lean();

  let candidates: MonitorCandidate[] = rows.map((r) => {
    const id = String(r._id);
    const h = hashId(id);
    const stage = deriveStage(r as never, h);
    return {
      id, code: `C-${id.slice(-6).toUpperCase()}`, name: r.name,
      institute: instName.get(String(r.instituteId)) ?? '—',
      contest: EM_CONTESTS[h % 4], employer: EM_EMPLOYERS[(h >>> 3) % 4],
      stage, score: stage >= 2 ? 45 + (h % 55) : 0, minsAgo: h % 2880,
    };
  });

  if (params.contest) candidates = candidates.filter((c) => c.contest === params.contest);
  if (params.employer) candidates = candidates.filter((c) => c.employer === params.employer);
  if (params.institute) candidates = candidates.filter((c) => c.institute === params.institute);
  const cap = params.date ? DATE_CAP[params.date] : undefined;
  if (cap !== undefined) candidates = candidates.filter((c) => c.minsAgo <= cap);

  return {
    candidates,
    contests: EM_CONTESTS,
    employers: EM_EMPLOYERS,
    institutes: insts.map((i) => i.name).sort(),
  };
}
```

- [ ] **Step 4: Run service test — expect PASS**.

- [ ] **Step 5: Controller + routes + mount** — `server/src/modules/evalMonitor/controller.ts`:

```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getEvalMonitor } from './eval-monitor.service.js';

const querySchema = z.object({
  contest: z.string().optional(), employer: z.string().optional(),
  institute: z.string().optional(), date: z.string().optional(),
});

export async function monitorController(req: Request, res: Response) {
  res.json(await getEvalMonitor(querySchema.parse(req.query)));
}
```

`server/src/modules/evalMonitor/routes.ts`:

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { monitorController } from './controller.js';

export const evalMonitorRoutes = Router();
evalMonitorRoutes.use(requireAuth);
evalMonitorRoutes.get('/', asyncHandler(monitorController));
```

In `server/src/app.ts` add the import and mount (after `evalConfigRoutes`):
```ts
import { evalMonitorRoutes } from './modules/evalMonitor/routes.js';
```
```ts
  app.use('/api/eval-monitor', evalMonitorRoutes);
```

- [ ] **Step 6: Failing route test** — `server/test/eval-monitor.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);

describe('eval-monitor route', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/eval-monitor')).status).toBe(401);
  });
  it('returns candidates + filter option lists', async () => {
    const i = await Institute.create({ name: 'VNR', location: 'Hyderabad', status: 'Active' });
    await Jobseeker.create({ name: 'A B', instituteId: i._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', stage: 'MatchReady', profileCompleted: true, evaluationStatus: 'completed' });
    const res = await auth(request(createApp()).get('/api/eval-monitor'));
    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0].stage).toBe(9);
    expect(res.body.contests).toHaveLength(4);
    expect(res.body.institutes).toContain('VNR');
  });
});
```

- [ ] **Step 7: Run route test — expect PASS**.
- [ ] **Step 8: Type-check + full server suite** — `npx -w server tsc --noEmit && npm test -w server`.
- [ ] **Step 9: Commit**

```bash
git add server/src/modules/evalMonitor/ server/src/app.ts server/test/eval-monitor.service.test.ts server/test/eval-monitor.route.test.ts
git commit -m "feat(server): eval-monitor derivation service, route, and mount"
```

---

## Task 4: Server — seed 4 eval configs

**Files:** Modify `server/src/seed/seed.ts` (import `EvalConfig`, add to `deleteMany` group, insert 4 configs before the "Seed complete" log).

- [ ] **Step 1: Import** — add alongside the other model imports:
```ts
import { EvalConfig } from '../models/EvalConfig.js';
```

- [ ] **Step 2: Cleanup** — add `EvalConfig.deleteMany({})` to the `Promise.all([...])` group.

- [ ] **Step 3: Insert** — immediately before `console.log('Seed complete.');`:

```ts
  // ---- Evaluation configs (4, verbatim from the prototype's evConfigs array) ----
  const evalConfigDocs = [
    { name: 'Standard MCQ round', type: 'MCQ', enabled: true, passing: 60, attempts: 2, retake: 'After cooldown', cooldown: 2, validity: 90, autoQual: true, threshold: 70, contests: 8, updatedAt: daysAgo(2), createdAt: daysAgo(40) },
    { name: 'Coding challenge', type: 'Coding', enabled: true, passing: 65, attempts: 1, retake: 'Admin approval', cooldown: 3, validity: 120, autoQual: true, threshold: 75, contests: 6, updatedAt: daysAgo(5), createdAt: daysAgo(45) },
    { name: 'TARA AI interview', type: 'TARA', enabled: true, passing: 55, attempts: 1, retake: 'Not allowed', cooldown: 0, validity: 60, autoQual: false, threshold: 70, contests: 5, updatedAt: daysAgo(1), createdAt: daysAgo(30) },
    { name: 'Take-home assignment', type: 'Assignments', enabled: false, passing: 50, attempts: 2, retake: 'Unlimited', cooldown: 1, validity: 45, autoQual: false, threshold: 70, contests: 0, updatedAt: daysAgo(14), createdAt: daysAgo(20) },
  ];
  await EvalConfig.insertMany(evalConfigDocs);
```
(`daysAgo` already exists in `seed.ts`'s `run()` scope — reuse it, do NOT redeclare. If it is not in scope at the insertion point, use `new Date(NOW.getTime() - n * DAY)` inline.)

- [ ] **Step 4: Run seed** — `npm run seed -w server` (expect "Seed complete.", no throw).
- [ ] **Step 5: Type-check** — `npx -w server tsc --noEmit`.
- [ ] **Step 6: Commit**

```bash
git add server/src/seed/seed.ts
git commit -m "feat(server): seed 4 evaluation configs from the prototype"
```

---

## Task 5: Client — types, monitorUtils, hooks (+ utils test)

**Files:** Create `client/src/types/evaluations.ts`, `client/src/pages/Evaluations/monitor/monitorUtils.ts`, `client/src/pages/Evaluations/hooks/useEvalConfigs.ts`, `useEvalConfigMutations.ts`, `useEvalMonitor.ts`; Test `client/src/test/monitorUtils.test.ts`.

**Interfaces:**
- Consumes: `apiFetch`, `useAuth`, react-query.
- Produces: types `EvalConfigItem`, `EvalConfigInput`, `EvalConfigListResponse`, `MonitorCandidate`, `MonitorResponse`, `EVAL_TYPES`, `RETAKE_OPTIONS`; utils `STAGES`, `fmtMins`, `stageCounts`, `reachedCounts`, `monitorKpis`; hooks `useEvalConfigs(params)` (key `['eval-configs', q, type, status]`), `useEvalConfigMutations()` (`{create, update, duplicate, remove}` → invalidate `['eval-configs']`), `useEvalMonitor(params)` (key `['eval-monitor', contest, employer, institute, date]`).

- [ ] **Step 1: Types** — `client/src/types/evaluations.ts`:

```ts
export const EVAL_TYPES = ['MCQ', 'Coding', 'TARA', 'Assignments'] as const;
export type EvalType = (typeof EVAL_TYPES)[number];
export const RETAKE_OPTIONS = ['Not allowed', 'After cooldown', 'Unlimited', 'Admin approval'] as const;

export interface EvalConfigItem {
  id: string; code: string; name: string; type: string; enabled: boolean;
  passing: number; attempts: number; retake: string; cooldown: number; validity: number;
  autoQual: boolean; threshold: number; contests: number; createdAt: string; updatedAt: string;
}
export interface EvalConfigInput {
  name: string; type: string; enabled: boolean; passing: number; attempts: number;
  retake: string; cooldown: number; validity: number; autoQual: boolean; threshold: number;
}
export interface EvalConfigListResponse { items: EvalConfigItem[] }

export interface MonitorCandidate {
  id: string; code: string; name: string; institute: string;
  contest: string; employer: string; stage: number; score: number; minsAgo: number;
}
export interface MonitorResponse {
  candidates: MonitorCandidate[]; contests: string[]; employers: string[]; institutes: string[];
}
```

- [ ] **Step 2: Failing utils test** — `client/src/test/monitorUtils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STAGES, fmtMins, stageCounts, reachedCounts, monitorKpis } from '../pages/Evaluations/monitor/monitorUtils.js';
import type { MonitorCandidate } from '../types/evaluations.js';

const c = (stage: number, over: Partial<MonitorCandidate> = {}): MonitorCandidate => ({
  id: `x${stage}`, code: 'C-1', name: 'n', institute: 'i', contest: 'ct', employer: 'e',
  stage, score: 50, minsAgo: 10, ...over,
});

describe('monitorUtils', () => {
  it('STAGES has the 10 prototype stages ending in Match Ready', () => {
    expect(STAGES).toHaveLength(10);
    expect(STAGES[0].k).toBe('Invited');
    expect(STAGES[9].k).toBe('Match Ready');
    expect(STAGES[3].k).toBe('MCQ Pending');
  });
  it('stageCounts / reachedCounts', () => {
    const list = [c(0), c(2), c(2), c(9)];
    const counts = stageCounts(list);
    expect(counts[2]).toBe(2); expect(counts[9]).toBe(1); expect(counts[1]).toBe(0);
    const reached = reachedCounts(list);
    expect(reached[0]).toBe(4);   // all reached stage>=0
    expect(reached[2]).toBe(3);   // three at stage>=2
    expect(reached[9]).toBe(1);
  });
  it('monitorKpis: total, pending (3+5+7), ready (9), avg', () => {
    const list = [c(3), c(5), c(7), c(9), c(9)];
    const k = monitorKpis(list);
    expect(k.total).toBe(5);
    expect(k.pending).toBe(3);    // one each at 3,5,7
    expect(k.ready).toBe(2);      // two at 9
    expect(k.avg).toBe(Math.round((3 + 5 + 7 + 9 + 9) / 5 / 9 * 100));
  });
  it('fmtMins', () => {
    expect(fmtMins(0)).toBe('just now');
    expect(fmtMins(5)).toBe('5m ago');
    expect(fmtMins(90)).toBe('1h ago');
    expect(fmtMins(1500)).toBe('1d ago');
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**.

- [ ] **Step 4: monitorUtils** — `client/src/pages/Evaluations/monitor/monitorUtils.ts`:

```ts
import type { MonitorCandidate } from '../../../types/evaluations.js';

// Verbatim from matchday-admin-app_23.html STAGES (line 3288): label / short label / color.
export interface StageMeta { k: string; s: string; c: string }
export const STAGES: StageMeta[] = [
  { k: 'Invited', s: 'Invited', c: '#9aa0b6' },
  { k: 'Signed Up', s: 'Signed up', c: '#7c8aa5' },
  { k: 'Profile Complete', s: 'Profile', c: '#0aa3a3' },
  { k: 'MCQ Pending', s: 'MCQ pend.', c: '#f2a63b' },
  { k: 'MCQ Completed', s: 'MCQ done', c: '#e0930b' },
  { k: 'Coding Pending', s: 'Code pend.', c: '#6f8cff' },
  { k: 'Coding Completed', s: 'Code done', c: '#2f4fe0' },
  { k: 'TARA Pending', s: 'TARA pend.', c: '#a98bff' },
  { k: 'TARA Completed', s: 'TARA done', c: '#7c5cff' },
  { k: 'Match Ready', s: 'Match ready', c: '#0f9d58' },
];

export const fmtMins = (m: number): string =>
  m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;

export const stageCounts = (cands: MonitorCandidate[]): number[] =>
  STAGES.map((_, s) => cands.filter((c) => c.stage === s).length);

export const reachedCounts = (cands: MonitorCandidate[]): number[] =>
  STAGES.map((_, s) => cands.filter((c) => c.stage >= s).length);

export function monitorKpis(cands: MonitorCandidate[]) {
  const total = cands.length;
  const counts = stageCounts(cands);
  const pending = counts[3] + counts[5] + counts[7];
  const ready = counts[9];
  const avg = total ? Math.round(cands.reduce((a, c) => a + c.stage, 0) / total / 9 * 100) : 0;
  return { total, pending, ready, avg };
}
```

- [ ] **Step 5: Run test — expect PASS**.

- [ ] **Step 6: Hooks** — `client/src/pages/Evaluations/hooks/useEvalConfigs.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EvalConfigListResponse } from '../../../types/evaluations.js';

export interface EvalConfigParams { q?: string; type?: string; status?: string }

export function useEvalConfigs(params: EvalConfigParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['eval-configs', params.q, params.type, params.status],
    queryFn: () => apiFetch<EvalConfigListResponse>(`/eval-configs${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
```

`useEvalConfigMutations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EvalConfigInput } from '../../../types/evaluations.js';

export function useEvalConfigMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['eval-configs'] });
  const create = useMutation({
    mutationFn: (body: EvalConfigInput) => apiFetch('/eval-configs', { method: 'POST', body, token }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EvalConfigInput> }) =>
      apiFetch(`/eval-configs/${id}`, { method: 'PATCH', body, token }),
    onSuccess: invalidate,
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => apiFetch(`/eval-configs/${id}/duplicate`, { method: 'POST', token }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/eval-configs/${id}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
  });
  return { create, update, duplicate, remove };
}
```

`useEvalMonitor.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { MonitorResponse } from '../../../types/evaluations.js';

export interface MonitorParams { contest?: string; employer?: string; institute?: string; date?: string }

export function useEvalMonitor(params: MonitorParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['eval-monitor', params.contest, params.employer, params.institute, params.date],
    queryFn: () => apiFetch<MonitorResponse>(`/eval-monitor${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
```

- [ ] **Step 7: Type-check** — `npx -w client tsc --noEmit`.
- [ ] **Step 8: Commit**

```bash
git add client/src/types/evaluations.ts client/src/pages/Evaluations/monitor/monitorUtils.ts client/src/pages/Evaluations/hooks/ client/src/test/monitorUtils.test.ts
git commit -m "feat(client): evaluations types, monitorUtils, and hooks"
```

---

## Task 6: Client — EvalConfig cards + editor + Management page + route/nav (+ tests)

**Files:** Create `client/src/pages/Evaluations/EvalConfigCards.tsx`, `EvalConfigModal.tsx`, `index.tsx`; Modify `client/src/App.tsx` (route), `client/src/components/Sidebar.tsx` (nav); Test `client/src/test/EvalConfigCards.test.tsx`, `EvalConfigModal.test.tsx`.

**Interfaces:** Consumes T5 types/hooks. Produces `EvalConfigAction` = `'edit'|'duplicate'|'toggle'|'delete'` (defined once in EvalConfigCards.tsx); `EvalConfigCards({items, onAction, onToggle})`; `EvalConfigModal({mode, config?, onClose})`; `EvaluationsPage`.

- [ ] **Step 1: Failing cards test** — `client/src/test/EvalConfigCards.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EvalConfigCards } from '../pages/Evaluations/EvalConfigCards.js';
import type { EvalConfigItem } from '../types/evaluations.js';

const item = (over: Partial<EvalConfigItem> = {}): EvalConfigItem => ({
  id: 'e1', code: 'EVC-ABC', name: 'Standard MCQ round', type: 'MCQ', enabled: true,
  passing: 60, attempts: 2, retake: 'After cooldown', cooldown: 2, validity: 90,
  autoQual: true, threshold: 70, contests: 8, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z', ...over,
});

describe('EvalConfigCards', () => {
  it('renders tiles, type chip, and contest count', () => {
    render(<EvalConfigCards items={[item()]} onAction={() => {}} onToggle={() => {}} />);
    expect(screen.getByText('Standard MCQ round')).toBeInTheDocument();
    expect(screen.getByText('MCQ')).toBeInTheDocument();
    expect(screen.getByText(/Assigned to/)).toHaveTextContent('Assigned to 8 contests');
    expect(screen.getByText(/≥ 70%/)).toBeInTheDocument();     // auto-qualify tile
  });
  it('inline toggle fires onToggle; disabled card is dimmed', async () => {
    const onToggle = vi.fn();
    const { container } = render(<EvalConfigCards items={[item({ enabled: false })]} onAction={() => {}} onToggle={onToggle} />);
    expect(container.querySelector('.tpl-card')).toHaveClass('ev-off');
    await userEvent.setup().click(screen.getByTitle(/enable \/ disable/i));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });
  it('kebab delete fires onAction', async () => {
    const onAction = vi.fn();
    render(<EvalConfigCards items={[item()]} onAction={onAction} onToggle={() => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    await user.click(screen.getByText(/Delete/));
    expect(onAction).toHaveBeenCalledWith('delete', expect.objectContaining({ id: 'e1' }));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: EvalConfigCards.tsx** — port of prototype lines 3212–3234 (kebab mirrors the positioned pattern used by TemplateCards — the "More" button and `.kebab-menu` share a `position:relative` container):

```tsx
import { useState } from 'react';
import type { EvalConfigItem } from '../../types/evaluations.js';

export type EvalConfigAction = 'edit' | 'duplicate' | 'toggle' | 'delete';
const TYPE_META: Record<string, [string, string]> = {
  MCQ: ['ti-list-check', 'i-indigo'], Coding: ['ti-code', 'i-teal'],
  TARA: ['ti-robot', 'i-violet'], Assignments: ['ti-file-text', 'i-amber'],
};

export interface EvalConfigCardsProps {
  items: EvalConfigItem[];
  onAction: (action: EvalConfigAction, c: EvalConfigItem) => void;
  onToggle: (c: EvalConfigItem) => void;
}

function Kebab({ c, onAction }: { c: EvalConfigItem; onAction: EvalConfigCardsProps['onAction'] }) {
  const [open, setOpen] = useState(false);
  const act = (a: EvalConfigAction) => { setOpen(false); onAction(a, c); };
  return (
    <>
      <button title="Edit" onClick={() => act('edit')}><i className="ti ti-edit" /></button>
      <button title="Duplicate" onClick={() => act('duplicate')}><i className="ti ti-copy" /></button>
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button title="More" onClick={() => setOpen((v) => !v)}><i className="ti ti-dots-vertical" /></button>
        {open && (
          <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
            <button onClick={() => act('edit')}><i className="ti ti-edit" /> Edit configuration</button>
            <button onClick={() => act('duplicate')}><i className="ti ti-copy" /> Duplicate</button>
            <button onClick={() => act('toggle')}>
              <i className={`ti ti-${c.enabled ? 'circle-off' : 'circle-check'}`} /> {c.enabled ? 'Disable' : 'Enable'}
            </button>
            <hr />
            <button className="danger" onClick={() => act('delete')}><i className="ti ti-trash" /> Delete</button>
          </div>
        )}
      </div>
    </>
  );
}

export function EvalConfigCards({ items, onAction, onToggle }: EvalConfigCardsProps) {
  if (items.length === 0) {
    return <div className="tpl-grid"><div className="dm-empty" style={{ gridColumn: '1/-1' }}><i className="ti ti-clipboard-off" /> No configurations match these filters.</div></div>;
  }
  return (
    <div className="tpl-grid">
      {items.map((c) => {
        const [ic, cl] = TYPE_META[c.type] ?? ['ti-clipboard-check', 'i-indigo'];
        return (
          <div key={c.id} className={`tpl-card${c.enabled ? '' : ' ev-off'}`}>
            <div className="tpl-head">
              <span className={`tpl-ic ic ${cl}`}><i className={`ti ${ic}`} /></span>
              <div className="tt">
                <b>{c.name}</b>
                <div className="meta">
                  <span className="chip dom">{c.type}</span>
                  <span className={`badge-st ${c.enabled ? 'st-active' : 'st-draft'}`}><i className="ti ti-circle-filled" /> {c.enabled ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              <button
                type="button" title="Enable / disable" aria-pressed={c.enabled}
                className={`switch ev-toggle${c.enabled ? ' on' : ''}`} onClick={() => onToggle(c)}
              />
            </div>
            <div className="tpl-sections">
              <div className="tsec"><i className="ti ti-target" /> Passing <span className="tsv">{c.passing}%</span></div>
              <div className="tsec"><i className="ti ti-repeat" /> Attempts <span className="tsv">{c.attempts}</span></div>
              <div className="tsec wide"><i className="ti ti-refresh" /> Retake <span className="tsv">{c.retake}</span></div>
              <div className="tsec"><i className="ti ti-hourglass" /> Cooldown <span className="tsv">{c.cooldown}d</span></div>
              <div className="tsec"><i className="ti ti-clock-hour-4" /> Validity <span className="tsv">{c.validity}d</span></div>
              <div className="tsec wide"><i className="ti ti-wand" /> Auto-qualify <span className="tsv">{c.autoQual ? `≥ ${c.threshold}%` : 'Manual'}</span></div>
            </div>
            <div className="tpl-foot">
              <span className="used">Assigned to <b>{c.contests}</b> contest{c.contests === 1 ? '' : 's'}</span>
              <div className="grow" />
              <Kebab c={c} onAction={onAction} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Failing editor test** — `client/src/test/EvalConfigModal.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EvalConfigModal } from '../pages/Evaluations/EvalConfigModal.js';

function renderModal(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><EvalConfigModal mode="create" onClose={onClose} /></AuthProvider></QueryClientProvider>);
}

describe('EvalConfigModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/eval-configs') && (opts?.method ?? 'GET') === 'POST') return Promise.resolve({ ok: true, status: 201, json: async () => ({ _id: 'e-new' }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hides the threshold row until Auto-qualification is on', async () => {
    renderModal(() => {});
    expect(screen.queryByLabelText(/Auto-qualify when score/i)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByLabelText(/Auto-qualification/i));
    expect(screen.getByLabelText(/Auto-qualify when score/i)).toBeInTheDocument();
  });
  it('requires a name then POSTs the config payload and closes', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Save configuration/i }));
    expect(onClose).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Configuration name/i), 'My MCQ');
    await user.click(screen.getByRole('button', { name: /Save configuration/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fetchMock.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/eval-configs') && (o as RequestInit | undefined)?.method === 'POST');
    const b = JSON.parse((post![1] as RequestInit).body as string);
    expect(b).toEqual(expect.objectContaining({ name: 'My MCQ', type: 'MCQ', enabled: true, passing: 60, attempts: 2 }));
  });
});
```

- [ ] **Step 5: Run — expect FAIL**.

- [ ] **Step 6: EvalConfigModal.tsx** — port of prototype editor markup (lines 1799–1816) + runtime (3265–3284):

```tsx
import { useState } from 'react';
import { useEvalConfigMutations } from './hooks/useEvalConfigMutations.js';
import { EVAL_TYPES, RETAKE_OPTIONS, type EvalConfigItem } from '../../types/evaluations.js';

export interface EvalConfigModalProps {
  mode: 'create' | 'edit';
  config?: EvalConfigItem;
  onClose: () => void;
}

export function EvalConfigModal({ mode, config, onClose }: EvalConfigModalProps) {
  const { create, update } = useEvalConfigMutations();
  const [name, setName] = useState(config?.name ?? '');
  const [type, setType] = useState(config?.type ?? 'MCQ');
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [passing, setPassing] = useState(config?.passing ?? 60);
  const [attempts, setAttempts] = useState(config?.attempts ?? 2);
  const [retake, setRetake] = useState(config?.retake ?? 'After cooldown');
  const [cooldown, setCooldown] = useState(config?.cooldown ?? 2);
  const [validity, setValidity] = useState(config?.validity ?? 90);
  const [autoQual, setAutoQual] = useState(config?.autoQual ?? false);
  const [threshold, setThreshold] = useState(config?.threshold ?? 70);
  const [nameError, setNameError] = useState(false);

  function save() {
    if (!name.trim()) { setNameError(true); return; }
    const body = { name: name.trim(), type, enabled, passing, attempts, retake, cooldown, validity, autoQual, threshold };
    if (mode === 'edit' && config) update.mutate({ id: config.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  }
  const numOr = (v: string, d: number) => (v === '' ? d : Number(v));

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="emTitle">
        <div className="modal-h">
          <div><h3 id="emTitle">{mode === 'edit' ? 'Edit Configuration' : 'Create Configuration'}</h3><p>Rules applied when this assessment runs in a contest.</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          <div className="fld full">
            <label htmlFor="emName">Configuration name</label>
            <input id="emName" placeholder="e.g. Standard MCQ round" value={name}
              style={nameError ? { borderColor: 'var(--danger)' } : undefined}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }} />
          </div>
          <div className="fld"><label htmlFor="emType">Assessment type</label>
            <select id="emType" value={type} onChange={(e) => setType(e.target.value)}>{EVAL_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="fld"><label htmlFor="emEnabled">Enabled</label>
            <button id="emEnabled" type="button" role="switch" aria-checked={enabled} aria-label="Enabled"
              className={`switch${enabled ? ' on' : ''}`} style={{ marginTop: 4 }} onClick={() => setEnabled((v) => !v)} />
          </div>
          <div className="fld"><label htmlFor="emPass">Passing score (%)</label>
            <input id="emPass" type="number" min={0} max={100} value={passing} onChange={(e) => setPassing(numOr(e.target.value, 0))} /></div>
          <div className="fld"><label htmlFor="emAttempts">Maximum attempts</label>
            <input id="emAttempts" type="number" min={1} max={10} value={attempts} onChange={(e) => setAttempts(numOr(e.target.value, 1))} /></div>
          <div className="fld"><label htmlFor="emRetake">Retake rules</label>
            <select id="emRetake" value={retake} onChange={(e) => setRetake(e.target.value)}>{RETAKE_OPTIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div className="fld"><label htmlFor="emCooldown">Cooldown period (days)</label>
            <input id="emCooldown" type="number" min={0} max={90} value={cooldown} onChange={(e) => setCooldown(numOr(e.target.value, 0))} /></div>
          <div className="fld"><label htmlFor="emValidity">Validity duration (days)</label>
            <input id="emValidity" type="number" min={1} max={365} value={validity} onChange={(e) => setValidity(numOr(e.target.value, 1))} /></div>
          <div className="fld"><label htmlFor="emAuto">Auto-qualification</label>
            <button id="emAuto" type="button" role="switch" aria-checked={autoQual} aria-label="Auto-qualification"
              className={`switch${autoQual ? ' on' : ''}`} style={{ marginTop: 4 }} onClick={() => setAutoQual((v) => !v)} /></div>
          {autoQual && (
            <div className="fld full">
              <label htmlFor="emThreshold">Auto-qualify when score ≥ (%)</label>
              <input id="emThreshold" type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(numOr(e.target.value, 0))} />
              <span className="fnote" style={{ fontSize: 11.5, color: 'var(--faint)' }}>Candidates above this score skip manual review.</span>
            </div>
          )}
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save}><i className="ti ti-device-floppy" /> Save configuration</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: index.tsx (Management page)** — `client/src/pages/Evaluations/index.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.js';
import { EVAL_TYPES, type EvalConfigItem } from '../../types/evaluations.js';
import { useEvalConfigs } from './hooks/useEvalConfigs.js';
import { useEvalConfigMutations } from './hooks/useEvalConfigMutations.js';
import { EvalConfigCards, type EvalConfigAction } from './EvalConfigCards.js';
import { EvalConfigModal } from './EvalConfigModal.js';

type EditorState = { mode: 'create' } | { mode: 'edit'; config: EvalConfigItem } | null;

export function EvaluationsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const { data, isLoading, isError, error } = useEvalConfigs({ q, type, status });
  const { update, duplicate, remove } = useEvalConfigMutations();
  const items = data?.items ?? [];

  function onToggle(c: EvalConfigItem) { update.mutate({ id: c.id, body: { enabled: !c.enabled } }); }
  function onAction(action: EvalConfigAction, c: EvalConfigItem) {
    if (action === 'edit') setEditor({ mode: 'edit', config: c });
    else if (action === 'duplicate') duplicate.mutate(c.id);
    else if (action === 'toggle') onToggle(c);
    // eslint-disable-next-line no-alert
    else if (action === 'delete') { if (window.confirm(`Delete "${c.name}"?`)) remove.mutate(c.id); }
  }

  return (
    <AppShell crumb="Supply" title="Evaluation Management">
      <div className="content">
        <div className="dm-toolbar">
          <div className="dm-search"><i className="ti ti-search" /><input placeholder="Search configurations…" aria-label="Search evaluations" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>{EVAL_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option><option>Active</option><option>Inactive</option>
          </select>
          <div className="grow" />
          <button className="btn btn-ghost" onClick={() => navigate('/evaluations/monitor')}><i className="ti ti-activity-heartbeat" /> Live Monitoring</button>
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'create' })}><i className="ti ti-plus" /> Create Configuration</button>
        </div>
        {isError && <div className="card"><p style={{ padding: 20, color: 'var(--danger)' }}>Failed to load configurations: {error instanceof Error ? error.message : 'Unknown error'}</p></div>}
        {isLoading && <div className="dm-empty" style={{ padding: 20 }}>Loading configurations…</div>}
        {!isLoading && <EvalConfigCards items={items} onAction={onAction} onToggle={onToggle} />}
        {editor && <EvalConfigModal mode={editor.mode} config={editor.mode === 'edit' ? editor.config : undefined} onClose={() => setEditor(null)} />}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 8: Route + nav** — in `client/src/App.tsx` add:
```tsx
import { EvaluationsPage } from './pages/Evaluations/index.js';
```
```tsx
        <Route path="/evaluations" element={<ProtectedRoute><EvaluationsPage /></ProtectedRoute>} />
```
In `client/src/components/Sidebar.tsx` change the Evaluations NAV entry `to` from `/coming-soon/evaluations` to `/evaluations`:
```tsx
  { label: 'Evaluations', icon: 'ti-clipboard-check', to: '/evaluations' },
```

- [ ] **Step 9: Run tests + type-check** — `npm test -w client -- EvalConfigCards EvalConfigModal && npx -w client tsc --noEmit`.
- [ ] **Step 10: Commit**

```bash
git add client/src/pages/Evaluations/EvalConfigCards.tsx client/src/pages/Evaluations/EvalConfigModal.tsx client/src/pages/Evaluations/index.tsx client/src/App.tsx client/src/components/Sidebar.tsx client/src/test/EvalConfigCards.test.tsx client/src/test/EvalConfigModal.test.tsx
git commit -m "feat(client): Evaluation Management page (config cards + editor) + route/nav"
```

---

## Task 7: Client — Evaluation Monitoring page + route (+ test)

**Files:** Create `client/src/pages/Evaluations/monitor/EvalMonitorPage.tsx`; Modify `client/src/App.tsx` (route); Test `client/src/test/EvalMonitor.test.tsx`.

**Interfaces:** Consumes `useEvalMonitor`, `STAGES`/`fmtMins`/`stageCounts`/`reachedCounts`/`monitorKpis`, `MonitorCandidate`. Produces `EvalMonitorPage`. Live simulation runs over LOCAL candidate state; re-syncs from the query on data change.

- [ ] **Step 1: Failing monitor test** — `client/src/test/EvalMonitor.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EvalMonitorPage } from '../pages/Evaluations/monitor/EvalMonitorPage.js';
import type { MonitorResponse } from '../types/evaluations.js';

const PAYLOAD: MonitorResponse = {
  candidates: [
    { id: 'a', code: 'C-A', name: 'Aa Bb', institute: 'VNR', contest: 'Frontend · Jul cohort', employer: 'Nexatech Labs', stage: 9, score: 88, minsAgo: 5 },
    { id: 'b', code: 'C-B', name: 'Cc Dd', institute: 'CBIT', contest: 'Backend · Jul cohort', employer: 'Quantbridge', stage: 3, score: 61, minsAgo: 20 },
    { id: 'c', code: 'C-C', name: 'Ee Ff', institute: 'VNR', contest: 'Frontend · Jul cohort', employer: 'Helioserv', stage: 2, score: 55, minsAgo: 40 },
  ],
  contests: ['Frontend · Jul cohort', 'Backend · Jul cohort'], employers: ['Nexatech Labs', 'Quantbridge', 'Helioserv'], institutes: ['CBIT', 'VNR'],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter><QueryClientProvider client={qc}><AuthProvider><EvalMonitorPage /></AuthProvider></QueryClientProvider></MemoryRouter>,
  );
}

describe('EvalMonitorPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => PAYLOAD })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('renders KPIs and the candidate table from the payload', async () => {
    renderPage();
    expect(await screen.findByText('Aa Bb')).toBeInTheDocument();
    // Use only UNIQUE KPI labels — 'Match Ready' also appears in the stage strip/funnel/badges,
    // so scope by the unique 'In Pipeline' / 'Awaiting Evaluation' labels instead.
    const pipeline = screen.getByText('In Pipeline').closest('.kpi');
    expect(within(pipeline as HTMLElement).getByText('3')).toBeInTheDocument();   // total
    const awaiting = screen.getByText('Awaiting Evaluation').closest('.kpi');
    expect(within(awaiting as HTMLElement).getByText('1')).toBeInTheDocument();   // pending = counts[3]=1
  });

  it('clicking a stage card filters the table to that stage', async () => {
    renderPage();
    await screen.findByText('Aa Bb');
    const user = userEvent.setup();
    // click the "Match Ready" stage card (stage 9, via its .sc-l label) — only the stage-9 candidate remains
    await user.click(screen.getByText('Match Ready', { selector: '.sc-l' }));
    expect(screen.getByText('Aa Bb')).toBeInTheDocument();
    expect(screen.queryByText('Cc Dd')).not.toBeInTheDocument();
  });

  it('advances a candidate on the live tick (fake timers)', async () => {
    vi.useFakeTimers();
    // random=0 → picks the first not-yet-ready candidate in array order (b, "Cc Dd", stage 3 → 4)
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0);
    renderPage();
    await vi.advanceTimersByTimeAsync(0);   // flush the initial query
    // before the tick, b's row badge is "MCQ Pending" (stage 3)
    expect(screen.getByText('MCQ Pending', { selector: '.stbadge' })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(3600);   // one ~3.5s tick
    // after the tick b advanced 3→4: the MCQ Pending badge is gone, MCQ Completed appears
    expect(screen.getByText('MCQ Completed', { selector: '.stbadge' })).toBeInTheDocument();
    expect(screen.queryByText('MCQ Pending', { selector: '.stbadge' })).not.toBeInTheDocument();
    // total unchanged — candidates advance, they don't leave the pipeline
    const pipeline = screen.getByText('In Pipeline').closest('.kpi');
    expect(within(pipeline as HTMLElement).getByText('3')).toBeInTheDocument();
    rand.mockRestore();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: EvalMonitorPage.tsx** — port of prototype `renderEvalMonitor` (3316–3341) + simulation (3351–3359). The server snapshot seeds local state; the interval advances one random not-yet-ready candidate in LOCAL state:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../../components/AppShell.js';
import { useEvalMonitor } from '../hooks/useEvalMonitor.js';
import type { MonitorCandidate } from '../../../types/evaluations.js';
import { STAGES, fmtMins, stageCounts, reachedCounts, monitorKpis } from './monitorUtils.js';

export function EvalMonitorPage() {
  const navigate = useNavigate();
  const [contest, setContest] = useState('');
  const [employer, setEmployer] = useState('');
  const [institute, setInstitute] = useState('');
  const [date, setDate] = useState('Last 30 days');
  const [selStage, setSelStage] = useState<number | null>(null);
  const [cands, setCands] = useState<MonitorCandidate[]>([]);
  const [updated, setUpdated] = useState('just now');

  const { data } = useEvalMonitor({ contest, employer, institute, date });

  // Re-sync local sim state whenever the server snapshot changes (filters/refetch).
  useEffect(() => { if (data) { setCands(data.candidates); setUpdated('just now'); } }, [data]);

  // Ephemeral live simulation — advance one random not-yet-Match-Ready candidate every ~3.5s.
  useEffect(() => {
    const t = setInterval(() => {
      setCands((prev) => {
        const movable = prev.filter((c) => c.stage < 9);
        if (!movable.length) return prev;
        const pick = movable[Math.floor(Math.random() * movable.length)];
        return prev.map((c) => c === pick
          ? { ...c, stage: c.stage + 1, minsAgo: 0, score: c.stage + 1 >= 2 && !c.score ? 55 + Math.floor(Math.random() * 44) : c.score }
          : { ...c, minsAgo: c.minsAgo + 1 });
      });
      setUpdated('just now');
    }, 3500);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => stageCounts(cands), [cands]);
  const reached = useMemo(() => reachedCounts(cands), [cands]);
  const kpi = useMemo(() => monitorKpis(cands), [cands]);
  const maxC = Math.max(1, ...counts);
  const rows = useMemo(() => {
    const list = selStage == null ? cands : cands.filter((c) => c.stage === selStage);
    return [...list].sort((a, b) => a.minsAgo - b.minsAgo);
  }, [cands, selStage]);

  const opts = data ?? { contests: [], employers: [], institutes: [] };

  function exportCsv() {
    const head = ['ID', 'Candidate', 'Institute', 'Contest', 'Employer', 'Stage', 'Score', 'Last update'];
    const body = rows.map((x) => [x.code, x.name, x.institute, x.contest, x.employer, STAGES[x.stage].k, x.score, fmtMins(x.minsAgo)].map((v) => `"${v}"`).join(','));
    const csv = [head.join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'evaluation-monitoring.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <AppShell crumb="Supply · Evaluations" title="Evaluation Monitoring">
      <div className="content">
        <button className="backlink" onClick={() => navigate('/evaluations')}><i className="ti ti-arrow-left" /> Back to Evaluation Management</button>
        <div className="dm-toolbar">
          <select className="select" style={{ appearance: 'auto' }} aria-label="Contest" value={contest} onChange={(e) => setContest(e.target.value)}>
            <option value="">All contests</option>{opts.contests.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Employer" value={employer} onChange={(e) => setEmployer(e.target.value)}>
            <option value="">All employers</option>{opts.employers.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Institute" value={institute} onChange={(e) => setInstitute(e.target.value)}>
            <option value="">All institutes</option>{opts.institutes.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Date range" value={date} onChange={(e) => setDate(e.target.value)}>
            <option>Last 30 days</option><option>Last 7 days</option><option>Today</option><option>All time</option>
          </select>
          <div className="grow" />
          <span className="live-dot"><span className="d" /> Live · {updated}</span>
          <button className="btn btn-ghost" onClick={exportCsv}><i className="ti ti-download" /> Export</button>
        </div>

        <div className="kpis" style={{ marginBottom: 14 }}>
          <div className="kpi"><div className="kh"><span className="ic i-indigo"><i className="ti ti-users" /></span> In Pipeline</div><div className="kv mono">{kpi.total}</div><div className="kd flat"><i className="ti ti-minus" /> candidates</div></div>
          <div className="kpi"><div className="kh"><span className="ic i-amber"><i className="ti ti-hourglass" /></span> Awaiting Evaluation</div><div className="kv mono">{kpi.pending}</div><div className="kd flat"><i className="ti ti-alert-circle" /> in pending stages</div></div>
          <div className="kpi"><div className="kh"><span className="ic i-green"><i className="ti ti-user-check" /></span> Match Ready</div><div className="kv mono">{kpi.ready}</div><div className="kd up"><i className="ti ti-trending-up" /> {kpi.total ? Math.round(kpi.ready / kpi.total * 100) : 0}% of pipeline</div></div>
          <div className="kpi"><div className="kh"><span className="ic i-violet"><i className="ti ti-progress" /></span> Avg Progress</div><div className="kv mono">{kpi.avg}%</div><div className="kd up"><i className="ti ti-trending-up" /> through pipeline</div></div>
        </div>

        <div className="section-title">Stage-wise counts <span className="rule" /> <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--faint)' }}>click a stage to drill down</span></div>
        <div className="stage-strip">
          {STAGES.map((st, s) => (
            <div key={st.k} className={`stage-card${selStage === s ? ' on' : ''}`} onClick={() => setSelStage(selStage === s ? null : s)}>
              <div className="top" style={{ background: st.c }} /><div className="sc-n">{counts[s]}</div><div className="sc-l">{st.k}</div>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-h"><div><h3>Evaluation funnel</h3><div className="sub">Candidates reaching each stage</div></div></div>
            <div className="funnel">
              {STAGES.map((st, s) => (
                <div className="fstep" key={st.k}><div className="fl"><span className="name">{st.k}</span><span className="v mono">{reached[s]} <span className="pct">{kpi.total ? Math.round(reached[s] / kpi.total * 100) : 0}%</span></span></div>
                  <div className="ftrack"><i style={{ width: `${kpi.total ? Math.max(3, reached[s] / kpi.total * 100) : 0}%`, background: st.c }} /></div></div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-h"><div><h3>Pipeline health</h3><div className="sub">Where candidates are waiting</div></div></div>
            <div className="funnel">
              {STAGES.map((st, s) => (
                <div className="fstep" key={st.k}><div className="fl"><span className="name">{st.k}</span><span className="v mono">{counts[s]}</span></div>
                  <div className="ftrack"><i style={{ width: `${Math.max(3, counts[s] / maxC * 100)}%`, background: st.c }} /></div></div>
              ))}
            </div>
          </div>
        </div>

        <div className="section-title">Candidates · {selStage == null ? 'all stages' : STAGES[selStage].k} <span className="rule" />
          {selStage != null && <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--indigo)', cursor: 'pointer' }} onClick={() => setSelStage(null)}>Clear filter</span>}
        </div>
        <div className="dm-table-wrap">
          <div className="dm-scroll">
            <table className="dm" style={{ minWidth: 820 }}>
              <thead><tr><th>Candidate</th><th>Institute</th><th>Contest</th><th>Current stage</th><th className="r">Score</th><th className="r">Last update</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6}><div className="dm-empty"><i className="ti ti-user-off" /> No candidates in this view.</div></td></tr>}
                {rows.slice(0, 20).map((x) => (
                  <tr key={x.id}>
                    <td><div className="dm-name"><b>{x.name}</b><span>{x.code}</span></div></td>
                    <td>{x.institute}</td><td>{x.contest}</td>
                    <td><span className="stbadge" style={{ background: `${STAGES[x.stage].c}22`, color: STAGES[x.stage].c }}><i className="ti ti-circle-filled" /> {STAGES[x.stage].k}</span></td>
                    <td className="r cap">{x.score || '—'}</td>
                    <td className="r" style={{ color: 'var(--muted)' }}>{fmtMins(x.minsAgo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="dm-pager"><div className="pinfo">Showing <b>{Math.min(20, rows.length)}</b> of <b>{rows.length}</b>{selStage != null ? ` in ${STAGES[selStage].k}` : ''}</div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Route** — in `client/src/App.tsx` add:
```tsx
import { EvalMonitorPage } from './pages/Evaluations/monitor/EvalMonitorPage.js';
```
```tsx
        <Route path="/evaluations/monitor" element={<ProtectedRoute><EvalMonitorPage /></ProtectedRoute>} />
```

- [ ] **Step 5: Run test + type-check** — `npm test -w client -- EvalMonitor && npx -w client tsc --noEmit`.
- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Evaluations/monitor/EvalMonitorPage.tsx client/src/App.tsx client/src/test/EvalMonitor.test.tsx
git commit -m "feat(client): Evaluation Monitoring page with live simulation + route"
```

---

## Task 8: Full-suite verification + live E2E smoke

**Files:** none (verification only).

- [ ] **Step 1: Full suites** — `npm test -w server && npm test -w client` (all pass; server includes the new eval tests, client includes the 4 new eval test files).
- [ ] **Step 2: Type-check both** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit`.
- [ ] **Step 3: Build** — `npm run -w client build`.
- [ ] **Step 4: Re-seed + live smoke** (controller performs manually with a fresh admin token):
  - `GET /api/eval-configs` → 4 configs; `Take-home assignment` disabled.
  - `GET /api/eval-configs?type=Coding` → 1; `?status=Inactive` → 1.
  - `POST /api/eval-configs/:id/duplicate` → 201, "(Copy)", disabled.
  - `PATCH /api/eval-configs/:id {enabled:false}` → toggles.
  - `DELETE` the copy → `{deleted:true}`.
  - `GET /api/eval-monitor` → `candidates` non-empty; `candidates.filter(stage===9).length` equals a fresh `GET /api/dashboard/overview` `matchReady` (both 531) — the reconciliation invariant.
  - `GET /api/eval-monitor?contest=<one>` → all returned candidates carry that contest.
- [ ] **Step 5: No commit** (verification task).

---

## Self-Review Notes (author)

- **Spec coverage:** Management CRUD/duplicate/toggle/filters → T1/T2/T6; monitor derivation + filters → T3; seed 4 configs → T4; monitor page (KPIs/stage strip/funnels/table/live sim/export) → T5/T7; routes+nav → T6/T7. All spec §3/§4/§5/§6/§7 items map to a task.
- **Reconciliation invariant:** monitor stage-9 uses the exact CC match-ready set (`{MatchReady,Shortlisted,Offer,Joined}`); T8 asserts equality with the live CC `matchReady` (531).
- **Determinism:** the derivation uses `hashId` (no `Math.random`/`Date.now` server-side); the client sim's `Math.random` is ephemeral and never persisted.
- **PATCH clobber guard:** `updateEvalConfigSchema` is an explicit all-optional shape (NOT `.partial()` of a defaulted base) so an omitted key never injects a default over stored data — T1 test asserts a later `passing` patch preserves a prior `enabled:false`.
- **Type consistency:** `EvalConfigAction` defined once in EvalConfigCards.tsx; `MonitorCandidate`/`EvalConfigItem`/`EvalConfigInput` defined once in types/evaluations.ts; server `EvalConfigItem` mirrors the client type; `STAGES` lives client-side only (server derivation emits the numeric index).
- **Known cosmetic drift:** config "Assigned to N contests" has no "updated X ago" suffix on the card (the prototype shows `· {updated}`) — omitted because `updatedAt`-derived relative time would drift like Templates'; the card shows the contest count only. (If faithful parity is wanted, add a `relativeUpdated(updatedAt)` suffix — noted, not built.)
- **Kebab positioning:** EvalConfigCards' `Kebab` wraps the More button + menu in a `position:relative` container (the fix Templates needed), avoiding the mispositioned-dropdown defect from the start.
```
