# Employers Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Employers module — an employer list with performance columns + bulk approve/disable + create/edit modal, and a Registration Approvals master-detail queue with five actions (approve-with-employer-upsert, reject, request-changes, move-drive, change-slot) — on the existing MatchDay MERN app.

**Architecture:** Additive `Employer` fields (size/spoc/email + stored stats) and a new `RegistrationRequest` collection with an embedded activity log; two server modules (`employers`, `registrations`) following the established schemas/service/controller/routes layout; React `/employers` list (established list-page pattern, windowed pager lifted to a shared util) and `/employers/approvals` master-detail.

**Tech Stack:** Same as prior slices (Express/TS/Mongoose/zod; React/Vite/react-router/TanStack Query; Vitest + supertest + mongodb-memory-server; Vitest + RTL).

## Global Constraints

- **Language:** TypeScript strict; ESM `.js` import extensions in `.ts`/`.tsx`.
- **Spec is authoritative:** `docs/superpowers/specs/2026-07-15-employers-module-design.md`.
- **Error shape:** `{ error: { message, code } }`; zod → 400 `validation`; unknown/malformed id → 404 `not_found`; no token → 401.
- **Auth:** all new routes behind `requireAuth`. Actor = `"Platform Admin"`.
- **Employer model stays lenient:** keep explicit `createdAt` (NOT `timestamps`), keep `industry` a plain String (zod enforces the enum), keep `offersExtended`/`slotsFillRate` untouched — the Command Center employer leaderboard and dashboard tests depend on them. New fields are optional-with-defaults so existing fixtures keep passing.
- **Approve-upsert:** case-insensitive EXACT name match; create only if absent; existing employers untouched; AuditLog `created` with detail "Created from registration approval".
- **Closed registrations** (Approved/Rejected): approve/reject/request-changes → 400; move-drive/change-slot allowed.
- **Type-check gate:** after each change, `npx tsc --noEmit -p server/tsconfig.json` and/or `client/tsconfig.json` → 0 (Vitest does not type-check).
- **Faithful UI port:** real prototype classes (grep `theme.css`).
- **Commit trailer:** every commit body ends with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
server/src/
  models/Employer.ts                          # additive (T1)
  models/RegistrationRequest.ts               # new (T1)
  modules/employers/
    employers.schemas.ts employers.service.ts employers.controller.ts employers.routes.ts   # (T2/T4)
  modules/registrations/
    registrations.schemas.ts registrations.service.ts registrations.controller.ts registrations.routes.ts  # (T3/T4)
  app.ts                                      # mounts (T4)
  seed/seed.ts                                # employer fields + registrations (T5)
server/test/
  employers.service.test.ts                   # (T2)
  registrations.service.test.ts               # (T3)
  employers.route.test.ts                     # (T4)
client/src/
  types/employers.ts                          # (T6)
  utils/pagerWindow.ts                        # lifted (T6)
  pages/Employers/
    index.tsx EmployersToolbar.tsx EmployersTable.tsx BulkBar.tsx EmployerModal.tsx          # (T6)
    hooks/useEmployers.ts useEmployerMutations.ts                                             # (T6)
    approvals/ApprovalsPage.tsx ApprovalsList.tsx ApprovalDetail.tsx ActionModal.tsx          # (T7)
    approvals/hooks/useRegistrations.ts useRegistrationAction.ts                              # (T7)
  pages/Jobseekers/index.tsx                  # import pagerWindow from utils (T6)
  App.tsx  components/Sidebar.tsx             # routes + nav (T6/T7)
client/src/test/
  EmployersTable.test.tsx                     # (T6)
  ApprovalsPage.test.tsx                      # (T7)
```

---

## Task 1: Employer schema (additive) + RegistrationRequest model

**Files:**
- Modify: `server/src/models/Employer.ts`
- Create: `server/src/models/RegistrationRequest.ts`
- Test: `server/test/models.test.ts` (append)

**Interfaces:** `Employer` gains `size` (enum, default '51–200'), `spoc`/`email` (String, default ''), `activeDrives`/`candidatesViewed`/`shortlistRate`/`offerRate`/`respHours` (Number, default 0). `RegistrationRequest` per spec §3 with `REGISTRATION_STATUSES` exported.

- [ ] **Step 1: Add fields to `server/src/models/Employer.ts`** (after `slotsFillRate`, before `createdAt`; nothing else changes)

```ts
  size: { type: String, enum: ['1–50', '51–200', '201–1000', '1000+'], default: '51–200' },
  spoc: { type: String, default: '' },
  email: { type: String, default: '' },
  activeDrives: { type: Number, default: 0 },
  candidatesViewed: { type: Number, default: 0 },
  shortlistRate: { type: Number, default: 0 },
  offerRate: { type: Number, default: 0 },
  respHours: { type: Number, default: 0 },
```

- [ ] **Step 2: Create `server/src/models/RegistrationRequest.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

export const REGISTRATION_STATUSES = ['Pending review', 'Approved', 'Rejected', 'Changes requested'] as const;

const panelistSchema = new Schema({
  name: { type: String, required: true },
  role: { type: String, default: '' },
}, { _id: false });

