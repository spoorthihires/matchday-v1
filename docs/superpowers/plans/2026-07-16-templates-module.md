# Templates Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the drive-templates library (`/templates`) — a searchable/filterable Cards+Table view of reusable drive-configuration templates, a six-tab editor modal, clone/activate/delete actions, and a version-history modal with restore — faithful to `matchday-admin-app_23.html` (page lines 1400–1436 + 1819–1847; runtime 2780–2990).

**Architecture:** New `DriveTemplate` Mongoose collection (sections stored as `Schema.Types.Mixed` because the prototype's config keys contain spaces; zod enforces the exact shape at the API). REST module `server/src/modules/templates/` mirroring the slots module. React page under `client/src/pages/Templates/` mirroring the Slots page shell, its hooks, and the Drives/Employers kebab pattern. Self-contained: no Command Center changes, no cross-module migrations.

**Tech Stack:** Express 4 + Mongoose 8 + zod (server, TS strict, ESM `.js` import extensions); React 18 + Vite + react-router-dom 6 + @tanstack/react-query 5 (client); Vitest + supertest + mongodb-memory-server (server tests); Vitest + React Testing Library + jsdom (client tests).

## Global Constraints

- **Error contract:** all API errors are `{ error: { message, code } }`. zod parse failure → 400 `validation` (handled by existing `errorHandler`); `assertId`/not-found → 404 `not_found`; missing/invalid token → 401 (handled by `requireAuth`). Copy these exactly from the slots module.
- **ESM imports:** every relative import in `.ts`/`.tsx` ends in `.js` (e.g. `import { DriveTemplate } from '../../models/DriveTemplate.js'`). `"strict": true` — no implicit `any`.
- **`tsc --noEmit` MUST pass** for every server task before it is considered done (vitest does not type-check). Run `npm run -w server build` or `npx -w server tsc --noEmit`.
- **No `timestamps: true`** on any model — use explicit `createdAt`/`updatedAt` (dashboard delta fixtures depend on this convention across the codebase).
- **Enum fields are plain `String` at the model layer**; zod is the source of truth for allowed values at the API. Domain values, verbatim: `Data / Analytics`, `Data Engineering`, `Machine Learning`, `GenAI`, `Business`. Status values: `Active`, `Inactive`. Notification channels: `Email`, `WhatsApp`, `Bell`.
- **Version-bump rule (prototype-exact):** `bumpVersion('2.1') → '2.2'` (increment the minor component; `'1' → '1.1'`). A PATCH whose body contains `sections` bumps the version and prepends a `{v, date, by, note:'Edited configuration'}` entry; a PATCH without `sections` (e.g. status-only toggle) does NOT bump and adds no entry. Create → v1.0 + `note:'Initial template'`. Clone → v1.0 + `note:'Cloned from {name}'`. Restore → bump + `note:'Restored v{v}'`. Restore does NOT roll back `sections` (version-ledger operation only).
- **Actor** for version entries is the constant string `'Platform Admin'` (matches `ACTOR` in slots.controller.ts — there is no per-request user name available server-side).
- **Faithful CSS:** reuse the prototype class names already present verbatim in `client/src/styles/theme.css` (`.tpl-grid`, `.tpl-card`, `.tpl-head`, `.tpl-ic`, `.tpl-sections`, `.tsec`, `.tpl-foot`, `.vbadge`, `.badge-st`/`.st-active`/`.st-draft`, `.ed-head-fields`, `.ed-body`, `.ed-tabs`, `.ed-tab`, `.ed-pane`, `.asmt-row`, `.switch`, `.wt-row`/`.wt-val`/`.wt-total`, `.match-row`, `.stage-list`/`.stage-item`/`.stage-add`, `.notif-row`/`.chn`/`.cw`, `.priv-row`, `.ver-item`/`.vtag`/`.vrestore`, `.kebab-menu`). Do NOT add new CSS.

---

## File Structure

```
server/src/
  models/DriveTemplate.ts                 # Task 1 (create)
  modules/templates/
    templates.schemas.ts                  # Task 1 (create)
    templates.service.ts                  # Task 1 (create)
    templates.controller.ts               # Task 2 (create)
    templates.routes.ts                   # Task 2 (create)
  app.ts                                  # Task 2 (modify — mount /api/templates)
  seed/seed.ts                            # Task 3 (modify — 5 templates + cleanup)
server/test/
  templates.service.test.ts               # Task 1 (create)
  templates.route.test.ts                 # Task 2 (create)
client/src/
  types/templates.ts                      # Task 4 (create)
  pages/Templates/
    templateUtils.ts                      # Task 4 (create)
    hooks/useTemplates.ts                 # Task 4 (create)
    hooks/useTemplateMutations.ts         # Task 4 (create)
    TemplateCards.tsx                     # Task 5 (create)
    TemplateTable.tsx                     # Task 5 (create)
    TemplateEditorModal.tsx               # Task 6 (create)
    VersionHistoryModal.tsx               # Task 7 (create)
    index.tsx                             # Task 8 (create)
  App.tsx                                 # Task 8 (modify — route)
  components/Sidebar.tsx                  # Task 8 (modify — nav target)
client/src/test/
  templateUtils.test.ts                   # Task 4 (create)
  TemplateCards.test.tsx                  # Task 5 (create)
  TemplateEditor.test.tsx                 # Task 6 (create)
  VersionHistory.test.tsx                 # Task 7 (create)
```

---

## Task 1: Server — model, schemas, service (+ service tests)

**Files:**
- Create: `server/src/models/DriveTemplate.ts`
- Create: `server/src/modules/templates/templates.schemas.ts`
- Create: `server/src/modules/templates/templates.service.ts`
- Test: `server/test/templates.service.test.ts`

**Interfaces:**
- Consumes: `HttpError` from `../../middleware/errorHandler.js`; `Types` from `mongoose`.
- Produces (used by Task 2): `bumpVersion(v: string): string`, `codeFor(id: unknown): string`, and async service fns `listTemplates(params: { q?: string; domain?: string; status?: string }): Promise<{ items: TemplateItem[] }>`, `createTemplate(input: CreateTemplateInput): Promise<TemplateDoc>`, `getTemplate(id: string): Promise<TemplateDoc>`, `updateTemplate(id: string, patch: UpdateTemplateInput): Promise<TemplateDoc>`, `cloneTemplate(id: string): Promise<TemplateDoc>`, `restoreTemplate(id: string, v: string): Promise<TemplateDoc>`, `deleteTemplate(id: string): Promise<{ deleted: true }>`. Zod: `createTemplateSchema`, `updateTemplateSchema`, `restoreSchema`, `listQuerySchema`, and inferred `CreateTemplateInput`/`UpdateTemplateInput`.

- [ ] **Step 1: Write the model**

Create `server/src/models/DriveTemplate.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const versionSchema = new Schema(
  {
    v: { type: String, required: true },
    date: { type: Date, required: true },
    by: { type: String, required: true },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const templateSchema = new Schema({
  name: { type: String, required: true },
  domain: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  usedBy: { type: Number, default: 0 },
  // The prototype's section config uses keys with spaces ("Domain fit", "Mask contact until shortlist"),
  // so it is stored as Mixed; the exact shape is enforced by zod at the API layer.
  sections: { type: Schema.Types.Mixed, required: true },
  version: { type: String, default: '1.0' },
  versions: { type: [versionSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export type DriveTemplateDoc = InferSchemaType<typeof templateSchema>;
export const DriveTemplate = model('DriveTemplate', templateSchema);
```

- [ ] **Step 2: Write the zod schemas**

Create `server/src/modules/templates/templates.schemas.ts`:

```ts
import { z } from 'zod';

export const DOMAINS = ['Data / Analytics', 'Data Engineering', 'Machine Learning', 'GenAI', 'Business'] as const;
const CHANNELS = ['Email', 'WhatsApp', 'Bell'] as const;

const sectionsSchema = z.object({
  assessment: z.object({
    mcq: z.boolean(),
    coding: z.boolean(),
    tara: z.boolean(),
    assignments: z.boolean(),
  }),
  weightage: z.record(z.coerce.number().int().min(0).max(100)),
  matching: z.record(z.coerce.number().int().min(0).max(100)),
  kanban: z.array(z.string().trim().min(1)).min(1),
  notifications: z.array(z.object({ name: z.string().min(1), ch: z.array(z.enum(CHANNELS)) })),
  privacy: z.record(z.boolean()),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1),
  domain: z.enum(DOMAINS),
  status: z.enum(['Active', 'Inactive']).default('Active'),
  sections: sectionsSchema,
});

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  domain: z.enum(DOMAINS).optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
  sections: sectionsSchema.optional(),
});

export const restoreSchema = z.object({ v: z.string().min(1) });

export const listQuerySchema = z.object({
  q: z.string().optional(),
  domain: z.string().optional(),
  status: z.string().optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
```

- [ ] **Step 3: Write the failing service test**

Create `server/test/templates.service.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { DriveTemplate } from '../src/models/DriveTemplate.js';
import {
  bumpVersion, codeFor, listTemplates, createTemplate, getTemplate,
  updateTemplate, cloneTemplate, restoreTemplate, deleteTemplate,
} from '../src/modules/templates/templates.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const sections = () => ({
  assessment: { mcq: true, coding: true, tara: true, assignments: false },
  weightage: { MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 },
  matching: { Skills: 40, Experience: 25, 'Domain fit': 20, Location: 15, threshold: 70 },
  kanban: ['Applied', 'Screened', 'Shortlisted'],
  notifications: [{ name: 'Shortlisted', ch: ['Email', 'WhatsApp'] }],
  privacy: { 'Mask contact until shortlist': true, 'Watermark resumes': false },
});
const input = (over: Record<string, unknown> = {}) => ({
  name: 'Data Analyst', domain: 'Data / Analytics' as const, status: 'Active' as const, sections: sections(), ...over,
});

describe('templates.service', () => {
  it('bumpVersion increments the minor component', () => {
    expect(bumpVersion('2.1')).toBe('2.2');
    expect(bumpVersion('1.9')).toBe('1.10');
    expect(bumpVersion('1')).toBe('1.1');
  });

  it('creates at v1.0 with an initial version entry', async () => {
    const t = await createTemplate(input());
    expect(t.version).toBe('1.0');
    expect(t.versions).toHaveLength(1);
    expect(t.versions[0]).toMatchObject({ v: '1.0', by: 'Platform Admin', note: 'Initial template' });
  });

  it('lists with q/domain/status filters, newest-updated first, with id + code', async () => {
    await createTemplate(input({ name: 'Alpha ML', domain: 'Machine Learning' }));
    await createTemplate(input({ name: 'Beta Biz', domain: 'Business', status: 'Inactive' }));
    const all = await listTemplates({});
    expect(all.items).toHaveLength(2);
    expect(all.items[0].id).toBeTruthy();
    expect(all.items[0].code).toMatch(/^TPL-/);
    expect((await listTemplates({ q: 'alpha' })).items).toHaveLength(1);
    expect((await listTemplates({ domain: 'Business' })).items).toHaveLength(1);
    expect((await listTemplates({ status: 'Inactive' })).items).toHaveLength(1);
  });

  it('PATCH with sections bumps version + logs "Edited configuration"; status-only does not', async () => {
    const t = await createTemplate(input());
    const edited = await updateTemplate(String(t._id), { sections: sections() });
    expect(edited.version).toBe('1.1');
    expect(edited.versions).toHaveLength(2);
    expect(edited.versions[0].note).toBe('Edited configuration');
    const toggled = await updateTemplate(String(t._id), { status: 'Inactive' });
    expect(toggled.version).toBe('1.1');            // unchanged
    expect(toggled.versions).toHaveLength(2);       // no new entry
    expect(toggled.status).toBe('Inactive');
  });

  it('clones as "(Copy)", Inactive, v1.0, usedBy 0, with a clone entry', async () => {
    const t = await createTemplate(input({ name: 'ML Engineer', status: 'Active' }));
    t.usedBy = 5; await t.save();
    const c = await cloneTemplate(String(t._id));
    expect(c.name).toBe('ML Engineer (Copy)');
    expect(c.status).toBe('Inactive');
    expect(c.version).toBe('1.0');
    expect(c.usedBy).toBe(0);
    expect(c.versions[0].note).toBe('Cloned from ML Engineer');
    expect(await DriveTemplate.countDocuments({})).toBe(2);
  });

  it('restores an older version: bump + "Restored v{v}" entry, sections unchanged; unknown v → 400', async () => {
    const t = await createTemplate(input());
    await updateTemplate(String(t._id), { sections: sections() });   // now v1.1, entries [1.1, 1.0]
    const restored = await restoreTemplate(String(t._id), '1.0');
    expect(restored.version).toBe('1.2');
    expect(restored.versions[0].note).toBe('Restored v1.0');
    await expect(restoreTemplate(String(t._id), '9.9')).rejects.toThrow(/version/i);
  });

  it('deletes and 404s on unknown/malformed ids', async () => {
    const t = await createTemplate(input());
    expect(await deleteTemplate(String(t._id))).toEqual({ deleted: true });
    await expect(getTemplate(String(t._id))).rejects.toThrow();
    await expect(getTemplate('nope')).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -w server -- templates.service`
Expected: FAIL — `templates.service.js` does not exist / imports unresolved.

- [ ] **Step 5: Write the service**

Create `server/src/modules/templates/templates.service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { DriveTemplate, type DriveTemplateDoc } from '../../models/DriveTemplate.js';
import type { CreateTemplateInput, UpdateTemplateInput } from './templates.schemas.js';

const ACTOR = 'Platform Admin';

export interface TemplateItem {
  id: string; code: string; name: string; domain: string;
  status: string; usedBy: number;
  sections: unknown;
  version: string;
  versions: { v: string; date: string; by: string; note: string }[];
  createdAt: string; updatedAt: string;
}

export function bumpVersion(v: string): string {
  const parts = v.split('.').map(Number);
  parts[1] = (parts[1] || 0) + 1;
  return parts.join('.');
}
export function codeFor(id: unknown): string {
  return `TPL-${String(id).slice(-3).toUpperCase()}`;
}
function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Template not found', 'not_found');
}

function toItem(d: DriveTemplateDoc & { _id: unknown }): TemplateItem {
  return {
    id: String(d._id), code: codeFor(d._id), name: d.name, domain: d.domain,
    status: d.status ?? 'Active', usedBy: d.usedBy ?? 0,
    sections: d.sections,
    version: d.version ?? '1.0',
    versions: (d.versions ?? []).map((v) => ({
      v: v.v, date: new Date(v.date).toISOString(), by: v.by, note: v.note ?? '',
    })),
    createdAt: new Date(d.createdAt as Date).toISOString(),
    updatedAt: new Date(d.updatedAt as Date).toISOString(),
  };
}

export async function listTemplates(params: { q?: string; domain?: string; status?: string }) {
  const match: Record<string, unknown> = {};
  if (params.domain) match.domain = params.domain;
  if (params.status) match.status = params.status;
  if (params.q && params.q.trim()) {
    const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { domain: rx }];
  }
  const rows = await DriveTemplate.find(match).sort({ updatedAt: -1 }).lean();
  return { items: rows.map((r) => toItem(r as never)) };
}

export async function createTemplate(input: CreateTemplateInput) {
  const now = new Date();
  return DriveTemplate.create({
    name: input.name, domain: input.domain, status: input.status, usedBy: 0,
    sections: input.sections, version: '1.0',
    versions: [{ v: '1.0', date: now, by: ACTOR, note: 'Initial template' }],
    createdAt: now, updatedAt: now,
  });
}

export async function getTemplate(id: string) {
  assertId(id);
  const t = await DriveTemplate.findById(id);
  if (!t) throw new HttpError(404, 'Template not found', 'not_found');
  return t;
}

export async function updateTemplate(id: string, patch: UpdateTemplateInput) {
  const t = await getTemplate(id);
  if (patch.name !== undefined) t.name = patch.name;
  if (patch.domain !== undefined) t.domain = patch.domain;
  if (patch.status !== undefined) t.status = patch.status;
  if (patch.sections !== undefined) {
    t.sections = patch.sections;
    t.markModified('sections');
    const nv = bumpVersion(t.version ?? '1.0');
    t.version = nv;
    t.versions.unshift({ v: nv, date: new Date(), by: ACTOR, note: 'Edited configuration' });
  }
  t.updatedAt = new Date();
  await t.save();
  return t;
}

export async function cloneTemplate(id: string) {
  const t = await getTemplate(id);
  const now = new Date();
  return DriveTemplate.create({
    name: `${t.name} (Copy)`, domain: t.domain, status: 'Inactive', usedBy: 0,
    sections: t.sections, version: '1.0',
    versions: [{ v: '1.0', date: now, by: ACTOR, note: `Cloned from ${t.name}` }],
    createdAt: now, updatedAt: now,
  });
}

export async function restoreTemplate(id: string, v: string) {
  const t = await getTemplate(id);
  if (!(t.versions ?? []).some((entry) => entry.v === v)) {
    throw new HttpError(400, `Unknown version ${v}`, 'validation');
  }
  const nv = bumpVersion(t.version ?? '1.0');
  t.version = nv;
  t.versions.unshift({ v: nv, date: new Date(), by: ACTOR, note: `Restored v${v}` });
  t.updatedAt = new Date();
  await t.save();
  return t;
}

export async function deleteTemplate(id: string) {
  const t = await getTemplate(id);
  await t.deleteOne();
  return { deleted: true as const };
}
```

- [ ] **Step 6: Run the service test to verify it passes**

Run: `npm test -w server -- templates.service`
Expected: PASS (7 tests).

- [ ] **Step 7: Type-check**

Run: `npx -w server tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/models/DriveTemplate.ts server/src/modules/templates/templates.schemas.ts server/src/modules/templates/templates.service.ts server/test/templates.service.test.ts
git commit -m "feat(server): DriveTemplate model, schemas, and templates service"
```

---

## Task 2: Server — controller, routes, mount (+ route tests)

**Files:**
- Create: `server/src/modules/templates/templates.controller.ts`
- Create: `server/src/modules/templates/templates.routes.ts`
- Modify: `server/src/app.ts` (import + mount `/api/templates`)
- Test: `server/test/templates.route.test.ts`

**Interfaces:**
- Consumes: the service fns + zod schemas from Task 1; `asyncHandler`, `requireAuth`, `signToken` (test only) from existing modules.
- Produces: `templateRoutes` Router; `POST /` → 201, others → 200.

- [ ] **Step 1: Write the controller**

Create `server/src/modules/templates/templates.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { createTemplateSchema, updateTemplateSchema, restoreSchema, listQuerySchema } from './templates.schemas.js';
import {
  listTemplates, getTemplate, createTemplate, updateTemplate,
  cloneTemplate, restoreTemplate, deleteTemplate,
} from './templates.service.js';

export async function listController(req: Request, res: Response) {
  res.json(await listTemplates(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createTemplate(createTemplateSchema.parse(req.body)));
}
export async function getController(req: Request, res: Response) {
  res.json(await getTemplate(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateTemplate(req.params.id, updateTemplateSchema.parse(req.body)));
}
export async function cloneController(req: Request, res: Response) {
  res.status(201).json(await cloneTemplate(req.params.id));
}
export async function restoreController(req: Request, res: Response) {
  res.json(await restoreTemplate(req.params.id, restoreSchema.parse(req.body).v));
}
export async function deleteController(req: Request, res: Response) {
  res.json(await deleteTemplate(req.params.id));
}
```

- [ ] **Step 2: Write the routes**

Create `server/src/modules/templates/templates.routes.ts` (sub-paths `/:id/clone` and `/:id/restore` are declared before the bare `/:id` handlers, per convention):

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, createController, getController, patchController,
  cloneController, restoreController, deleteController,
} from './templates.controller.js';

export const templateRoutes = Router();
templateRoutes.use(requireAuth);
templateRoutes.get('/', asyncHandler(listController));
templateRoutes.post('/', asyncHandler(createController));
templateRoutes.post('/:id/clone', asyncHandler(cloneController));
templateRoutes.post('/:id/restore', asyncHandler(restoreController));
templateRoutes.get('/:id', asyncHandler(getController));
templateRoutes.patch('/:id', asyncHandler(patchController));
templateRoutes.delete('/:id', asyncHandler(deleteController));
```

- [ ] **Step 3: Mount in app.ts**

In `server/src/app.ts`, add the import alongside the others:
```ts
import { templateRoutes } from './modules/templates/templates.routes.js';
```
and the mount alongside the others (after `slotRoutes`):
```ts
  app.use('/api/templates', templateRoutes);
```

- [ ] **Step 4: Write the failing route test**

Create `server/test/templates.route.test.ts`:

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
const body = {
  name: 'Data Analyst', domain: 'Data / Analytics', status: 'Active',
  sections: {
    assessment: { mcq: true, coding: true, tara: true, assignments: false },
    weightage: { MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 },
    matching: { Skills: 40, Experience: 25, 'Domain fit': 20, Location: 15, threshold: 70 },
    kanban: ['Applied', 'Screened', 'Shortlisted'],
    notifications: [{ name: 'Shortlisted', ch: ['Email', 'WhatsApp'] }],
    privacy: { 'Mask contact until shortlist': true, 'Watermark resumes': false },
  },
};

describe('templates routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/templates')).status).toBe(401);
  });

  it('creates (201), lists, filters, clones, restores, deletes; 400 on bad body; 404 on unknown', async () => {
    const c = await auth(request(createApp()).post('/api/templates').send(body));
    expect(c.status).toBe(201);
    expect(c.body.version).toBe('1.0');
    const id = c.body._id;

    const list = await auth(request(createApp()).get('/api/templates?domain=Data / Analytics'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].code).toMatch(/^TPL-/);

    const clone = await auth(request(createApp()).post(`/api/templates/${id}/clone`));
    expect(clone.status).toBe(201);
    expect(clone.body.name).toBe('Data Analyst (Copy)');
    expect(clone.body.status).toBe('Inactive');

    const edited = await auth(request(createApp()).patch(`/api/templates/${id}`).send({ sections: body.sections }));
    expect(edited.body.version).toBe('1.1');
    const restored = await auth(request(createApp()).post(`/api/templates/${id}/restore`).send({ v: '1.0' }));
    expect(restored.body.version).toBe('1.2');
    expect(restored.body.versions[0].note).toBe('Restored v1.0');

    const bad = await auth(request(createApp()).post('/api/templates').send({ ...body, domain: 'Nope' }));
    expect(bad.status).toBe(400);

    const del = await auth(request(createApp()).delete(`/api/templates/${id}`));
    expect(del.body).toEqual({ deleted: true });
    const miss = await auth(request(createApp()).get('/api/templates/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run the route test to verify it passes**

Run: `npm test -w server -- templates.route`
Expected: PASS (2 tests).

- [ ] **Step 6: Type-check + full server suite**

Run: `npx -w server tsc --noEmit && npm test -w server`
Expected: no type errors; all server tests pass (existing + the new templates tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/templates/templates.controller.ts server/src/modules/templates/templates.routes.ts server/src/app.ts server/test/templates.route.test.ts
git commit -m "feat(server): templates controller, routes, and /api/templates mount"
```