const activitySchema = new Schema({
  action: { type: String, required: true },
  by: { type: String, default: 'Platform Admin' },
  at: { type: Date, default: Date.now },
}, { _id: false });

const registrationSchema = new Schema({
  company: { type: String, required: true },
  industry: { type: String, required: true },
  role: { type: String, required: true },
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', default: null },
  driveName: { type: String, default: '' },
  openings: { type: Number, default: 1 },
  ctcRange: { type: String, default: '' },
  skills: { type: [String], default: [] },
  slot: { type: String, default: '' },
  panel: { type: [panelistSchema], default: [] },
  jd: { type: String, default: '' },
  submittedBy: { type: String, default: '' },
  status: { type: String, enum: REGISTRATION_STATUSES, default: 'Pending review' },
  activity: { type: [activitySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export type RegistrationDoc = InferSchemaType<typeof registrationSchema>;
export const RegistrationRequest = model('RegistrationRequest', registrationSchema);
```

- [ ] **Step 3: Append tests to `server/test/models.test.ts`** (add `RegistrationRequest` import)

```ts
  it('persists employer additive fields with defaults', async () => {
    const e = await Employer.create({ name: 'Nexatech', industry: 'Product · SaaS' });
    expect(e.size).toBe('51–200');
    expect(e.respHours).toBe(0);
    const f = await Employer.create({ name: 'Full', industry: 'Fintech', size: '1000+', spoc: 'A B', email: 't@x.com', activeDrives: 3, candidatesViewed: 120, shortlistRate: 40, offerRate: 15, respHours: 12 });
    expect(f.size).toBe('1000+');
    expect(f.shortlistRate).toBe(40);
  });

  it('persists a registration request with panel and activity', async () => {
    const r = await RegistrationRequest.create({
      company: 'Vaultline Systems', industry: 'Fintech', role: 'Backend Engineer (Go)',
      openings: 6, ctcRange: '₹18–26 LPA', skills: ['Go', 'PostgreSQL'],
      slot: 'Wed, Jul 16 · 10:00–12:00', panel: [{ name: 'A. Khanna', role: 'Engineering Manager' }],
      jd: 'We are hiring…', submittedBy: 'D. Sharma',
      activity: [{ action: 'Submitted for review', by: 'D. Sharma (Vaultline)' }],
    });
    expect(r.status).toBe('Pending review');
    expect(r.panel[0].name).toBe('A. Khanna');
    expect(r.activity[0].at).toBeInstanceOf(Date);
    await expect(RegistrationRequest.create({ company: 'X', industry: 'Y', role: 'Z', status: 'Maybe' as never })).rejects.toThrow();
  });
```

- [ ] **Step 4: Gates + commit** — `npx tsc --noEmit -p server/tsconfig.json` → 0; `npm run test -w server` → all pass.
```bash
git add server/src/models/Employer.ts server/src/models/RegistrationRequest.ts server/test/models.test.ts
git commit -m "feat(server): employer additive fields + RegistrationRequest model"
```

---

## Task 2: Employers zod + service

**Files:**
- Create: `server/src/modules/employers/employers.schemas.ts`, `employers.service.ts`
- Test: `server/test/employers.service.test.ts`

**Interfaces:** `createEmployerSchema` (name, industry enum, size enum, spoc, email email-or-empty, status default 'Pending'), `updateEmployerSchema = .partial()`, `listQuerySchema`, `bulkSchema` (`approve|disable`). Service: `listEmployers(params)`, `createEmployer(input, actor)`, `getEmployer(id)`, `updateEmployer(id, patch, actor)`, `bulkEmployerAction(ids, action, actor)` — audit writes mirror the institutes service exactly (`entityType: 'employer'`).

- [ ] **Step 1: Create `server/src/modules/employers/employers.schemas.ts`**

```ts
import { z } from 'zod';

export const INDUSTRIES = ['Product · SaaS', 'Fintech', 'ML / AI Platform', 'Cloud Infra', 'Enterprise', 'E-commerce'] as const;
export const SIZES = ['1–50', '51–200', '201–1000', '1000+'] as const;

export const createEmployerSchema = z.object({
  name: z.string().trim().min(1),
  industry: z.enum(INDUSTRIES),
  size: z.enum(SIZES).default('51–200'),
  spoc: z.string().trim().default(''),
  email: z.string().email().or(z.literal('')).default(''),
  status: z.enum(['Active', 'Pending', 'Disabled']).default('Pending'),
});
export const updateEmployerSchema = createEmployerSchema.partial();

export const listQuerySchema = z.object({
  q: z.string().optional(),
  industry: z.string().optional(),
  status: z.string().optional(),
  sort: z.enum(['name', 'industry', 'drives', 'viewed', 'shortlist', 'offer', 'respHours']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
});
export const bulkSchema = z.object({ ids: z.array(z.string()).min(1), action: z.enum(['approve', 'disable']) });

export type CreateEmployerInput = z.infer<typeof createEmployerSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
```

- [ ] **Step 2: Write the failing test `server/test/employers.service.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Employer } from '../src/models/Employer.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { listEmployers, createEmployer, getEmployer, updateEmployer, bulkEmployerAction } from '../src/modules/employers/employers.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const input = (over = {}) => ({ name: 'Nexatech Labs', industry: 'Product · SaaS' as const, size: '201–1000' as const, spoc: 'R. Iyer', email: 'talent@nexatech.com', status: 'Active' as const, ...over });

describe('employers.service', () => {
  it('creates with audit and lists with stat columns', async () => {
    const e = await createEmployer(input(), 'Platform Admin');
    await Employer.updateOne({ _id: e._id }, { $set: { activeDrives: 3, candidatesViewed: 240, shortlistRate: 44, offerRate: 18, respHours: 9 } });
    expect((await AuditLog.find({ entityType: 'employer', entityId: e._id })).map((l) => l.action)).toContain('created');
    const res = await listEmployers({});
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({ name: 'Nexatech Labs', activeDrives: 3, shortlistRate: 44, respHours: 9 });
  });

  it('filters by q/industry/status and sorts by a stat column', async () => {
    await createEmployer(input(), 'Platform Admin');
    await createEmployer(input({ name: 'Quantbridge', industry: 'Fintech' as const, status: 'Pending' as const }), 'Platform Admin');
    await Employer.updateOne({ name: 'Quantbridge' }, { $set: { respHours: 40 } });
    expect((await listEmployers({ q: 'quant' })).total).toBe(1);
    expect((await listEmployers({ industry: 'Fintech' })).total).toBe(1);
    expect((await listEmployers({ status: 'Pending' })).total).toBe(1);
    const sorted = await listEmployers({ sort: 'respHours', order: 'desc' });
    expect(sorted.items[0].name).toBe('Quantbridge');
  });

  it('updates with the right audit action, bulk-approves, and 404s', async () => {
    const a = await createEmployer(input({ status: 'Pending' as const }), 'Platform Admin');
    const upd = await updateEmployer(String(a._id), { status: 'Active' }, 'Platform Admin');
    expect(upd.status).toBe('Active');
    expect((await AuditLog.find({ entityId: a._id })).map((l) => l.action)).toContain('approved');
    const b = await createEmployer(input({ name: 'B Co', status: 'Pending' as const }), 'Platform Admin');
    const res = await bulkEmployerAction([String(b._id)], 'approve', 'Platform Admin');
    expect(res.affected).toBe(1);
    await expect(getEmployer('64b000000000000000000000')).rejects.toThrow();
    await expect(getEmployer('not-an-id')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: RED** — `npm run test -w server -- employers.service` → FAIL (module not found).

- [ ] **Step 4: Implement `server/src/modules/employers/employers.service.ts`**

Mirror `institutes.service.ts` structurally (assertId → 404; escaped `q` regex over name/industry; plain `.find()` + JS sort acceptable at 48 docs — same approach as institutes; audit writes identical). Sort keys map: `drives→activeDrives`, `viewed→candidatesViewed`, `shortlist→shortlistRate`, `offer→offerRate`, `respHours→respHours`, `name`/`industry` string-compare (localeCompare). `EmployerListItem` = `{ id, name, industry, size, spoc, email, status, activeDrives, candidatesViewed, shortlistRate, offerRate, respHours }`. `updateEmployer` audit action: `approved` when status→Active, `disabled` when →Disabled, `status-changed` for other status changes, else `edited`. `bulkEmployerAction` mirrors institutes (`updateMany` + audit per valid id; return `modifiedCount`). Complete code (write it out fully — ~90 lines, no placeholders):

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Employer } from '../../models/Employer.js';
import { AuditLog } from '../../models/AuditLog.js';
import type { CreateEmployerInput, ListQuery } from './employers.schemas.js';

export type ListParams = Partial<ListQuery>;
export interface EmployerListItem {
  id: string; name: string; industry: string; size: string; spoc: string; email: string; status: string;
  activeDrives: number; candidatesViewed: number; shortlistRate: number; offerRate: number; respHours: number;
}

function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Employer not found', 'not_found');
}
async function writeAudit(entityId: Types.ObjectId, action: string, actor: string, detail: string) {
  await AuditLog.create({ entityType: 'employer', entityId, action, actor, detail });
}

const SORT_KEY: Record<string, keyof EmployerListItem> = {
  name: 'name', industry: 'industry', drives: 'activeDrives', viewed: 'candidatesViewed',
  shortlist: 'shortlistRate', offer: 'offerRate', respHours: 'respHours',
};

export async function listEmployers(params: ListParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 8;
  const match: Record<string, unknown> = {};
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { industry: rx }];
  }
  if (params.industry) match.industry = params.industry;
  if (params.status) match.status = params.status;
  const docs = await Employer.find(match).lean();
  let items: EmployerListItem[] = docs.map((d) => ({
    id: String(d._id), name: d.name as string, industry: d.industry as string,
    size: (d.size as string) ?? '51–200', spoc: (d.spoc as string) ?? '', email: (d.email as string) ?? '',
    status: d.status as string,
    activeDrives: (d.activeDrives as number) ?? 0, candidatesViewed: (d.candidatesViewed as number) ?? 0,
    shortlistRate: (d.shortlistRate as number) ?? 0, offerRate: (d.offerRate as number) ?? 0,
    respHours: (d.respHours as number) ?? 0,
  }));
  const key = params.sort ? SORT_KEY[params.sort] : null;
  const dir = (params.order ?? 'asc') === 'desc' ? -1 : 1;
  items.sort((a, b) => {
    if (key) {
      const av = a[key]; const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') { if (av !== bv) return (av - bv) * dir; }
      else { const cmp = String(av).localeCompare(String(bv)); if (cmp !== 0) return cmp * dir; }
    }
    return a.name.localeCompare(b.name);
  });
  const total = items.length;
  items = items.slice((page - 1) * limit, (page - 1) * limit + limit);
  return { items, total, page, limit };
}

export async function createEmployer(input: CreateEmployerInput, actor: string) {
  const e = await Employer.create(input);
  await writeAudit(e._id, 'created', actor, `Created ${e.name}`);
  return e;
}
export async function getEmployer(id: string) {
  assertId(id);
  const e = await Employer.findById(id);
  if (!e) throw new HttpError(404, 'Employer not found', 'not_found');
  return e;
}
export async function updateEmployer(id: string, patch: Partial<CreateEmployerInput>, actor: string) {
  assertId(id);
  const e = await Employer.findById(id);
  if (!e) throw new HttpError(404, 'Employer not found', 'not_found');
  const prevStatus = e.status;
  Object.assign(e, patch);
  await e.save();
  let action = 'edited';
  if (patch.status && patch.status !== prevStatus) {
    action = patch.status === 'Active' ? 'approved' : patch.status === 'Disabled' ? 'disabled' : 'status-changed';
  }
  await writeAudit(e._id, action, actor, `${action} ${e.name}`);
  return e;
}
export async function bulkEmployerAction(ids: string[], action: 'approve' | 'disable', actor: string) {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id));
  const status = action === 'approve' ? 'Active' : 'Disabled';
  const res = await Employer.updateMany({ _id: { $in: valid } }, { $set: { status } });
  const logAction = action === 'approve' ? 'approved' : 'disabled';
  await Promise.all(valid.map((id) => writeAudit(new Types.ObjectId(id), logAction, actor, `Bulk ${logAction}`)));
  return { affected: res.modifiedCount };
}
```

- [ ] **Step 5: GREEN + gates + commit** — `npm run test -w server -- employers.service` → PASS; tsc → 0; full suite → pass.
```bash
git add server/src/modules/employers server/test/employers.service.test.ts
git commit -m "feat(server): employers service (list/create/get/update/bulk with audit)"
```

---

## Task 3: Registrations service (five actions + approve-upsert)

**Files:**
- Create: `server/src/modules/registrations/registrations.schemas.ts`, `registrations.service.ts`
- Test: `server/test/registrations.service.test.ts`

**Interfaces:**
- `registrations.schemas.ts`: `actionSchema` = zod discriminated union on `action`: `approve` | `reject {reason?}` | `request-changes {note?}` | `move-drive {driveId}` | `change-slot {slot min 1}`. `listQuerySchema` = `{ status? }`.
- `registrations.service.ts`: `listRegistrations(status?)` → `{ items, counts: { pending, total } }` (newest-first); `getRegistration(id)` (404); `applyAction(id, payload, actor)` → updated registration. `CLOSED = ['Approved', 'Rejected']`; approve/reject/request-changes on a closed one → `HttpError(400, 'Registration is closed', 'validation')`. Approve upserts the employer (case-insensitive exact match, create-if-absent, AuditLog). Activity entries unshifted `{ action, by: actor, at: new Date() }`.

- [ ] **Step 1: Create `server/src/modules/registrations/registrations.schemas.ts`**

```ts
import { z } from 'zod';

export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), reason: z.string().optional() }),
  z.object({ action: z.literal('request-changes'), note: z.string().optional() }),
  z.object({ action: z.literal('move-drive'), driveId: z.string().min(1) }),
  z.object({ action: z.literal('change-slot'), slot: z.string().trim().min(1) }),
]);
export const listQuerySchema = z.object({ status: z.string().optional() });
export type ActionPayload = z.infer<typeof actionSchema>;
```

- [ ] **Step 2: Write the failing test `server/test/registrations.service.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { listRegistrations, getRegistration, applyAction } from '../src/modules/registrations/registrations.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function seedReg(over = {}) {
  return RegistrationRequest.create({
    company: 'Vaultline Systems', industry: 'Fintech', role: 'Backend Engineer (Go)',
    openings: 6, ctcRange: '₹18–26 LPA', skills: ['Go'], slot: 'Wed, Jul 16 · 10:00–12:00',
    panel: [{ name: 'A. Khanna', role: 'EM' }], jd: 'JD text', submittedBy: 'D. Sharma',
    activity: [{ action: 'Submitted for review', by: 'D. Sharma (Vaultline)' }], ...over,
  });
}