---

## Task 3: Server — seed 5 templates

**Files:**
- Modify: `server/src/seed/seed.ts` (import `DriveTemplate`, add to the `deleteMany` group, insert 5 templates before the "Seed complete" log)

**Interfaces:**
- Consumes: `DriveTemplate` model; the existing `NOW`/`DAY` constants in seed.ts.
- Produces: 5 deterministic template documents.

- [ ] **Step 1: Add the import**

In `server/src/seed/seed.ts`, add alongside the other model imports:
```ts
import { DriveTemplate } from '../models/DriveTemplate.js';
```

- [ ] **Step 2: Add to the deleteMany cleanup group**

In the `Promise.all([...deleteMany...])` block, add `DriveTemplate.deleteMany({})` to the array (any position).

- [ ] **Step 3: Insert the 5 templates**

Immediately before the `console.log('Seed complete.');` line (after `await AuditLog.insertMany(auditDocs);`), add:

```ts
  // ---- Drive templates (5, verbatim from the prototype's `templates` array) ----
  // baseSections mirrors the prototype's baseSections(over): a shallow merge, so an override key
  // replaces the whole sub-object (matches matchday-admin-app_23.html line 2781).
  const baseSections = (over: Record<string, unknown> = {}) => ({
    assessment: { mcq: true, coding: true, tara: true, assignments: false },
    weightage: { MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 },
    matching: { Skills: 40, Experience: 25, 'Domain fit': 20, Location: 15, threshold: 70 },
    kanban: ['Applied', 'Screened', 'MCQ', 'Coding', 'TARA', 'Shortlisted', 'Interview', 'Offer', 'Joined'],
    notifications: [
      { name: 'Shortlisted', ch: ['Email', 'WhatsApp'] },
      { name: 'Interview scheduled', ch: ['Email', 'WhatsApp', 'Bell'] },
      { name: 'Offer sent', ch: ['Email', 'WhatsApp'] },
      { name: 'Rejected', ch: ['Email'] },
    ],
    privacy: {
      'Mask contact until shortlist': true, 'Hide salary from institutes': true,
      'Require GDPR consent': true, 'Watermark resumes': false,
    },
    ...over,
  });
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
  const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));   // m is 0-based
  const templateDocs = [
    {
      name: 'Data Analyst', domain: 'Data / Analytics', status: 'Active', usedBy: 6,
      sections: baseSections({ weightage: { MCQ: 30, Coding: 25, TARA: 30, Assignment: 15 } }),
      version: '2.1', updatedAt: daysAgo(2), createdAt: D(2026, 4, 30),
      versions: [
        { v: '2.1', date: D(2026, 6, 10), by: 'Sharath P.', note: 'Raised MCQ weightage to 30%' },
        { v: '2.0', date: D(2026, 5, 22), by: 'Asha N.', note: 'Added assignment stage' },
        { v: '1.0', date: D(2026, 4, 30), by: 'Sharath P.', note: 'Initial template' },
      ],
    },
    {
      name: 'Data Engineer', domain: 'Data Engineering', status: 'Active', usedBy: 4,
      sections: baseSections({ assessment: { mcq: true, coding: true, tara: true, assignments: true } }),
      version: '1.4', updatedAt: daysAgo(5), createdAt: D(2026, 5, 1),
      versions: [
        { v: '1.4', date: D(2026, 6, 7), by: 'Sharath P.', note: 'Enabled take-home assignment' },
        { v: '1.0', date: D(2026, 5, 1), by: 'Sharath P.', note: 'Initial template' },
      ],
    },
    {
      name: 'ML Engineer', domain: 'Machine Learning', status: 'Active', usedBy: 5,
      sections: baseSections({ matching: { Skills: 45, Experience: 25, 'Domain fit': 20, Location: 10, threshold: 75 } }),
      version: '1.8', updatedAt: daysAgo(1), createdAt: D(2026, 4, 18),
      versions: [
        { v: '1.8', date: D(2026, 6, 11), by: 'Asha N.', note: 'Tightened matching threshold to 75%' },
        { v: '1.0', date: D(2026, 4, 18), by: 'Sharath P.', note: 'Initial template' },
      ],
    },
    {
      name: 'GenAI Engineer', domain: 'GenAI', status: 'Active', usedBy: 3,
      sections: baseSections({ weightage: { MCQ: 15, Coding: 30, TARA: 40, Assignment: 15 } }),
      version: '1.2', updatedAt: daysAgo(3), createdAt: D(2026, 5, 15),
      versions: [
        { v: '1.2', date: D(2026, 6, 9), by: 'Asha N.', note: 'Increased TARA weightage' },
        { v: '1.0', date: D(2026, 5, 15), by: 'Asha N.', note: 'Initial template' },
      ],
    },
    {
      name: 'Business Analyst', domain: 'Business', status: 'Inactive', usedBy: 0,
      sections: baseSections({
        assessment: { mcq: true, coding: false, tara: true, assignments: true },
        kanban: ['Applied', 'Screened', 'MCQ', 'TARA', 'Assignment', 'Shortlisted', 'Interview', 'Offer', 'Joined'],
      }),
      version: '1.0', updatedAt: daysAgo(14), createdAt: D(2026, 5, 28),
      versions: [
        { v: '1.0', date: D(2026, 5, 28), by: 'Sharath P.', note: 'Initial template' },
      ],
    },
  ];
  await DriveTemplate.insertMany(templateDocs);
```

- [ ] **Step 4: Run the seed against local MongoDB**

Run: `npm run seed -w server`
Expected: "Seed complete." and the admin-login line print with no thrown error.

- [ ] **Step 5: Verify the seeded count**

Run: `npx -w server tsc --noEmit`
Expected: no type errors. (The seed's own run in Step 4 is the behavioral check; 5 templates inserted.)

- [ ] **Step 6: Commit**

```bash
git add server/src/seed/seed.ts
git commit -m "feat(server): seed 5 drive templates from the prototype"
```

---

## Task 4: Client — types, utils, hooks (+ utils tests)

**Files:**
- Create: `client/src/types/templates.ts`
- Create: `client/src/pages/Templates/templateUtils.ts`
- Create: `client/src/pages/Templates/hooks/useTemplates.ts`
- Create: `client/src/pages/Templates/hooks/useTemplateMutations.ts`
- Test: `client/src/test/templateUtils.test.ts`

**Interfaces:**
- Consumes: `apiFetch` from `../../../api/client.js`, `useAuth` from `../../../auth/AuthContext.js`, `useQuery`/`useMutation`/`useQueryClient` from `@tanstack/react-query`.
- Produces (used by Tasks 5–8): types `TemplateItem`, `TemplateSections`, `TemplateVersion`, `TemplateInput`, `TemplateListParams`, `TemplateListResponse`, `TEMPLATE_DOMAINS`, `NOTIF_CHANNELS`; utils `baseSections`, `secCounts`, `domainIcon`, `relativeUpdated`, `fmtDate`; hooks `useTemplates(params)` (key `['templates', q, domain, status]`), `useTemplateMutations()` returning `{ create, update, clone, restore, remove }`.

- [ ] **Step 1: Write the types**

Create `client/src/types/templates.ts`:

```ts
// Mirrors server/src/modules/templates/templates.service.ts TemplateItem and
// server/src/modules/templates/templates.schemas.ts (createTemplateSchema / sectionsSchema).

export const TEMPLATE_DOMAINS = ['Data / Analytics', 'Data Engineering', 'Machine Learning', 'GenAI', 'Business'] as const;
export type TemplateDomain = (typeof TEMPLATE_DOMAINS)[number];
export const NOTIF_CHANNELS = ['Email', 'WhatsApp', 'Bell'] as const;
export type NotifChannel = (typeof NOTIF_CHANNELS)[number];
export type TemplateStatus = 'Active' | 'Inactive';

export interface TemplateSections {
  assessment: { mcq: boolean; coding: boolean; tara: boolean; assignments: boolean };
  weightage: Record<string, number>;
  matching: Record<string, number>;   // includes 'threshold'
  kanban: string[];
  notifications: { name: string; ch: string[] }[];
  privacy: Record<string, boolean>;
}

export interface TemplateVersion { v: string; date: string; by: string; note: string }

export interface TemplateItem {
  id: string; code: string; name: string; domain: string;
  status: TemplateStatus; usedBy: number;
  sections: TemplateSections; version: string; versions: TemplateVersion[];
  createdAt: string; updatedAt: string;
}

export interface TemplateInput {
  name: string; domain: string; status: TemplateStatus; sections: TemplateSections;
}

export interface TemplateListParams { q?: string; domain?: string; status?: string }
export interface TemplateListResponse { items: TemplateItem[] }
```

- [ ] **Step 2: Write the failing utils test**

Create `client/src/test/templateUtils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { baseSections, secCounts, domainIcon, relativeUpdated, fmtDate } from '../pages/Templates/templateUtils.js';

describe('templateUtils', () => {
  it('baseSections defaults and shallow-merges an override', () => {
    const s = baseSections();
    expect(s.weightage).toEqual({ MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 });
    expect(s.kanban).toHaveLength(9);
    const o = baseSections({ weightage: { MCQ: 30, Coding: 25, TARA: 30, Assignment: 15 } });
    expect(o.weightage.MCQ).toBe(30);
    expect(o.assessment.mcq).toBe(true);   // untouched
  });

  it('secCounts counts enabled assessment, kanban, notif, match (excl threshold), privacy', () => {
    const c = secCounts(baseSections());
    expect(c.assess).toBe(3);   // mcq, coding, tara true; assignments false
    expect(c.stages).toBe(9);
    expect(c.notif).toBe(4);
    expect(c.match).toBe(4);    // Skills, Experience, Domain fit, Location (threshold excluded)
    expect(c.priv).toBe(3);     // 3 of 4 true
  });

  it('domainIcon maps known domains and falls back', () => {
    expect(domainIcon('GenAI')[0]).toBe('ti-sparkles');
    expect(domainIcon('Unknown')).toEqual(['ti-template', 'i-indigo']);
  });

  it('relativeUpdated renders long-form relative strings', () => {
    const iso = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(relativeUpdated(iso(2 * 86400000))).toBe('2 days ago');
    expect(relativeUpdated(iso(1 * 86400000))).toBe('1 day ago');
    expect(relativeUpdated(iso(15 * 86400000))).toBe('2 weeks ago');
    expect(relativeUpdated(iso(0))).toBe('just now');
  });

  it('fmtDate renders "MMM D, YYYY" in UTC', () => {
    expect(fmtDate('2026-07-10T00:00:00.000Z')).toBe('Jul 10, 2026');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w client -- templateUtils`
Expected: FAIL — `templateUtils.js` does not exist.

- [ ] **Step 4: Write the utils**

Create `client/src/pages/Templates/templateUtils.ts`:

```ts
import type { TemplateSections } from '../../types/templates.js';

// Mirrors matchday-admin-app_23.html baseSections (line 2781): a shallow merge — an override key
// replaces the whole sub-object. Used as the create-mode default in the editor.
export function baseSections(over: Partial<TemplateSections> = {}): TemplateSections {
  return {
    assessment: { mcq: true, coding: true, tara: true, assignments: false },
    weightage: { MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 },
    matching: { Skills: 40, Experience: 25, 'Domain fit': 20, Location: 15, threshold: 70 },
    kanban: ['Applied', 'Screened', 'MCQ', 'Coding', 'TARA', 'Shortlisted', 'Interview', 'Offer', 'Joined'],
    notifications: [
      { name: 'Shortlisted', ch: ['Email', 'WhatsApp'] },
      { name: 'Interview scheduled', ch: ['Email', 'WhatsApp', 'Bell'] },
      { name: 'Offer sent', ch: ['Email', 'WhatsApp'] },
      { name: 'Rejected', ch: ['Email'] },
    ],
    privacy: {
      'Mask contact until shortlist': true, 'Hide salary from institutes': true,
      'Require GDPR consent': true, 'Watermark resumes': false,
    },
    ...over,
  };
}

// Mirrors the prototype's secCounts (line 2806).
export function secCounts(s: TemplateSections) {
  return {
    assess: Object.values(s.assessment).filter(Boolean).length,
    stages: s.kanban.length,
    notif: s.notifications.length,
    match: Object.keys(s.matching).filter((k) => k !== 'threshold').length,
    priv: Object.values(s.privacy).filter(Boolean).length,
  };
}

// Mirrors the prototype's tplIcons map (line 2780): [tabler-icon, color-class].
const TPL_ICONS: Record<string, [string, string]> = {
  'Data / Analytics': ['ti-chart-bar', 'i-indigo'],
  'Data Engineering': ['ti-database', 'i-teal'],
  'Machine Learning': ['ti-brain', 'i-violet'],
  GenAI: ['ti-sparkles', 'i-amber'],
  Business: ['ti-briefcase', 'i-green'],
};
export function domainIcon(domain: string): [string, string] {
  return TPL_ICONS[domain] ?? ['ti-template', 'i-indigo'];
}

// Long-form relative time for the card "Updated …" line. Distinct from Approvals' short-form
// relativeTime ("2d ago") — the prototype uses the long phrasing ("2 days ago", "2 weeks ago").
export function relativeUpdated(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Absolute date for version entries — UTC to match the seed's Date.UTC values → "Jul 10, 2026".
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
```

- [ ] **Step 5: Run the utils test to verify it passes**

Run: `npm test -w client -- templateUtils`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the query hook**

Create `client/src/pages/Templates/hooks/useTemplates.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { TemplateListParams, TemplateListResponse } from '../../../types/templates.js';

// Mirrors client/src/pages/Slots/hooks/useSlots.ts — same shape, templates path, explicit key.
export function useTemplates(params: TemplateListParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['templates', params.q, params.domain, params.status],
    queryFn: () => apiFetch<TemplateListResponse>(`/templates${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
```

- [ ] **Step 7: Write the mutations hook**

Create `client/src/pages/Templates/hooks/useTemplateMutations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { TemplateInput } from '../../../types/templates.js';

// Mirrors client/src/pages/Slots/hooks/useSlotMutations.ts. All mutations invalidate ['templates'],
// matching useTemplates's query-key prefix.
export function useTemplateMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['templates'] });

  const create = useMutation({
    mutationFn: (body: TemplateInput) => apiFetch('/templates', { method: 'POST', body, token }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<TemplateInput> }) =>
      apiFetch(`/templates/${id}`, { method: 'PATCH', body, token }),
    onSuccess: invalidate,
  });
  const clone = useMutation({
    mutationFn: (id: string) => apiFetch(`/templates/${id}/clone`, { method: 'POST', token }),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: ({ id, v }: { id: string; v: string }) =>
      apiFetch(`/templates/${id}/restore`, { method: 'POST', body: { v }, token }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/templates/${id}`, { method: 'DELETE', token }),
    onSuccess: invalidate,
  });
  return { create, update, clone, restore, remove };
}
```

- [ ] **Step 8: Type-check the client**

Run: `npx -w client tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/types/templates.ts client/src/pages/Templates/templateUtils.ts client/src/pages/Templates/hooks/useTemplates.ts client/src/pages/Templates/hooks/useTemplateMutations.ts client/src/test/templateUtils.test.ts
git commit -m "feat(client): templates types, utils, and query/mutation hooks"
```

---

## Task 5: Client — TemplateCards + TemplateTable (+ cards test)

**Files:**
- Create: `client/src/pages/Templates/TemplateCards.tsx`
- Create: `client/src/pages/Templates/TemplateTable.tsx`
- Test: `client/src/test/TemplateCards.test.tsx`

**Interfaces:**
- Consumes: `TemplateItem` type; `secCounts`, `domainIcon`, `relativeUpdated` from `./templateUtils.js`.
- Produces: `TemplateAction` type = `'edit' | 'clone' | 'version' | 'toggle' | 'delete'`; components `TemplateCards({ items, onAction })` and `TemplateTable({ items, onAction })` where `onAction: (action: TemplateAction, t: TemplateItem) => void`. Each component owns its own kebab `openMenuId` state (mirrors DrivesTable). The kebab's activate/deactivate label reads "Deactivate" when `status === 'Active'`, else "Activate".

- [ ] **Step 1: Write the failing cards test**

Create `client/src/test/TemplateCards.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TemplateCards } from '../pages/Templates/TemplateCards.js';
import { TemplateTable } from '../pages/Templates/TemplateTable.js';
import { baseSections } from '../pages/Templates/templateUtils.js';
import type { TemplateItem } from '../types/templates.js';

const item = (over: Partial<TemplateItem> = {}): TemplateItem => ({
  id: 't1', code: 'TPL-ABC', name: 'Data Analyst', domain: 'Data / Analytics',
  status: 'Active', usedBy: 6, sections: baseSections(), version: '2.1', versions: [],
  createdAt: '2026-05-30T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z', ...over,
});

describe('TemplateCards / TemplateTable', () => {
  it('renders a card with name, version, used-by, and section counts', () => {
    render(<TemplateCards items={[item()]} onAction={() => {}} />);
    expect(screen.getByText('Data Analyst')).toBeInTheDocument();
    expect(screen.getByText('v2.1')).toBeInTheDocument();
    // getByText matches direct text nodes only (TL's getNodeText), so target the unique tsec
    // labels — the numeric counts live in <b> children and repeat (3 appears for assess + priv).
    expect(screen.getByText(/Used by/i)).toHaveTextContent('Used by 6 drives');
    expect(screen.getByText(/match rules/i)).toBeInTheDocument();   // "4 match rules"
    expect(screen.getByText(/privacy rules/i)).toBeInTheDocument();  // "3 privacy rules"
    expect(screen.getByText(/stages/i)).toBeInTheDocument();         // "9 stages"
  });

  it('renders an inactive card dimmed and shows the Activate option in its kebab', async () => {
    const onAction = vi.fn();
    render(<TemplateCards items={[item({ status: 'Inactive' })]} onAction={onAction} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    expect(screen.getByText(/Activate/)).toBeInTheDocument();
    await user.click(screen.getByText(/Clone template/));
    expect(onAction).toHaveBeenCalledWith('clone', expect.objectContaining({ id: 't1' }));
  });

  it('renders the table row with the TPL code and domain', () => {
    render(<TemplateTable items={[item()]} onAction={() => {}} />);
    expect(screen.getByText('TPL-ABC')).toBeInTheDocument();
    expect(screen.getByText('Data / Analytics')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w client -- TemplateCards`
Expected: FAIL — components do not exist.

- [ ] **Step 3: Write TemplateCards.tsx**

Create `client/src/pages/Templates/TemplateCards.tsx` (port of prototype lines 2819–2841; the kebab mirrors DrivesTable's `.kebab-menu show` pattern):

```tsx
import { useState } from 'react';
import type { TemplateItem } from '../../types/templates.js';
import { secCounts, domainIcon, relativeUpdated } from './templateUtils.js';

export type TemplateAction = 'edit' | 'clone' | 'version' | 'toggle' | 'delete';

export interface TemplateListProps {
  items: TemplateItem[];
  onAction: (action: TemplateAction, t: TemplateItem) => void;
}

function Kebab({ t, onAction }: { t: TemplateItem; onAction: TemplateListProps['onAction'] }) {
  const [open, setOpen] = useState(false);
  const act = (a: TemplateAction) => { setOpen(false); onAction(a, t); };
  return (
    <>
      <button title="Edit" onClick={() => act('edit')}><i className="ti ti-edit" /></button>
      <button title="Clone" onClick={() => act('clone')}><i className="ti ti-copy" /></button>
      <button title="More" onClick={() => setOpen((v) => !v)}><i className="ti ti-dots-vertical" /></button>
      {open && (
        <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
          <button onClick={() => act('edit')}><i className="ti ti-edit" /> Edit template</button>
          <button onClick={() => act('clone')}><i className="ti ti-copy" /> Clone template</button>
          <button onClick={() => act('version')}><i className="ti ti-history" /> Version history</button>
          <button onClick={() => act('toggle')}>
            <i className={`ti ti-${t.status === 'Active' ? 'circle-off' : 'circle-check'}`} />
            {' '}{t.status === 'Active' ? 'Deactivate' : 'Activate'}
          </button>
          <hr />
          <button className="danger" onClick={() => act('delete')}><i className="ti ti-trash" /> Delete template</button>
        </div>
      )}
    </>
  );
}

export function TemplateCards({ items, onAction }: TemplateListProps) {
  if (items.length === 0) {
    return (
      <div className="tpl-grid">
        <div className="dm-empty" style={{ gridColumn: '1/-1' }}>
          <i className="ti ti-template-off" /> No templates match these filters.
        </div>
      </div>
    );
  }
  return (
    <div className="tpl-grid">
      {items.map((t) => {
        const c = secCounts(t.sections);
        const [ic, cl] = domainIcon(t.domain);
        return (
          <div key={t.id} className={`tpl-card${t.status === 'Inactive' ? ' inactive' : ''}`}>
            <div className="tpl-head">
              <span className={`tpl-ic ic ${cl}`}><i className={`ti ${ic}`} /></span>
              <div className="tt">
                <b>{t.name}</b>
                <div className="meta">
                  <span className="vbadge">v{t.version}</span>
                  <span className={`badge-st ${t.status === 'Active' ? 'st-active' : 'st-draft'}`}>
                    <i className="ti ti-circle-filled" /> {t.status}
                  </span>
                </div>
                <div className="tpl-updated">Updated {relativeUpdated(t.updatedAt)}</div>
              </div>
            </div>
            <div className="tpl-sections">
              <div className="tsec"><i className="ti ti-list-check" /> <b>{c.assess}</b> assessment</div>
              <div className="tsec"><i className="ti ti-scale" /> weightage set</div>
              <div className="tsec"><i className="ti ti-arrows-shuffle" /> <b>{c.match}</b> match rules</div>
              <div className="tsec"><i className="ti ti-layout-kanban" /> <b>{c.stages}</b> stages</div>
              <div className="tsec"><i className="ti ti-bell" /> <b>{c.notif}</b> notifications</div>
              <div className="tsec"><i className="ti ti-shield-lock" /> <b>{c.priv}</b> privacy rules</div>
            </div>
            <div className="tpl-foot">
              <span className="used">Used by <b>{t.usedBy}</b> drive{t.usedBy === 1 ? '' : 's'}</span>
              <div className="grow" />
              <Kebab t={t} onAction={onAction} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write TemplateTable.tsx**

Create `client/src/pages/Templates/TemplateTable.tsx` (port of prototype lines 2843–2856):

```tsx
import { useState } from 'react';
import type { TemplateItem } from '../../types/templates.js';
import { secCounts, relativeUpdated } from './templateUtils.js';
import type { TemplateAction, TemplateListProps } from './TemplateCards.js';

function RowKebab({ t, onAction }: { t: TemplateItem; onAction: TemplateListProps['onAction'] }) {
  const [open, setOpen] = useState(false);
  const act = (a: TemplateAction) => { setOpen(false); onAction(a, t); };
  return (
    <div className="rowact" style={{ position: 'relative' }}>
      <button title="Edit" onClick={() => act('edit')}><i className="ti ti-edit" /></button>
      <button title="Clone" onClick={() => act('clone')}><i className="ti ti-copy" /></button>
      <button title="More" onClick={() => setOpen((v) => !v)}><i className="ti ti-dots-vertical" /></button>
      {open && (
        <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
          <button onClick={() => act('edit')}><i className="ti ti-edit" /> Edit template</button>
          <button onClick={() => act('clone')}><i className="ti ti-copy" /> Clone template</button>
          <button onClick={() => act('version')}><i className="ti ti-history" /> Version history</button>
          <button onClick={() => act('toggle')}>
            <i className={`ti ti-${t.status === 'Active' ? 'circle-off' : 'circle-check'}`} />
            {' '}{t.status === 'Active' ? 'Deactivate' : 'Activate'}
          </button>
          <hr />
          <button className="danger" onClick={() => act('delete')}><i className="ti ti-trash" /> Delete template</button>
        </div>
      )}
    </div>
  );
}

export function TemplateTable({ items, onAction }: TemplateListProps) {
  return (
    <div className="dm-table-wrap">
      <div className="dm-scroll">
        <table className="dm" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Template</th><th>Domain</th><th>Version</th><th className="c">Sections</th>
              <th className="r">Used by</th><th>Status</th><th>Updated</th><th className="r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={8}><div className="dm-empty"><i className="ti ti-template-off" /> No templates match these filters.</div></td></tr>
            )}
            {items.map((t) => {
              const c = secCounts(t.sections);
              return (
                <tr key={t.id}>
                  <td><div className="dm-name"><b>{t.name}</b><span>{t.code}</span></div></td>
                  <td><span className="chip dom">{t.domain}</span></td>
                  <td><span className="vbadge">v{t.version}</span></td>
                  <td className="c">{c.assess} asmt · {c.stages} stages · {c.notif} notif</td>
                  <td className="r cap">{t.usedBy}</td>
                  <td><span className={`badge-st ${t.status === 'Active' ? 'st-active' : 'st-draft'}`}><i className="ti ti-circle-filled" /> {t.status}</span></td>
                  <td>{relativeUpdated(t.updatedAt)}</td>
                  <td className="r"><RowKebab t={t} onAction={onAction} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the cards test to verify it passes**

Run: `npm test -w client -- TemplateCards`
Expected: PASS (3 tests).

- [ ] **Step 6: Type-check**

Run: `npx -w client tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/Templates/TemplateCards.tsx client/src/pages/Templates/TemplateTable.tsx client/src/test/TemplateCards.test.tsx
git commit -m "feat(client): TemplateCards and TemplateTable with kebab actions"
```

---

## Task 6: Client — TemplateEditorModal (+ editor test)

**Files:**
- Create: `client/src/pages/Templates/TemplateEditorModal.tsx`
- Test: `client/src/test/TemplateEditor.test.tsx`

**Interfaces:**
- Consumes: `useTemplateMutations` from `./hooks/useTemplateMutations.js`; `baseSections` from `./templateUtils.js`; types `TemplateItem`, `TemplateSections`, `TEMPLATE_DOMAINS`, `NOTIF_CHANNELS`.
- Produces: `TemplateEditorModal({ mode, template?, onClose })` where `mode: 'create' | 'edit'`. On save: create-mode fires `create.mutate({name, domain, status, sections})`; edit-mode fires `update.mutate({ id, body: { name, domain, status, sections } })`. Both call `onClose` on success. Six tabs; the weightage `Total` `<b>` carries class `good` when the weightage values sum to exactly 100, else `bad` (display-only — save is NOT blocked). Name is required (inline error, blocks save).

**Notes for the implementer:**
- Deep-clone the draft on mount: `useState<TemplateSections>(() => structuredClone(template ? template.sections : baseSections()))`. `structuredClone` is available in jsdom (Node 18+).
- Switches are `<button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`}>` — a semantic/testable upgrade over the prototype's clickable `<div>`; keep the `.switch`/`.switch.on` classes for styling.
- Tabs are `<button type="button" role="tab" className={`ed-tab${active ? ' on' : ''}`}>`.
- Immutable updates: replace the changed sub-object each time (e.g. `setDraft((d) => ({ ...d, weightage: { ...d.weightage, [k]: value } }))`).

- [ ] **Step 1: Write the failing editor test**

Create `client/src/test/TemplateEditor.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { TemplateEditorModal } from '../pages/Templates/TemplateEditorModal.js';

function renderEditor(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <TemplateEditorModal mode="create" onClose={onClose} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('TemplateEditorModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token',
      user: { id: 'u1', name: 'Test Admin', email: 'admin@matchday.io', role: 'admin' },
    }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/templates') && method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ _id: 't-new' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the assessment tab by default and switches to Scoring with a 100% good total', async () => {
    renderEditor(() => {});
    const user = userEvent.setup();
    expect(screen.getByText(/Assessment structure/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Scoring/i }));
    const total = screen.getByText('100%');
    expect(total).toHaveClass('good');
  });

  it('flips the total to bad when weightage no longer sums to 100', async () => {
    renderEditor(() => {});
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Scoring/i }));
    fireEvent.change(screen.getByLabelText('MCQ'), { target: { value: '50' } });   // 50+35+30+15 = 130
    expect(screen.getByText('130%')).toHaveClass('bad');
  });

  it('requires a name, then POSTs the full payload and closes', async () => {
    const onClose = vi.fn();
    renderEditor(onClose);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Save template/i }));
    expect(fetch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalledWith(
      expect.stringContaining('/templates'), expect.objectContaining({ method: 'POST' }),
    );

    await user.type(screen.getByLabelText(/Template name/i), 'My Template');
    await user.click(screen.getByRole('button', { name: /Save template/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fetchMock.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/templates') && (o as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeTruthy();
    const body = JSON.parse((post![1] as RequestInit).body as string);
    expect(body.name).toBe('My Template');
    expect(body.domain).toBe('Data / Analytics');
    expect(body.status).toBe('Active');
    expect(body.sections.weightage).toEqual({ MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 });
    expect(body.sections.kanban).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w client -- TemplateEditor`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write TemplateEditorModal.tsx**

Create `client/src/pages/Templates/TemplateEditorModal.tsx`. Port the prototype's `renderEdPane` (lines 2914–2958) tab-by-tab into React with local immutable draft state. Full implementation:

```tsx
import { useState } from 'react';
import { useTemplateMutations } from './hooks/useTemplateMutations.js';
import { baseSections } from './templateUtils.js';
import { NOTIF_CHANNELS, TEMPLATE_DOMAINS, type TemplateItem, type TemplateSections, type TemplateStatus } from '../../types/templates.js';

type Tab = 'assessment' | 'weightage' | 'matching' | 'kanban' | 'notifications' | 'privacy';
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'assessment', icon: 'ti-list-check', label: 'Assessment' },
  { id: 'weightage', icon: 'ti-scale', label: 'Scoring' },
  { id: 'matching', icon: 'ti-arrows-shuffle', label: 'Matching' },
  { id: 'kanban', icon: 'ti-layout-kanban', label: 'Kanban' },
  { id: 'notifications', icon: 'ti-bell', label: 'Notifications' },
  { id: 'privacy', icon: 'ti-shield-lock', label: 'Privacy' },
];
const CH_ICON: Record<string, string> = { Email: 'mail', WhatsApp: 'brand-whatsapp', Bell: 'bell' };
const ASSESS_ROWS: [keyof TemplateSections['assessment'], string, string][] = [
  ['mcq', 'MCQ round', 'Aptitude & fundamentals'],
  ['coding', 'Coding round', 'Programming problems'],
  ['tara', 'TARA AI interview', 'AI prescreening with Copilot score'],
  ['assignments', 'Assignments', 'Take-home task'],
];

export interface TemplateEditorModalProps {
  mode: 'create' | 'edit';
  template?: TemplateItem;
  onClose: () => void;
}

export function TemplateEditorModal({ mode, template, onClose }: TemplateEditorModalProps) {
  const { create, update } = useTemplateMutations();
  const [name, setName] = useState(template?.name ?? '');
  const [domain, setDomain] = useState<string>(template?.domain ?? 'Data / Analytics');
  const [status, setStatus] = useState<TemplateStatus>(template?.status ?? 'Active');
  const [tab, setTab] = useState<Tab>('assessment');
  const [draft, setDraft] = useState<TemplateSections>(() => structuredClone(template ? template.sections : baseSections()));
  const [nameError, setNameError] = useState(false);
  const [stageIn, setStageIn] = useState('');

  const wtTotal = Object.values(draft.weightage).reduce((a, b) => a + b, 0);

  function save() {
    if (!name.trim()) { setNameError(true); return; }
    const body = { name: name.trim(), domain, status, sections: draft };
    if (mode === 'edit' && template) {
      update.mutate({ id: template.id, body }, { onSuccess: onClose });
    } else {
      create.mutate(body, { onSuccess: onClose });
    }
  }

  function addStage() {
    const v = stageIn.trim();
    if (!v) return;
    setDraft((d) => ({ ...d, kanban: [...d.kanban, v] }));
    setStageIn('');
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="tplTitle">
        <div className="modal-h">
          <div>
            <h3 id="tplTitle">{mode === 'edit' ? 'Edit Template' : 'Create Template'}</h3>
            <p>Reusable configuration applied when spinning up a drive.</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div className="ed-head-fields">
          <div className="fld">
            <label htmlFor="teName">Template name</label>
            <input
              id="teName" placeholder="e.g. Data Analyst" value={name}
              style={nameError ? { borderColor: 'var(--danger)' } : undefined}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
            />
            {nameError && <span style={{ color: 'var(--danger)', fontSize: 12 }}>Template name is required.</span>}
          </div>
          <div className="fld">
            <label htmlFor="teDomain">Domain</label>
            <select id="teDomain" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {TEMPLATE_DOMAINS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="teStatus">Status</label>
            <select id="teStatus" value={status} onChange={(e) => setStatus(e.target.value as TemplateStatus)}>
              <option>Active</option><option>Inactive</option>
            </select>
          </div>
        </div>

        <div className="ed-body">
          <div className="ed-tabs">
            {TABS.map((t) => (
              <button
                key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                className={`ed-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}
              >
                <i className={`ti ${t.icon}`} /> {t.label}
              </button>
            ))}
          </div>

          <div className="ed-pane">
            {tab === 'assessment' && (
              <>
                <h4>Assessment structure</h4>
                <p className="phelp">Toggle the screening stages this template includes.</p>
                {ASSESS_ROWS.map(([k, n, d]) => (
                  <div className="asmt-row" key={k}>
                    <div className="an"><b>{n}</b><span>{d}</span></div>
                    <button
                      type="button" role="switch" aria-checked={draft.assessment[k]} aria-label={n}
                      className={`switch${draft.assessment[k] ? ' on' : ''}`}
                      onClick={() => setDraft((s) => ({ ...s, assessment: { ...s.assessment, [k]: !s.assessment[k] } }))}
                    />
                  </div>
                ))}
              </>
            )}

            {tab === 'weightage' && (
              <>
                <h4>Scoring weightage</h4>
                <p className="phelp">Distribute 100% across the scored stages.</p>
                {Object.keys(draft.weightage).map((k) => (
                  <div className="wt-row" key={k}>
                    <span className="wt-name">{k}</span>
                    <input
                      type="range" min={0} max={100} value={draft.weightage[k]} aria-label={k}
                      onChange={(e) => setDraft((s) => ({ ...s, weightage: { ...s.weightage, [k]: Number(e.target.value) } }))}
                    />
                    <span className="wt-val">{draft.weightage[k]}%</span>
                  </div>
                ))}
                <div className="wt-total"><span>Total</span><b className={wtTotal === 100 ? 'good' : 'bad'}>{wtTotal}%</b></div>
              </>
            )}

            {tab === 'matching' && (
              <>
                <h4>Matching rules</h4>
                <p className="phelp">Weight each criterion, then set the minimum match score to qualify.</p>
                {Object.keys(draft.matching).filter((k) => k !== 'threshold').map((k) => (
                  <div className="match-row" key={k}>
                    <span className="mn">{k}</span>
                    <input
                      type="range" min={0} max={100} value={draft.matching[k]} aria-label={k}
                      onChange={(e) => setDraft((s) => ({ ...s, matching: { ...s.matching, [k]: Number(e.target.value) } }))}
                    />
                    <span className="mv">{draft.matching[k]}%</span>
                  </div>
                ))}
                <div className="wt-total"><span>Match threshold</span><b>{draft.matching.threshold}%</b></div>
                <div className="match-row" style={{ marginTop: 8 }}>
                  <span className="mn">Threshold</span>
                  <input
                    type="range" min={0} max={100} value={draft.matching.threshold} aria-label="Threshold"
                    onChange={(e) => setDraft((s) => ({ ...s, matching: { ...s.matching, threshold: Number(e.target.value) } }))}
                  />
                  <span className="mv">{draft.matching.threshold}%</span>
                </div>
              </>
            )}

            {tab === 'kanban' && (
              <>
                <h4>Kanban stages</h4>
                <p className="phelp">The pipeline candidates move through. Add or remove stages.</p>
                <div className="stage-list">
                  {draft.kanban.map((st, i) => (
                    <div className="stage-item" key={`${st}-${i}`}>
                      <span className="num">{i + 1}</span>
                      <span className="sn">{st}</span>
                      <i
                        className="ti ti-x rm" role="button" aria-label={`Remove ${st}`}
                        onClick={() => setDraft((s) => ({ ...s, kanban: s.kanban.filter((_, idx) => idx !== i) }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="stage-add">
                  <input
                    placeholder="Add a stage…" value={stageIn} aria-label="Add a stage"
                    onChange={(e) => setStageIn(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }}
                  />
                  <button className="btn btn-ghost" type="button" onClick={addStage}><i className="ti ti-plus" /> Add</button>
                </div>
              </>
            )}

            {tab === 'notifications' && (
              <>
                <h4>Notification templates</h4>
                <p className="phelp">Choose which channels fire for each event.</p>
                {draft.notifications.map((n, i) => (
                  <div className="notif-row" key={n.name}>
                    <span className="nn">{n.name}</span>
                    <div className="chn">
                      {NOTIF_CHANNELS.map((ch) => {
                        const on = n.ch.includes(ch);
                        return (
                          <button
                            key={ch} type="button" aria-pressed={on} aria-label={`${n.name} ${ch}`}
                            className={`cw${on ? ' on' : ''}`}
                            onClick={() => setDraft((s) => {
                              const notifications = s.notifications.map((row, idx) =>
                                idx === i
                                  ? { ...row, ch: row.ch.includes(ch) ? row.ch.filter((c) => c !== ch) : [...row.ch, ch] }
                                  : row);
                              return { ...s, notifications };
                            })}
                          >
                            <i className={`ti ti-${CH_ICON[ch]}`} />{ch}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {tab === 'privacy' && (
              <>
                <h4>Privacy rules</h4>
                <p className="phelp">Data-handling defaults applied to candidates in this template.</p>
                {Object.keys(draft.privacy).map((k) => (
                  <div className="priv-row" key={k}>
                    <div className="pn"><b>{k}</b></div>
                    <button
                      type="button" role="switch" aria-checked={draft.privacy[k]} aria-label={k}
                      className={`switch${draft.privacy[k] ? ' on' : ''}`}
                      onClick={() => setDraft((s) => ({ ...s, privacy: { ...s.privacy, [k]: !s.privacy[k] } }))}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save}>
            <i className="ti ti-device-floppy" /> Save template
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the editor test to verify it passes**

Run: `npm test -w client -- TemplateEditor`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check**

Run: `npx -w client tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Templates/TemplateEditorModal.tsx client/src/test/TemplateEditor.test.tsx
git commit -m "feat(client): six-tab TemplateEditorModal"
```

---

## Task 7: Client — VersionHistoryModal (+ version test)

**Files:**
- Create: `client/src/pages/Templates/VersionHistoryModal.tsx`
- Test: `client/src/test/VersionHistory.test.tsx`

**Interfaces:**
- Consumes: `useTemplateMutations` (`restore`); `fmtDate` from `./templateUtils.js`; `TemplateItem` type.
- Produces: `VersionHistoryModal({ template, onClose })`. Renders `.ver-item` rows; the row whose `v === template.version` is marked `.cur` with a "Current" span; every other row has a Restore button → `restore.mutate({ id: template.id, v }, { onSuccess: onClose })`.

- [ ] **Step 1: Write the failing version test**

Create `client/src/test/VersionHistory.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { VersionHistoryModal } from '../pages/Templates/VersionHistoryModal.js';
import { baseSections } from '../pages/Templates/templateUtils.js';
import type { TemplateItem } from '../types/templates.js';

const template: TemplateItem = {
  id: 't1', code: 'TPL-ABC', name: 'Data Analyst', domain: 'Data / Analytics',
  status: 'Active', usedBy: 6, sections: baseSections(), version: '2.1',
  versions: [
    { v: '2.1', date: '2026-07-10T00:00:00.000Z', by: 'Sharath P.', note: 'Raised MCQ weightage to 30%' },
    { v: '2.0', date: '2026-06-22T00:00:00.000Z', by: 'Asha N.', note: 'Added assignment stage' },
  ],
  createdAt: '2026-05-30T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z',
};

function renderModal(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider><VersionHistoryModal template={template} onClose={onClose} /></AuthProvider>
    </QueryClientProvider>,
  );
}

describe('VersionHistoryModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token', user: { id: 'u1', name: 'Test Admin', email: 'a@b.io', role: 'admin' },
    }));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders entries, marks the current, and restores an older one', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    expect(screen.getByText('Raised MCQ weightage to 30%')).toBeInTheDocument();
    expect(screen.getByText('Added assignment stage')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Jul 10, 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Restore/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fetchMock.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/templates/t1/restore') && (o as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ v: '2.0' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w client -- VersionHistory`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write VersionHistoryModal.tsx**

Create `client/src/pages/Templates/VersionHistoryModal.tsx` (port of prototype lines 1431–1436 markup + 2979–2987 runtime):

```tsx
import { useTemplateMutations } from './hooks/useTemplateMutations.js';
import { fmtDate } from './templateUtils.js';
import type { TemplateItem } from '../../types/templates.js';

export interface VersionHistoryModalProps {
  template: TemplateItem;
  onClose: () => void;
}

export function VersionHistoryModal({ template, onClose }: VersionHistoryModalProps) {
  const { restore } = useTemplateMutations();
  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="verTitle" style={{ maxWidth: 480 }}>
        <div className="modal-h">
          <div>
            <h3 id="verTitle">Version history</h3>
            <p>{template.name} · currently v{template.version}</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b" style={{ gridTemplateColumns: '1fr', paddingBottom: 16 }}>
          <div>
            {template.versions.map((v) => {
              const isCurrent = v.v === template.version;
              return (
                <div className={`ver-item${isCurrent ? ' cur' : ''}`} key={`${v.v}-${v.date}`}>
                  <span className="vtag">v{v.v}</span>
                  <div className="vb"><b>{v.note}</b><span>{fmtDate(v.date)} · {v.by}</span></div>
                  {isCurrent
                    ? <span className="vrestore">Current</span>
                    : (
                      <button
                        className="vrestore" type="button"
                        onClick={() => restore.mutate({ id: template.id, v: v.v }, { onSuccess: onClose })}
                      >
                        Restore
                      </button>
                    )}
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

- [ ] **Step 4: Run the version test to verify it passes**

Run: `npm test -w client -- VersionHistory`
Expected: PASS (1 test).

- [ ] **Step 5: Type-check**

Run: `npx -w client tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Templates/VersionHistoryModal.tsx client/src/test/VersionHistory.test.tsx
git commit -m "feat(client): VersionHistoryModal with restore"
```

---

## Task 8: Client — page shell + route + nav

**Files:**
- Create: `client/src/pages/Templates/index.tsx`
- Modify: `client/src/App.tsx` (import `TemplatesPage`, add `/templates` protected route)
- Modify: `client/src/components/Sidebar.tsx` (Templates nav target `/coming-soon/templates` → `/templates`)

**Interfaces:**
- Consumes: `AppShell`; `useTemplates`, `useTemplateMutations`; `TemplateCards`/`TemplateTable` (+ their `TemplateAction` type); `TemplateEditorModal`; `VersionHistoryModal`; `TEMPLATE_DOMAINS`; `TemplateItem`.
- Produces: `TemplatesPage` (self-wraps in `AppShell`, mirroring SlotsPage). No new test — wiring is covered by the component tests (Tasks 5–7) plus the whole-app `tsc`/build and the live E2E smoke.

- [ ] **Step 1: Write the page**

Create `client/src/pages/Templates/index.tsx`:

```tsx
import { useState } from 'react';
import { AppShell } from '../../components/AppShell.js';
import { TEMPLATE_DOMAINS, type TemplateItem } from '../../types/templates.js';
import { useTemplates } from './hooks/useTemplates.js';
import { useTemplateMutations } from './hooks/useTemplateMutations.js';
import { TemplateCards, type TemplateAction } from './TemplateCards.js';
import { TemplateTable } from './TemplateTable.js';
import { TemplateEditorModal } from './TemplateEditorModal.js';
import { VersionHistoryModal } from './VersionHistoryModal.js';

type EditorState = { mode: 'create' } | { mode: 'edit'; template: TemplateItem } | null;

export function TemplatesPage() {
  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [editor, setEditor] = useState<EditorState>(null);
  const [versions, setVersions] = useState<TemplateItem | null>(null);

  const { data, isLoading, isError, error } = useTemplates({ q, domain, status });
  const { update, clone, remove } = useTemplateMutations();
  const items = data?.items ?? [];

  function onAction(action: TemplateAction, t: TemplateItem) {
    if (action === 'edit') setEditor({ mode: 'edit', template: t });
    else if (action === 'clone') clone.mutate(t.id);
    else if (action === 'version') setVersions(t);
    else if (action === 'toggle') {
      update.mutate({ id: t.id, body: { status: t.status === 'Active' ? 'Inactive' : 'Active' } });
    } else if (action === 'delete') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Delete "${t.name}"? This cannot be undone.`)) remove.mutate(t.id);
    }
  }

  return (
    <AppShell crumb="Library" title="Drive Templates">
      <div className="content">
        <div className="dm-toolbar">
          <div className="dm-search">
            <i className="ti ti-search" />
            <input
              placeholder="Search templates by name or domain…" aria-label="Search templates"
              value={q} onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="">All domains</option>
            {TEMPLATE_DOMAINS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option>Active</option><option>Inactive</option>
          </select>
          <div className="grow" />
          <span className="seg" role="tablist" aria-label="Template view">
            <button className={view === 'cards' ? 'on' : undefined} aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
              <i className="ti ti-layout-grid" /> Cards
            </button>
            <button className={view === 'table' ? 'on' : undefined} aria-pressed={view === 'table'} onClick={() => setView('table')}>
              <i className="ti ti-table" /> Table
            </button>
          </span>
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'create' })}>
            <i className="ti ti-plus" /> Create Template
          </button>
        </div>

        {isError && (
          <div className="card"><p style={{ padding: 20, color: 'var(--danger)' }}>
            Failed to load templates: {error instanceof Error ? error.message : 'Unknown error'}
          </p></div>
        )}
        {isLoading && <div className="dm-empty" style={{ padding: 20 }}>Loading templates…</div>}

        {!isLoading && view === 'cards' && <TemplateCards items={items} onAction={onAction} />}
        {!isLoading && view === 'table' && <TemplateTable items={items} onAction={onAction} />}

        {editor && (
          <TemplateEditorModal
            mode={editor.mode}
            template={editor.mode === 'edit' ? editor.template : undefined}
            onClose={() => setEditor(null)}
          />
        )}
        {versions && <VersionHistoryModal template={versions} onClose={() => setVersions(null)} />}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Add the route in App.tsx**

In `client/src/App.tsx`, add the import (after the `SlotsPage` import):
```tsx
import { TemplatesPage } from './pages/Templates/index.js';
```
and the route (after the `/slots` route):
```tsx
        <Route path="/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Point the sidebar nav at the real route**

In `client/src/components/Sidebar.tsx`, change the Templates NAV entry's `to` from `/coming-soon/templates` to `/templates`:
```tsx
  { label: 'Templates', icon: 'ti-template', to: '/templates' },
```

- [ ] **Step 4: Type-check + full client suite + build**

Run: `npx -w client tsc --noEmit && npm test -w client && npm run -w client build`
Expected: no type errors; all client tests pass; production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Templates/index.tsx client/src/App.tsx client/src/components/Sidebar.tsx
git commit -m "feat(client): Templates page shell, /templates route, and sidebar nav"
```

---

## Task 9: Full-suite verification + live E2E smoke

**Files:** none (verification only).

- [ ] **Step 1: Full server + client suites**

Run: `npm test -w server && npm test -w client`
Expected: all pass (server includes the 9 new template tests; client includes the 4 new template test files).

- [ ] **Step 2: Type-check both packages**

Run: `npx -w server tsc --noEmit && npx -w client tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Re-seed and live smoke**

Run: `npm run seed -w server`, start the server, then (controller performs this manually with a fresh admin token):
- `GET /api/templates` → 5 items; `Data Analyst` v2.1; `Business Analyst` Inactive.
- `GET /api/templates?domain=GenAI` → 1 item.
- `POST /api/templates/:id/clone` on Data Analyst → 201, `Data Analyst (Copy)`, Inactive, v1.0.
- `PATCH /api/templates/:id` with a `sections` body → version bumps to `2.2`; a `{status:'Inactive'}` PATCH does NOT bump.
- `POST /api/templates/:id/restore {v:'2.0'}` → version bumps, entry `Restored v2.0`.
- `DELETE` the clone → `{deleted:true}`.

Expected: all behave per the version rules. (Command Center readiness and all prior module behavior are untouched — no regression expected since this module adds an isolated collection.)

- [ ] **Step 4: No commit** (verification task).

---

## Self-Review Notes (author)

- **Spec coverage:** library (search/domain/status filters, Cards+Table toggle, Create) → Tasks 5+8; six-tab editor incl. weightage good/bad total → Task 6; version history + restore → Task 7; kebab (edit/clone/version/activate-deactivate/delete) → Task 5; versioning rules (create/edit-bump/status-no-bump/clone/restore) → Tasks 1–2; seed of the 5 prototype templates → Task 3; sidebar nav → Task 8. All spec §1/§4/§6/§7 items map to a task.
- **`usedBy`** is a stored stat (seeded, default 0 on create/clone) — no drive link, per spec §2.
- **Weightage ≠ 100 does not block save** (Task 6 `save()` ignores `wtTotal`) — prototype parity, spec §2.
- **Type consistency:** `TemplateAction` defined once in TemplateCards.tsx and imported by TemplateTable + index; `TemplateSections`/`TemplateItem`/`TemplateInput` defined once in types/templates.ts; service `bumpVersion`/`codeFor` signatures match their Task-2 consumers.
- **Known cosmetic drift:** card "Updated X ago" is computed live from `updatedAt` vs `Date.now()`, so the label reads a few days larger than the prototype's frozen strings when viewed after the seed date — accepted by design (spec §2), same pattern as Slots' live "Today". Version-entry dates use `fmtDate` (absolute, UTC) so they always match the prototype exactly.
- **Minor duplication:** `baseSections` exists in both `server/src/seed/seed.ts` (Task 3) and `client/src/pages/Templates/templateUtils.ts` (Task 4) — different packages, no shared module between them; the prototype's shape is the shared contract. Acceptable, noted here so the reviewer doesn't flag it as an accidental copy.
```