describe('registrations.service', () => {
  it('lists newest-first with counts', async () => {
    await seedReg();
    await seedReg({ company: 'Northpeak Cloud', status: 'Approved' });
    const res = await listRegistrations();
    expect(res.items).toHaveLength(2);
    expect(res.counts).toEqual({ pending: 1, total: 2 });
    expect((await listRegistrations('Approved')).items).toHaveLength(1);
  });

  it('approve creates the employer when absent (case-insensitive) and logs activity', async () => {
    const r = await seedReg();
    const upd = await applyAction(String(r._id), { action: 'approve' }, 'Platform Admin');
    expect(upd.status).toBe('Approved');
    expect(upd.activity[0].action).toBe('Approved');
    const created = await Employer.findOne({ name: 'Vaultline Systems' });
    expect(created).toBeTruthy();
    expect(created!.industry).toBe('Fintech');
    expect(created!.spoc).toBe('D. Sharma');
    expect(created!.status).toBe('Active');
    expect((await AuditLog.find({ entityType: 'employer', entityId: created!._id })).map((l) => l.action)).toContain('created');
  });

  it('approve does NOT duplicate an existing employer (case-insensitive)', async () => {
    await Employer.create({ name: 'VAULTLINE SYSTEMS', industry: 'Fintech', status: 'Pending' });
    const r = await seedReg();
    await applyAction(String(r._id), { action: 'approve' }, 'Platform Admin');
    expect(await Employer.countDocuments({ name: /vaultline/i })).toBe(1);
    expect((await Employer.findOne({ name: /vaultline/i }))!.status).toBe('Pending'); // untouched
  });

  it('reject/request-changes record the text and closed registrations 400 further decisions', async () => {
    const r = await seedReg();
    const rej = await applyAction(String(r._id), { action: 'reject', reason: 'CTC unclear' }, 'Platform Admin');
    expect(rej.status).toBe('Rejected');
    expect(rej.activity[0].action).toBe('Rejected — CTC unclear');
    await expect(applyAction(String(r._id), { action: 'approve' }, 'Platform Admin')).rejects.toThrow(/closed/i);
    const r2 = await seedReg({ company: 'Cartsy' });
    const ch = await applyAction(String(r2._id), { action: 'request-changes', note: 'clarify band' }, 'Platform Admin');
    expect(ch.status).toBe('Changes requested');
    expect(ch.activity[0].action).toBe('Changes requested — clarify band');
  });

  it('move-drive resolves + denormalizes; change-slot updates; both allowed on closed', async () => {
    const d = await Drive.create({ name: 'Backend · July Cohort', domain: 'Backend', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-16T04:30:00.000Z')] });
    const r = await seedReg({ status: 'Approved' });
    const moved = await applyAction(String(r._id), { action: 'move-drive', driveId: String(d._id) }, 'Platform Admin');
    expect(String(moved.driveId)).toBe(String(d._id));
    expect(moved.driveName).toBe('Backend · July Cohort');
    expect(moved.activity[0].action).toBe('Moved to drive: Backend · July Cohort');
    const slotted = await applyAction(String(r._id), { action: 'change-slot', slot: 'Sat, Jul 26 · 11:00–13:00' }, 'Platform Admin');
    expect(slotted.slot).toBe('Sat, Jul 26 · 11:00–13:00');
    await expect(applyAction(String(r._id), { action: 'move-drive', driveId: '64b000000000000000000000' }, 'Platform Admin')).rejects.toThrow();
    await expect(getRegistration('64b000000000000000000000')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: RED** — `npm run test -w server -- registrations.service` → FAIL.

- [ ] **Step 4: Implement `server/src/modules/registrations/registrations.service.ts`**

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import { Employer } from '../../models/Employer.js';
import { Drive } from '../../models/Drive.js';
import { AuditLog } from '../../models/AuditLog.js';
import type { ActionPayload } from './registrations.schemas.js';

const CLOSED = ['Approved', 'Rejected'];

function assertId(id: string, what = 'Registration') {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, `${what} not found`, 'not_found');
}

export async function listRegistrations(status?: string) {
  const match: Record<string, unknown> = {};
  if (status) match.status = status;
  const [items, pending, total] = await Promise.all([
    RegistrationRequest.find(match).sort({ createdAt: -1 }).lean(),
    RegistrationRequest.countDocuments({ status: 'Pending review' }),
    RegistrationRequest.countDocuments({}),
  ]);
  return { items, counts: { pending, total } };
}

export async function getRegistration(id: string) {
  assertId(id);
  const r = await RegistrationRequest.findById(id);
  if (!r) throw new HttpError(404, 'Registration not found', 'not_found');
  return r;
}

async function upsertEmployerFrom(reg: { company: string; industry: string; submittedBy: string }, actor: string) {
  const escaped = reg.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await Employer.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
  if (existing) return;
  const created = await Employer.create({ name: reg.company, industry: reg.industry, spoc: reg.submittedBy, status: 'Active' });
  await AuditLog.create({ entityType: 'employer', entityId: created._id, action: 'created', actor, detail: 'Created from registration approval' });
}

export async function applyAction(id: string, payload: ActionPayload, actor: string) {
  const reg = await getRegistration(id);
  const log = (action: string) => reg.activity.unshift({ action, by: actor, at: new Date() });
  const requireOpen = () => {
    if (CLOSED.includes(reg.status)) throw new HttpError(400, 'Registration is closed', 'validation');
  };
  switch (payload.action) {
    case 'approve': {
      requireOpen();
      reg.status = 'Approved';
      log('Approved');
      await upsertEmployerFrom(reg, actor);
      break;
    }
    case 'reject': {
      requireOpen();
      reg.status = 'Rejected';
      log(payload.reason?.trim() ? `Rejected — ${payload.reason.trim()}` : 'Rejected');
      break;
    }
    case 'request-changes': {
      requireOpen();
      reg.status = 'Changes requested';
      log(payload.note?.trim() ? `Changes requested — ${payload.note.trim()}` : 'Changes requested');
      break;
    }
    case 'move-drive': {
      assertId(payload.driveId, 'Drive');
      const d = await Drive.findById(payload.driveId);
      if (!d) throw new HttpError(404, 'Drive not found', 'not_found');
      reg.driveId = d._id;
      reg.driveName = d.name;
      log(`Moved to drive: ${d.name}`);
      break;
    }
    case 'change-slot': {
      reg.slot = payload.slot;
      log(`Slot changed: ${payload.slot}`);
      break;
    }
  }
  await reg.save();
  return reg;
}
```

- [ ] **Step 5: GREEN + gates + commit** — registrations.service PASS; tsc 0; full suite pass.
```bash
git add server/src/modules/registrations server/test/registrations.service.test.ts
git commit -m "feat(server): registrations service (five actions incl. approve-upsert)"
```

---

## Task 4: Routes for both modules (protected)

**Files:**
- Create: `server/src/modules/employers/employers.controller.ts`, `employers.routes.ts`, `server/src/modules/registrations/registrations.controller.ts`, `registrations.routes.ts`
- Modify: `server/src/app.ts` (mount both)
- Test: `server/test/employers.route.test.ts`

**Interfaces:** `employerRoutes`: GET `/`, POST `/` (201), POST `/bulk`, GET `/:id`, PATCH `/:id` — `/bulk` before `/:id`; `registrationRoutes`: GET `/`, GET `/:id`, POST `/:id/action`. Both `use(requireAuth)`. Controllers parse with the zod schemas (ACTOR = 'Platform Admin'), delegate to the services (create → 201). Mount `app.use('/api/employers', employerRoutes)` and `app.use('/api/registrations', registrationRoutes)` before `errorHandler`.

- [ ] **Step 1: Create the two controllers + two routers** (mirror `institutes.controller.ts`/`routes.ts` exactly in structure; every handler `asyncHandler`-wrapped).

- [ ] **Step 2: Mount both in `app.ts`** (errorHandler stays last; no duplicate mounts).

- [ ] **Step 3: Write `server/test/employers.route.test.ts`**

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { Employer } from '../src/models/Employer.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
const empBody = { name: 'Nexatech Labs', industry: 'Product · SaaS', size: '201–1000', spoc: 'R. Iyer', email: 'talent@nexatech.com' };

describe('employers + registrations routes', () => {
  it('401s without a token (both modules)', async () => {
    expect((await request(createApp()).get('/api/employers')).status).toBe(401);
    expect((await request(createApp()).get('/api/registrations')).status).toBe(401);
  });
  it('creates (Pending default) then lists an employer; bulk rejects assign', async () => {
    const c = await auth(request(createApp()).post('/api/employers').send(empBody));
    expect(c.status).toBe(201);
    expect(c.body.status).toBe('Pending');
    const list = await auth(request(createApp()).get('/api/employers'));
    expect(list.body.total).toBe(1);
    const asg = await auth(request(createApp()).post('/api/employers/bulk').send({ ids: [c.body._id], action: 'assign' }));
    expect(asg.status).toBe(400);
  });
  it('registration approve endpoint upserts the employer', async () => {
    const r = await RegistrationRequest.create({ company: 'Vaultline Systems', industry: 'Fintech', role: 'BE', submittedBy: 'D. Sharma' });
    const res = await auth(request(createApp()).post(`/api/registrations/${r._id}/action`).send({ action: 'approve' }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Approved');
    expect(await Employer.countDocuments({ name: 'Vaultline Systems' })).toBe(1);
    const again = await auth(request(createApp()).post(`/api/registrations/${r._id}/action`).send({ action: 'reject' }));
    expect(again.status).toBe(400);
  });
  it('registrations list returns counts; bad action body 400s; 404 on unknown id', async () => {
    await RegistrationRequest.create({ company: 'A', industry: 'Fintech', role: 'X' });
    const list = await auth(request(createApp()).get('/api/registrations'));
    expect(list.body.counts).toEqual({ pending: 1, total: 1 });
    const bad = await auth(request(createApp()).post(`/api/registrations/${list.body.items[0]._id}/action`).send({ action: 'explode' }));
    expect(bad.status).toBe(400);
    const miss = await auth(request(createApp()).get('/api/registrations/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
```

- [ ] **Step 4: Gates + commit** — route test PASS; tsc 0; full suite pass.
```bash
git add server/src/modules/employers server/src/modules/registrations server/src/app.ts server/test/employers.route.test.ts
git commit -m "feat(server): protected /api/employers and /api/registrations routes"
```

---

## Task 5: Seed employer fields + registrations

**Files:**
- Modify: `server/src/seed/seed.ts`

- [ ] **Step 1: Expand the employer loop** — add to each created employer (deterministic PRNG): `size: pick(rng, ['1–50','51–200','201–1000','1000+'])`, `spoc: \`${pick(rng, FIRST)} ${pick(rng, LAST)}\``, `email: \`talent@<slug>.com\`` (slug from name, same pattern as institutes), `activeDrives: intBetween(rng, 0, 4)`, `candidatesViewed: intBetween(rng, 40, 420)`, `shortlistRate: intBetween(rng, 20, 60)`, `offerRate: intBetween(rng, 8, 35)`, `respHours: intBetween(rng, 4, 96)`. Existing fields (name/industry/status/offersExtended/slotsFillRate/createdAt) unchanged. NOTE: the employer seed's `industry` values are the shorter labels ('Product', 'ML platform', …) — leave them as-is (model is lenient); only API-created employers enforce the six-value enum.
- [ ] **Step 2: Seed 4 registrations** after drives exist. Import `RegistrationRequest`; add it to the deleteMany group. Create the prototype's four (company/industry/role/openings/ctcRange/skills/slot/panel/jd/submittedBy per the spec §6 and prototype lines 3490–3493), with `driveId`/`driveName` pointing at real seeded drives (`drives[1]` etc. — pick sensible matches), statuses: Vaultline + Northpeak 'Pending review', Aetherverse 'Changes requested' (activity: submitted + changes-requested entries), Cartsy 'Approved' (activity: submitted + approved). `createdAt`/activity `at` values derived from `NOW` minus deterministic offsets (hours/days) — no bare `new Date()`.
- [ ] **Step 3: Gates + commit** — tsc 0; `npm run seed` → "Seed complete."; full suite pass.
```bash
git add server/src/seed/seed.ts
git commit -m "feat(server): seed employer stats/contacts + four registration requests"
```

---

## Task 6: Employers list page + modal + nav (+ shared pagerWindow)

**Files:**
- Create: `client/src/types/employers.ts`, `client/src/utils/pagerWindow.ts`, `client/src/pages/Employers/index.tsx`, `EmployersToolbar.tsx`, `EmployersTable.tsx`, `BulkBar.tsx`, `EmployerModal.tsx`, `hooks/useEmployers.ts`, `hooks/useEmployerMutations.ts`
- Modify: `client/src/pages/Jobseekers/index.tsx` (import `pagerWindow` from the shared util; delete the local copy), `client/src/App.tsx` (`/employers` route), `client/src/components/Sidebar.tsx` (Employers → `/employers`)
- Test: `client/src/test/EmployersTable.test.tsx`

- [ ] **Step 1: Lift `pagerWindow`** — move the function from `pages/Jobseekers/index.tsx` verbatim into `client/src/utils/pagerWindow.ts` (exported); update the Jobseekers import. Jobseekers behavior unchanged (its tests still pass).
- [ ] **Step 2: Types + hooks** — `types/employers.ts`: `EmployerListItem` (per T2), `EmployerListResponse`, `EmployerListParams`, `EmployerInput`, plus `Registration`/`RegistrationListResponse`/`RegistrationActionPayload` (for T7). Hooks mirror the Institutes pattern exactly: `useEmployers(params)` (key `['employers', params]`, GET `/employers?<qs>`), `useEmployerMutations()` (create POST, update PATCH `/:id`, bulk POST `/bulk`; invalidate `['employers']`).
- [ ] **Step 3: List page** — port prototype lines 1893–1956 with real classes (same `.dm-toolbar`/`.bulkbar`/`table.dm`/`.dm-pager` chrome as the other lists): search (debounced), industry + status selects, **Registration Approvals** button → `navigate('/employers/approvals')`, Export (CSV from items), Create → modal; bulk bar Approve / **Assign Drives disabled "coming soon"** / Disable / Clear; sortable columns; status badges (Active→`st-active`, Pending→`st-pending`, Disabled→`st-archived`); **respHours formatted** like the prototype's `fmtResp`: `<24 → "Xh"`, else `(h/24).toFixed(1)+"d"`; **windowed pager** via the shared util (rows 8/15/25). `EmployerModal`: name/industry/size/SPOC/email/status with client-side validation mirroring the zod schema; create/edit via the mutations. Row menu: Edit / Approve / Disable.
- [ ] **Step 4: Route + nav** — App.tsx `/employers` route (self-wrapped AppShell, crumb "Demand", title "Employer Management"); Sidebar Employers → `/employers`.
- [ ] **Step 5: Test `client/src/test/EmployersTable.test.tsx`** — presentational render with explicit props; assert a row shows name, status badge, a stat (e.g. "44%"), and a formatted respHours ("9h").
- [ ] **Step 6: Gates + commit** — client tsc 0; full client suite (incl. Jobseekers tests after the pagerWindow lift) pass, pristine; build success.
```bash
git add client/src/types/employers.ts client/src/utils/pagerWindow.ts client/src/pages/Employers client/src/pages/Jobseekers/index.tsx client/src/App.tsx client/src/components/Sidebar.tsx client/src/test/EmployersTable.test.tsx
git commit -m "feat(client): employers list page with stats columns, bulk, modal; shared windowed pager"
```

---

## Task 7: Registration Approvals page (master-detail)

**Files:**
- Create: `client/src/pages/Employers/approvals/ApprovalsPage.tsx`, `ApprovalsList.tsx`, `ApprovalDetail.tsx`, `ActionModal.tsx`, `approvals/hooks/useRegistrations.ts`, `useRegistrationAction.ts`
- Modify: `client/src/App.tsx` (`/employers/approvals` route)
- Test: `client/src/test/ApprovalsPage.test.tsx`

- [ ] **Step 1: Hooks** — `useRegistrations()` (key `['registrations']`, GET `/registrations` → `{items, counts}`); `useRegistrationAction()` (mutation POST `/registrations/:id/action`; onSuccess invalidate `['registrations']` and — when the action was `approve` — also `['employers']`).
- [ ] **Step 2: Page** — port prototype lines 1959–1968 + renderers 3497–3541 with real classes (`.backlink`, `.section-title`, `.appr-wrap`, `.appr-item`/`.ai-top`/`.ai-meta`, `.ad-head`/`.ad-actions`/`.ad-body`/`.ad-sec`/`.ad-grid`/`.ad-f`, `.skillchips`, `.jd-box`, `.panelist`/`.pav`, `.adlog` — grep theme.css; if a class is missing, use the nearest real equivalent and report). `ApprovalsPage` (AppShell crumb "Demand · Employers", title "Registration Approvals"): backlink → `/employers`; header count "`{pending} awaiting review · {total} total`"; selection state (default first item). `ApprovalsList`: cards with logo initials/deterministic color, company, role, status badge (`Pending review→st-pending, Approved→st-active, Rejected→st-danger, Changes requested→st-teal`), relative submitted-time from `createdAt` (simple helper: <1h "just now"/"Xm ago", <24h "Xh ago", else "Xd ago"). `ApprovalDetail`: header + actions (Approve/Reject/Request Changes disabled when status ∈ {Approved, Rejected}; Move Drive/Change Slot always enabled) + the six `.ad-sec` sections; JD rendered with preserved newlines (`white-space: pre-line` via existing `.jd-box` class). `ActionModal`: variant per action — reject (reason textarea), request-changes (note textarea), move-drive (select fed by `useDrives({ limit: 100 })` filtered `status !== 'Archived'`), change-slot (select of curated upcoming Wed/Sat slots, e.g. generated "Wed, Jul 22 · 10:00–12:00"-style strings from the next 3 Wednesdays + 2 Saturdays × 2 time windows). Confirm → `useRegistrationAction`.
- [ ] **Step 3: Test `client/src/test/ApprovalsPage.test.tsx`** — mock fetch (GET /registrations → 2 seeded-style items with counts; POST action → updated item). Render via MemoryRouter at `/employers/approvals` (+ QueryClientProvider + AuthProvider with seeded localStorage, following InstituteDetail.test.tsx). Assert: the queue renders both companies + the counts header; clicking the second item shows its role in the detail; clicking Approve fires the action POST (assert fetch called with `{action:'approve'}`) and the UI reflects the refetched status. Pristine.
- [ ] **Step 4: Gates + commit** — client tsc 0; full client suite pass, pristine; build success.
```bash
git add client/src/pages/Employers/approvals client/src/App.tsx client/src/test/ApprovalsPage.test.tsx
git commit -m "feat(client): registration approvals master-detail with five actions"
```

---

## Task 8: End-to-end verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** `npm test` → all green, pristine. **Step 2:** both tsc 0; client build success. **Step 3 (API smoke, mongod running):** re-seed; exercise `GET /api/employers` (stats columns + filters/sort), `POST` + `PATCH` + `POST /bulk`, `GET /api/registrations` (4 seeded, counts `{pending:2,total:4}`), approve Vaultline (→ employer created), approve on Aetherverse after re-seed sanity (NO duplicate — count by /vaultline|aetherverse/i), reject/request-changes/move-drive/change-slot round-trips, closed-registration 400; confirm the Command Center still returns readiness 82 / matchReady 531 and the employer leaderboard unchanged. **Step 4 (manual):** `/employers` list + modal + bulk; `/employers/approvals` queue: select, approve (employer appears in list), reject with reason, move drive, change slot. **Step 5:** README "Employers" line. **Step 6:** commit `docs: note Employers module and verify end-to-end`.

---

## Self-Review Notes (author checklist — resolved)

- **Spec coverage:** additive Employer + RegistrationRequest (T1) · employers service/list/audit (T2) · registrations five actions + approve-upsert + closed-400 (T3) · both routers + mounts (T4) · seed stats + 4 registrations (T5) · list UI + modal + shared pager + nav (T6) · approvals master-detail + action modal (T7) · E2E + CC re-verify (T8). ✔
- **Green at each step:** Employer change additive/lenient (industry String, explicit createdAt) so CC dashboard tests stay green; seed keeps existing employer fields untouched.
- **Type consistency:** `EmployerListItem`/`Registration` shapes shared server↔client; action payload union mirrored; `pagerWindow` signature unchanged by the lift.
- **Placeholder scan:** all authored server logic complete; client tasks reference exact prototype line ranges + established patterns (Institutes list/modal, InstituteDetail test) as the copy-source. The only cross-task dependency is types for T7 declared in T6 — same file, listed explicitly. ✔
