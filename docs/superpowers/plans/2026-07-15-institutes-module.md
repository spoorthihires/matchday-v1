# Institutes Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full, faithful Institutes module — a list with overview KPIs + derived funnel analytics, a create/edit modal, bulk approve/disable, and a 7-tab detail page (6 tabs real, Drives tab "coming soon") — on the existing MatchDay MERN app.

**Architecture:** Expand the `Institute` model (owner/email/ownershipHistory) additively and add a reusable `AuditLog` collection; add an `/api/institutes` module whose list merges per-institute Jobseeker funnel aggregates onto institutes; add `/institutes` + `/institutes/:id` React pages reusing the app shell, auth, and TanStack Query. Funnel metrics are derived live from Jobseeker (cumulative), never stored.

**Tech Stack:** Same as prior slices — Express + TypeScript + Mongoose + zod (server); React 18 + Vite + react-router-dom + @tanstack/react-query (client); Vitest + supertest + mongodb-memory-server (server); Vitest + React Testing Library (client).

## Global Constraints

- **Language:** TypeScript strict; ESM — relative imports use `.js` extensions in `.ts`/`.tsx`.
- **Spec is authoritative:** `docs/superpowers/specs/2026-07-15-institutes-module-design.md`.
- **Error shape:** `{ error: { message, code } }` via the existing `errorHandler`/`HttpError`.
- **Auth:** all `/api/institutes/*` behind `requireAuth`. `actor`/`changedBy`/`createdBy` = `"Platform Admin"` (single-admin app).
- **Do NOT switch `Institute` to `{ timestamps: true }`** — keep its explicit `createdAt` field, because the Command Center dashboard tests seed institutes with an explicit `createdAt` for the 30-day delta window and `timestamps` would override it. Add the new fields as optional-with-defaults so existing fixtures (which create institutes without owner/email) keep passing. Mongoose `Institute.type` stays a plain `String` (NOT an enum) so fixtures using `type:'Engineering'` still validate; the enum is enforced by zod at the API boundary.
- **Funnel metrics** are derived from Jobseeker with cumulative "reached at least stage X" semantics (consistent with the Command Center).
- **Type-check gate:** after each change, `npx tsc --noEmit -p server/tsconfig.json` and/or `client/tsconfig.json` → 0 errors (Vitest does not type-check).
- **Faithful UI port:** components use the prototype's REAL class names; grep `theme.css` to confirm.
- **Commit trailer:** end every commit body with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
server/src/
  models/Institute.ts                       # expanded (T1)
  models/AuditLog.ts                         # new (T1)
  modules/institutes/
    institutes.schemas.ts institutes.service.ts institutes.controller.ts institutes.routes.ts  # (T2/T3)
  app.ts                                     # mount /api/institutes (T3)
  seed/seed.ts                               # institute fields + audit logs (T4)
server/test/
  institutes.service.test.ts                 # (T2)
  institutes.route.test.ts                   # (T3)
client/src/
  types/institutes.ts                        # (T5)
  pages/Institutes/
    index.tsx InstitutesToolbar.tsx InstitutesTable.tsx BulkBar.tsx InstituteModal.tsx  # (T5)
    hooks/useInstitutes.ts useInstituteMutations.ts                                       # (T5)
    hooks/useInstitute.ts useInstituteCandidates.ts useInstituteAudit.ts                  # (T6/T7)
    detail/InstituteDetail.tsx TabOverview.tsx TabFunnel.tsx TabPerformance.tsx
           TabOwnership.tsx TabDrivesComingSoon.tsx                                        # (T6)
    detail/TabCandidates.tsx TabAudit.tsx                                                  # (T7)
  App.tsx                                    # /institutes + /institutes/:id (T5/T6)
  components/Sidebar.tsx                     # Institutes → /institutes (T5)
client/src/test/
  InstitutesTable.test.tsx                   # (T5)
  InstituteDetail.test.tsx                   # (T6)
```

---

## Task 1: Expand Institute schema + AuditLog model

**Files:**
- Modify: `server/src/models/Institute.ts`
- Create: `server/src/models/AuditLog.ts`
- Test: `server/test/models.test.ts` (append)

**Interfaces:**
- `Institute` gains `owner: string` (default ''), `email: string` (default ''), `ownershipHistory: { owner; email; changedAt: Date; changedBy: string }[]` (default []). Keep existing `name/city/type(String)/status/createdAt`. Do NOT add `timestamps`.
- `AuditLog` model: `{ entityType: string; entityId: ObjectId; action: string; actor: string; detail?: string; at: Date (default Date.now) }`, with an index on `{ entityType, entityId, at: -1 }`.

- [ ] **Step 1: Rewrite `server/src/models/Institute.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const ownershipEntrySchema = new Schema({
  owner: { type: String, default: '' },
  email: { type: String, default: '' },
  changedAt: { type: Date, default: Date.now },
  changedBy: { type: String, default: 'Platform Admin' },
}, { _id: false });

const instituteSchema = new Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
  type: { type: String, required: true },            // free string at the model layer; zod enforces the enum
  status: { type: String, enum: ['Active', 'Pending', 'Disabled'], default: 'Active' },
  owner: { type: String, default: '' },
  email: { type: String, default: '' },
  ownershipHistory: { type: [ownershipEntrySchema], default: [] },
  createdAt: { type: Date, default: Date.now },       // explicit — NOT timestamps
});

export type InstituteDoc = InferSchemaType<typeof instituteSchema>;
export const Institute = model('Institute', instituteSchema);
```

- [ ] **Step 2: Create `server/src/models/AuditLog.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const auditLogSchema = new Schema({
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, required: true },
  actor: { type: String, default: 'Platform Admin' },
  detail: { type: String, default: '' },
  at: { type: Date, default: Date.now },
});
auditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model('AuditLog', auditLogSchema);
```

- [ ] **Step 3: Append tests to `server/test/models.test.ts`**

Add `import { AuditLog } from '../src/models/AuditLog.js';` at the top (and `Institute` if not present), then:

```ts
  it('persists an institute with owner/email/ownershipHistory', async () => {
    const inst = await Institute.create({
      name: 'CBIT', city: 'Hyderabad', type: 'Engineering College', status: 'Active',
      owner: 'Sharath P.', email: 'spoc@cbit.edu',
      ownershipHistory: [{ owner: 'Sharath P.', email: 'spoc@cbit.edu', changedBy: 'Platform Admin' }],
    });
    expect(inst.owner).toBe('Sharath P.');
    expect(inst.ownershipHistory).toHaveLength(1);
    expect(inst.ownershipHistory[0].changedAt).toBeInstanceOf(Date);
  });

  it('accepts a legacy institute without owner/email (additive defaults)', async () => {
    const inst = await Institute.create({ name: 'X', city: 'Y', type: 'Engineering' });
    expect(inst.owner).toBe('');
    expect(inst.ownershipHistory).toEqual([]);
  });

  it('writes an audit log', async () => {
    const log = await AuditLog.create({ entityType: 'institute', entityId: '64b000000000000000000000', action: 'created', actor: 'Platform Admin', detail: 'Created CBIT' });
    expect(log.action).toBe('created');
    expect(log.at).toBeInstanceOf(Date);
  });
```

- [ ] **Step 4: Type-check + tests + commit**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0 errors. `npm run test -w server` → all pass (existing + 3 new).
```bash
git add server/src/models/Institute.ts server/src/models/AuditLog.ts server/test/models.test.ts
git commit -m "feat(server): expand Institute schema and add AuditLog model"
```

---

## Task 2: Institutes zod + service

**Files:**
- Create: `server/src/modules/institutes/institutes.schemas.ts`, `institutes.service.ts`
- Test: `server/test/institutes.service.test.ts`

**Interfaces:**
- Consumes: `Institute`, `AuditLog`, `Jobseeker` (+ `JOBSEEKER_STAGES`), `HttpError`.
- Produces (`institutes.service.ts`):
  - `listInstitutes(params: ListParams): Promise<{ items: InstituteListItem[]; total; page; limit; overview: Overview }>`
  - `getInstitute(id): Promise<InstituteDetail>` (throws 404) — `{ institute, funnel, kpis, performance }`
  - `createInstitute(input, actor): Promise<InstituteDoc>` (ownershipHistory seed + AuditLog 'created')
  - `updateInstitute(id, patch, actor): Promise<InstituteDoc>` (append ownershipHistory if owner/email changed; AuditLog action derived from status change)
  - `bulkInstituteAction(ids, action: 'approve'|'disable', actor): Promise<{ affected }>` (+ AuditLog per id)
  - `listCandidates(id, page, limit): Promise<{ items; total; page; limit }>`
  - `listAudit(id, page, limit): Promise<{ items; total; page; limit }>`
  - exported types `InstituteListItem`, `Overview`, `Funnel`.
- `institutes.schemas.ts`: `createInstituteSchema` (name, type enum, city, owner, email email, status optional default 'Pending'), `updateInstituteSchema = createInstituteSchema.partial()`, `listQuerySchema`, `bulkSchema` (`action ∈ {approve, disable}`), `pageQuerySchema`.

- [ ] **Step 1: Create `server/src/modules/institutes/institutes.schemas.ts`**

```ts
import { z } from 'zod';

const TYPES = ['Engineering College', 'University', 'Autonomous Institute', 'Bootcamp'] as const;

export const createInstituteSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(TYPES),
  city: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  email: z.string().trim().email(),
  status: z.enum(['Active', 'Pending', 'Disabled']).default('Pending'),
});
export const updateInstituteSchema = createInstituteSchema.partial();

export const listQuerySchema = z.object({
  q: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  sort: z.enum(['name', 'type', 'uploaded', 'signup', 'completion', 'matchReady', 'shortlist', 'offer', 'joined']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
});
export const bulkSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(['approve', 'disable']),
});
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type CreateInstituteInput = z.infer<typeof createInstituteSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
```

- [ ] **Step 2: Write the failing test `server/test/institutes.service.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { AuditLog } from '../src/models/AuditLog.js';
import {
  listInstitutes, getInstitute, createInstitute, updateInstitute,
  bulkInstituteAction, listCandidates, listAudit,
} from '../src/modules/institutes/institutes.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const baseInput = () => ({ name: 'CBIT', type: 'Engineering College' as const, city: 'Hyderabad', owner: 'Sharath P.', email: 'spoc@cbit.edu' });

// Seed one institute with a known 10-jobseeker funnel.
async function seedInstituteWithFunnel(status: 'Active' | 'Pending' | 'Disabled' = 'Active') {
  const inst = await createInstitute({ ...baseInput(), status }, 'Platform Admin');
  const stages = [
    ...Array(4).fill('Applied'),      // uploaded but not past applied
    'Screened', 'Evaluated',           // past applied, not match-ready
    'MatchReady', 'Shortlisted',       // match-ready+
    'Offer', 'Joined',                 // offer+, joined
  ];
  for (const stage of stages) {
    await Jobseeker.create({
      name: 'JS', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus',
      profileCompleted: stage !== 'Applied', evaluationStatus: 'completed', stage,
    });
  }
  return inst;
}

describe('institutes.service', () => {
  it('creates an institute with an initial ownership entry and a created audit log', async () => {
    const inst = await createInstitute(baseInput(), 'Platform Admin');
    expect(inst.ownershipHistory).toHaveLength(1);
    expect(inst.ownershipHistory[0].owner).toBe('Sharath P.');
    const logs = await AuditLog.find({ entityType: 'institute', entityId: inst._id });
    expect(logs.map((l) => l.action)).toContain('created');
  });

  it('computes the derived funnel for the list', async () => {
    await seedInstituteWithFunnel('Active');
    const res = await listInstitutes({});
    const it0 = res.items[0];
    expect(it0.uploaded).toBe(10);
    expect(it0.signupPct).toBe(60);      // 6 of 10 past 'Applied'
    expect(it0.completionPct).toBe(60);  // 6 of 10 profileCompleted
    expect(it0.matchReadyPct).toBe(40);  // MatchReady+Shortlisted+Offer+Joined = 4
    expect(it0.shortlistPct).toBe(30);   // Shortlisted+Offer+Joined = 3
    expect(it0.offerPct).toBe(20);       // Offer+Joined = 2
    expect(it0.joinedPct).toBe(10);      // Joined = 1
  });

  it('computes global overview KPIs', async () => {
    await seedInstituteWithFunnel('Active');
    await createInstitute({ ...baseInput(), name: 'Pending U', status: 'Pending' }, 'Platform Admin');
    const res = await listInstitutes({});
    expect(res.overview.total).toBe(2);
    expect(res.overview.pending).toBe(1);
    expect(res.overview.uploaded).toBe(10);
    expect(res.overview.avgMatchReadyPct).toBe(40); // avg over active institutes (only CBIT active w/ candidates)
  });

  it('filters by status and searches by q', async () => {
    await seedInstituteWithFunnel('Active');
    await createInstitute({ ...baseInput(), name: 'Bootcamp X', type: 'Bootcamp', status: 'Pending' }, 'Platform Admin');
    expect((await listInstitutes({ status: 'Pending' })).total).toBe(1);
    expect((await listInstitutes({ q: 'cbit' })).total).toBe(1);
  });

  it('sorts by a funnel column (matchReady desc)', async () => {
    const a = await seedInstituteWithFunnel('Active'); // matchReadyPct 40
    const b = await createInstitute({ ...baseInput(), name: 'ZeroInst', status: 'Active' }, 'Platform Admin'); // 0 candidates → 0
    const res = await listInstitutes({ sort: 'matchReady', order: 'desc' });
    expect(res.items[0].name).toBe('CBIT');
    expect(res.items[1].name).toBe('ZeroInst');
  });

  it('appends ownership history only when owner/email changes and logs the action', async () => {
    const inst = await createInstitute(baseInput(), 'Platform Admin');
    await updateInstitute(String(inst._id), { city: 'Secunderabad' }, 'Platform Admin'); // no owner change
    let fresh = await getInstitute(String(inst._id));
    expect(fresh.institute.ownershipHistory).toHaveLength(1);
    await updateInstitute(String(inst._id), { owner: 'New SPOC' }, 'Platform Admin');     // owner change
    fresh = await getInstitute(String(inst._id));
    expect(fresh.institute.ownershipHistory).toHaveLength(2);
    const actions = (await AuditLog.find({ entityId: inst._id })).map((l) => l.action);
    expect(actions).toContain('edited');
  });

  it('bulk-approves and rejects an unknown id gracefully; logs per id', async () => {
    const a = await createInstitute({ ...baseInput(), status: 'Pending' }, 'Platform Admin');
    const b = await createInstitute({ ...baseInput(), name: 'B', status: 'Pending' }, 'Platform Admin');
    const res = await bulkInstituteAction([String(a._id), String(b._id)], 'approve', 'Platform Admin');
    expect(res.affected).toBe(2);
    expect(await Institute.countDocuments({ status: 'Active' })).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'approved' })).toBe(2);
  });

  it('paginates candidates and audit logs, 404s on unknown id', async () => {
    const inst = await seedInstituteWithFunnel('Active');
    const cands = await listCandidates(String(inst._id), 1, 4);
    expect(cands.total).toBe(10);
    expect(cands.items).toHaveLength(4);
    const audit = await listAudit(String(inst._id), 1, 10);
    expect(audit.total).toBeGreaterThanOrEqual(1); // 'created'
    await expect(getInstitute('64b000000000000000000000')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm run test -w server -- institutes.service` → FAIL (module not found).

- [ ] **Step 4: Implement `server/src/modules/institutes/institutes.service.ts`**

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Institute } from '../../models/Institute.js';
import { AuditLog } from '../../models/AuditLog.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import type { CreateInstituteInput, ListQuery } from './institutes.schemas.js';

export type ListParams = Partial<ListQuery>;
export interface Funnel {
  uploaded: number; signupPct: number; completionPct: number;
  matchReadyPct: number; shortlistPct: number; offerPct: number; joinedPct: number;
}
export interface InstituteListItem extends Funnel {
  id: string; name: string; city: string; type: string; status: string; owner: string; email: string;
}
export interface Overview { total: number; pending: number; uploaded: number; avgMatchReadyPct: number; }

const MATCH_READY = ['MatchReady', 'Shortlisted', 'Offer', 'Joined'];
const SHORTLIST = ['Shortlisted', 'Offer', 'Joined'];
const OFFER = ['Offer', 'Joined'];

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Institute not found', 'not_found');
}

/** raw per-institute jobseeker counts, keyed by institute id string */
async function funnelCounts(): Promise<Map<string, { uploaded: number; pastApplied: number; profiles: number; mr: number; sl: number; of: number; jn: number }>> {
  const agg = await Jobseeker.aggregate([
    { $group: {
      _id: '$instituteId',
      uploaded: { $sum: 1 },
      pastApplied: { $sum: { $cond: [{ $ne: ['$stage', 'Applied'] }, 1, 0] } },
      profiles: { $sum: { $cond: ['$profileCompleted', 1, 0] } },
      mr: { $sum: { $cond: [{ $in: ['$stage', MATCH_READY] }, 1, 0] } },
      sl: { $sum: { $cond: [{ $in: ['$stage', SHORTLIST] }, 1, 0] } },
      of: { $sum: { $cond: [{ $in: ['$stage', OFFER] }, 1, 0] } },
      jn: { $sum: { $cond: [{ $eq: ['$stage', 'Joined'] }, 1, 0] } },
    } },
  ]);
  return new Map(agg.map((f) => [String(f._id), f]));
}

function toFunnel(c?: { uploaded: number; pastApplied: number; profiles: number; mr: number; sl: number; of: number; jn: number }): Funnel {
  const u = c?.uploaded ?? 0;
  return {
    uploaded: u,
    signupPct: pct(c?.pastApplied ?? 0, u),
    completionPct: pct(c?.profiles ?? 0, u),
    matchReadyPct: pct(c?.mr ?? 0, u),
    shortlistPct: pct(c?.sl ?? 0, u),
    offerPct: pct(c?.of ?? 0, u),
    joinedPct: pct(c?.jn ?? 0, u),
  };
}

const SORT_KEY: Record<string, keyof InstituteListItem> = {
  name: 'name', type: 'type', uploaded: 'uploaded', signup: 'signupPct', completion: 'completionPct',
  matchReady: 'matchReadyPct', shortlist: 'shortlistPct', offer: 'offerPct', joined: 'joinedPct',
};

export async function listInstitutes(params: ListParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 8;
  const counts = await funnelCounts();

  // global overview over ALL institutes
  const allInst = await Institute.find({}).lean();
  const total = allInst.length;
  const pending = allInst.filter((i) => i.status === 'Pending').length;
  let uploadedAll = 0;
  for (const c of counts.values()) uploadedAll += c.uploaded;
  const activeMr = allInst.filter((i) => i.status === 'Active').map((i) => toFunnel(counts.get(String(i._id))).matchReadyPct);
  const avgMatchReadyPct = activeMr.length ? Math.round(activeMr.reduce((a, b) => a + b, 0) / activeMr.length) : 0;
  const overview: Overview = { total, pending, uploaded: uploadedAll, avgMatchReadyPct };

  // filtered list
  const match: Record<string, unknown> = {};
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { type: rx }, { city: rx }];
  }
  if (params.type) match.type = params.type;
  if (params.status) match.status = params.status;

  const filtered = await Institute.find(match).lean();
  let items: InstituteListItem[] = filtered.map((i) => ({
    id: String(i._id), name: i.name as string, city: i.city as string, type: i.type as string,
    status: i.status as string, owner: (i.owner as string) ?? '', email: (i.email as string) ?? '',
    ...toFunnel(counts.get(String(i._id))),
  }));

  const key = params.sort ? SORT_KEY[params.sort] : null;
  const dir = (params.order ?? (params.sort ? 'asc' : 'asc')) === 'desc' ? -1 : 1;
  items.sort((a, b) => {
    if (key) {
      const av = a[key]; const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') { if (av !== bv) return (av - bv) * dir; }
      else { const cmp = String(av).localeCompare(String(bv)); if (cmp !== 0) return cmp * dir; }
    }
    return a.name.localeCompare(b.name);
  });

  const totalFiltered = items.length;
  items = items.slice((page - 1) * limit, (page - 1) * limit + limit);
  return { items, total: totalFiltered, page, limit, overview };
}

export async function getInstitute(id: string) {
  assertId(id);
  const inst = await Institute.findById(id).lean();
  if (!inst) throw new HttpError(404, 'Institute not found', 'not_found');
  const counts = await funnelCounts();
  const funnel = toFunnel(counts.get(String(inst._id)));

  // performance vs platform average (active institutes)
  const all = await Institute.find({ status: 'Active' }).lean();
  const mrValues = all.map((i) => ({ id: String(i._id), mr: counts.get(String(i._id))?.mr ?? 0, mrPct: toFunnel(counts.get(String(i._id))).matchReadyPct }));
  const avgMrPct = mrValues.length ? Math.round(mrValues.reduce((a, b) => a + b.mrPct, 0) / mrValues.length) : 0;
  const ranked = [...mrValues].sort((a, b) => b.mr - a.mr);
  const rank = ranked.findIndex((r) => r.id === String(inst._id)) + 1;
  const performance = { matchReadyPct: funnel.matchReadyPct, joinedPct: funnel.joinedPct, avgMatchReadyPct: avgMrPct, rank: rank || null, ofActive: mrValues.length };

  const kpis = { uploaded: funnel.uploaded, matchReadyPct: funnel.matchReadyPct, shortlistPct: funnel.shortlistPct, joinedPct: funnel.joinedPct };
  return { institute: inst, funnel, kpis, performance };
}

async function writeAudit(entityId: Types.ObjectId, action: string, actor: string, detail: string) {
  await AuditLog.create({ entityType: 'institute', entityId, action, actor, detail });
}

export async function createInstitute(input: CreateInstituteInput, actor: string) {
  const inst = await Institute.create({
    ...input,
    ownershipHistory: [{ owner: input.owner, email: input.email, changedAt: new Date(), changedBy: actor }],
  });
  await writeAudit(inst._id, 'created', actor, `Created ${inst.name}`);
  return inst;
}

export async function updateInstitute(id: string, patch: Partial<CreateInstituteInput>, actor: string) {
  assertId(id);
  const inst = await Institute.findById(id);
  if (!inst) throw new HttpError(404, 'Institute not found', 'not_found');
  const prevStatus = inst.status;
  const ownerChanged = (patch.owner !== undefined && patch.owner !== inst.owner) || (patch.email !== undefined && patch.email !== inst.email);
  Object.assign(inst, patch);
  if (ownerChanged) {
    inst.ownershipHistory.push({ owner: inst.owner, email: inst.email, changedAt: new Date(), changedBy: actor });
  }
  await inst.save();
  let action = 'edited';
  if (patch.status && patch.status !== prevStatus) {
    action = patch.status === 'Active' ? 'approved' : patch.status === 'Disabled' ? 'disabled' : 'status-changed';
  }
  await writeAudit(inst._id, action, actor, `${action} ${inst.name}`);
  return inst;
}

export async function bulkInstituteAction(ids: string[], action: 'approve' | 'disable', actor: string) {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id));
  const status = action === 'approve' ? 'Active' : 'Disabled';
  const res = await Institute.updateMany({ _id: { $in: valid } }, { $set: { status } });
  const logAction = action === 'approve' ? 'approved' : 'disabled';
  await Promise.all(valid.map((id) => writeAudit(new Types.ObjectId(id), logAction, actor, `Bulk ${logAction}`)));
  return { affected: res.modifiedCount };
}

export async function listCandidates(id: string, page: number, limit: number) {
  assertId(id);
  const filter = { instituteId: new Types.ObjectId(id) };
  const [docs, total] = await Promise.all([
    Jobseeker.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Jobseeker.countDocuments(filter),
  ]);
  const items = docs.map((d) => ({
    id: String(d._id), name: d.name as string, branch: d.branch as string, gradYear: d.gradYear as number,
    cgpa: d.cgpa as number, source: d.source as string, stage: d.stage as string, profileCompleted: !!d.profileCompleted,
  }));
  return { items, total, page, limit };
}

export async function listAudit(id: string, page: number, limit: number) {
  assertId(id);
  const filter = { entityType: 'institute', entityId: new Types.ObjectId(id) };
  const [docs, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  const items = docs.map((l) => ({ action: l.action as string, actor: l.actor as string, detail: (l.detail as string) ?? '', at: new Date(l.at as Date).toISOString() }));
  return { items, total, page, limit };
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm run test -w server -- institutes.service` → PASS (all cases). Fix the service (not the assertions) if a value is off.

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0 errors.
```bash
git add server/src/modules/institutes/institutes.schemas.ts server/src/modules/institutes/institutes.service.ts server/test/institutes.service.test.ts
git commit -m "feat(server): institutes service (list funnel/overview, detail, create/update/bulk, candidates/audit)"
```

---

## Task 3: Institutes routes + controller (protected)

**Files:**
- Create: `server/src/modules/institutes/institutes.controller.ts`, `institutes.routes.ts`
- Modify: `server/src/app.ts` (mount `/api/institutes`)
- Test: `server/test/institutes.route.test.ts`

**Interfaces:** `instituteRoutes` router (all behind `requireAuth`): `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `POST /bulk`, `GET /:id/candidates`, `GET /:id/audit`.

- [ ] **Step 1: Create `server/src/modules/institutes/institutes.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { createInstituteSchema, updateInstituteSchema, listQuerySchema, bulkSchema, pageQuerySchema } from './institutes.schemas.js';
import {
  listInstitutes, getInstitute, createInstitute, updateInstitute, bulkInstituteAction, listCandidates, listAudit,
} from './institutes.service.js';

const ACTOR = 'Platform Admin';

export async function listController(req: Request, res: Response) {
  res.json(await listInstitutes(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await createInstitute(createInstituteSchema.parse(req.body), ACTOR));
}
export async function getController(req: Request, res: Response) {
  res.json(await getInstitute(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateInstitute(req.params.id, updateInstituteSchema.parse(req.body), ACTOR));
}
export async function bulkController(req: Request, res: Response) {
  const { ids, action } = bulkSchema.parse(req.body);
  res.json(await bulkInstituteAction(ids, action, ACTOR));
}
export async function candidatesController(req: Request, res: Response) {
  const { page, limit } = pageQuerySchema.parse(req.query);
  res.json(await listCandidates(req.params.id, page, limit));
}
export async function auditController(req: Request, res: Response) {
  const { page, limit } = pageQuerySchema.parse(req.query);
  res.json(await listAudit(req.params.id, page, limit));
}
```

- [ ] **Step 2: Create `server/src/modules/institutes/institutes.routes.ts`**

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, createController, getController, patchController, bulkController, candidatesController, auditController,
} from './institutes.controller.js';

export const instituteRoutes = Router();
instituteRoutes.use(requireAuth);
instituteRoutes.get('/', asyncHandler(listController));
instituteRoutes.post('/', asyncHandler(createController));
instituteRoutes.post('/bulk', asyncHandler(bulkController));
instituteRoutes.get('/:id/candidates', asyncHandler(candidatesController));
instituteRoutes.get('/:id/audit', asyncHandler(auditController));
instituteRoutes.get('/:id', asyncHandler(getController));
instituteRoutes.patch('/:id', asyncHandler(patchController));
```
(`/bulk` and the `/:id/...` sub-routes are declared before the bare `/:id`.)

- [ ] **Step 3: Mount in `server/src/app.ts`**

```ts
import { instituteRoutes } from './modules/institutes/institutes.routes.js';
```
```ts
  app.use('/api/institutes', instituteRoutes);
```
(errorHandler stays last; do not duplicate other mounts.)

- [ ] **Step 4: Write the failing test `server/test/institutes.route.test.ts`**

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
const body = { name: 'CBIT', type: 'Engineering College', city: 'Hyderabad', owner: 'Sharath P.', email: 'spoc@cbit.edu' };

describe('institutes routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/institutes')).status).toBe(401);
  });
  it('creates then lists with overview', async () => {
    const c = await auth(request(createApp()).post('/api/institutes').send(body));
    expect(c.status).toBe(201);
    expect(c.body.status).toBe('Pending');
    const list = await auth(request(createApp()).get('/api/institutes'));
    expect(list.body.total).toBe(1);
    expect(list.body.overview.total).toBe(1);
    expect(list.body.items[0].uploaded).toBe(0);
  });
  it('400s on invalid create (bad email) and on bulk action "assign"', async () => {
    const bad = await auth(request(createApp()).post('/api/institutes').send({ ...body, email: 'nope' }));
    expect(bad.status).toBe(400);
    const c = await auth(request(createApp()).post('/api/institutes').send(body));
    const asg = await auth(request(createApp()).post('/api/institutes/bulk').send({ ids: [c.body._id], action: 'assign' }));
    expect(asg.status).toBe(400);
  });
  it('patch approve + detail + candidates + audit + 404', async () => {
    const c = await auth(request(createApp()).post('/api/institutes').send(body));
    const id = c.body._id;
    const pub = await auth(request(createApp()).patch(`/api/institutes/${id}`).send({ status: 'Active' }));
    expect(pub.body.status).toBe('Active');
    const det = await auth(request(createApp()).get(`/api/institutes/${id}`));
    expect(det.body).toHaveProperty('funnel.uploaded', 0);
    expect(det.body).toHaveProperty('performance');
    const cand = await auth(request(createApp()).get(`/api/institutes/${id}/candidates`));
    expect(cand.body.total).toBe(0);
    const aud = await auth(request(createApp()).get(`/api/institutes/${id}/audit`));
    expect(aud.body.total).toBeGreaterThanOrEqual(1);
    const miss = await auth(request(createApp()).get('/api/institutes/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run + type-check**

Run: `npm run test -w server -- institutes.route` → PASS. `npx tsc --noEmit -p server/tsconfig.json` → 0. `npm run test -w server` → all pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/institutes/institutes.controller.ts server/src/modules/institutes/institutes.routes.ts server/src/app.ts server/test/institutes.route.test.ts
git commit -m "feat(server): protected /api/institutes routes (list/create/get/patch/bulk/candidates/audit)"
```

---

## Task 4: Seed institutes + audit logs

**Files:**
- Modify: `server/src/seed/seed.ts`

**Interfaces:** the 21 seeded institutes gain `type` (from the 4 enum values), `owner`, `email`, an initial `ownershipHistory`; a few `AuditLog` rows per institute are inserted after institutes + jobseekers.

- [ ] **Step 1: Update institute creation in `seed.ts`**

Add `import { AuditLog } from '../models/AuditLog.js';` and include AuditLog in the initial `deleteMany` group. Replace the institute-creation loop body:

```ts
  const INST_TYPES = ['Engineering College', 'University', 'Autonomous Institute', 'Bootcamp'];
  const institutes = [];
  for (let i = 0; i < 21; i++) {
    const base = INSTITUTE_SEED[i % INSTITUTE_SEED.length];
    const name = i < INSTITUTE_SEED.length ? base[0] : `${base[0]} Campus ${Math.floor(i / INSTITUTE_SEED.length) + 1}`;
    const owner = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 10) || 'inst';
    const email = `spoc@${slug}.edu`;
    const createdAt = spread();
    const status = i < 18 ? 'Active' : i < 20 ? 'Pending' : 'Disabled';
    institutes.push(await Institute.create({
      name, city: base[1], type: pick(rng, INST_TYPES), status, owner, email, createdAt,
      ownershipHistory: [{ owner, email, changedAt: createdAt, changedBy: 'Platform Admin' }],
    }));
  }
```
(Keep the rest of the seed — employers/drives/jobseekers/slots — unchanged. The dashboard still counts `status:'Active'` institutes; keeping ~18 Active preserves the participation KPI's ballpark.)

- [ ] **Step 2: Seed audit logs after jobseekers/slots are inserted**

```ts
  const auditDocs = [];
  for (const inst of institutes) {
    auditDocs.push({ entityType: 'institute', entityId: inst._id, action: 'created', actor: 'Platform Admin', detail: `Created ${inst.name}`, at: inst.createdAt });
    if (inst.status === 'Active') auditDocs.push({ entityType: 'institute', entityId: inst._id, action: 'approved', actor: 'Platform Admin', detail: `Approved ${inst.name}`, at: new Date(inst.createdAt.getTime() + DAY) });
  }
  await AuditLog.insertMany(auditDocs);
```

- [ ] **Step 3: Type-check + run seed (mongod running)**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0. `npm run seed` → prints "Seed complete." + admin login. `npm run test -w server` → all pass (seed uses the real DB, tests use in-memory).

- [ ] **Step 4: Commit**

```bash
git add server/src/seed/seed.ts
git commit -m "feat(server): seed institute owner/email/ownership + audit logs"
```

---

## Task 5: Institutes list page + create/edit modal + nav

**Files:**
- Create: `client/src/types/institutes.ts`, `client/src/pages/Institutes/index.tsx`, `InstitutesToolbar.tsx`, `InstitutesTable.tsx`, `BulkBar.tsx`, `InstituteModal.tsx`, `hooks/useInstitutes.ts`, `hooks/useInstituteMutations.ts`
- Modify: `client/src/App.tsx` (`/institutes` route), `client/src/components/Sidebar.tsx` (Institutes → `/institutes`)
- Test: `client/src/test/InstitutesTable.test.tsx`

**Interfaces:** `useInstitutes(params)` → `GET /api/institutes`; `useInstituteMutations()` (create/update/bulk, invalidate `['institutes']`). `types/institutes.ts` mirrors the server DTOs (`InstituteListItem`, `InstituteListResponse` incl. `overview`, `InstituteInput`).

- [ ] **Step 1: Create `client/src/types/institutes.ts`**

```ts
export interface Funnel {
  uploaded: number; signupPct: number; completionPct: number;
  matchReadyPct: number; shortlistPct: number; offerPct: number; joinedPct: number;
}
export interface InstituteListItem extends Funnel {
  id: string; name: string; city: string; type: string;
  status: 'Active' | 'Pending' | 'Disabled'; owner: string; email: string;
}
export interface Overview { total: number; pending: number; uploaded: number; avgMatchReadyPct: number; }
export interface InstituteListResponse { items: InstituteListItem[]; total: number; page: number; limit: number; overview: Overview; }
export interface InstituteListParams {
  q?: string; type?: string; status?: string; sort?: string; order?: 'asc' | 'desc'; page?: number; limit?: number;
}
export interface InstituteInput {
  name: string; type: string; city: string; owner: string; email: string; status?: string;
}
export interface OwnershipEntry { owner: string; email: string; changedAt: string; changedBy: string; }
export interface InstituteDetailResponse {
  institute: { _id: string; name: string; city: string; type: string; status: string; owner: string; email: string; ownershipHistory: OwnershipEntry[]; createdAt: string };
  funnel: Funnel;
  kpis: { uploaded: number; matchReadyPct: number; shortlistPct: number; joinedPct: number };
  performance: { matchReadyPct: number; joinedPct: number; avgMatchReadyPct: number; rank: number | null; ofActive: number };
}
export interface CandidateRow { id: string; name: string; branch: string; gradYear: number; cgpa: number; source: string; stage: string; profileCompleted: boolean; }
export interface AuditRow { action: string; actor: string; detail: string; at: string; }
export interface Paged<T> { items: T[]; total: number; page: number; limit: number; }
```

- [ ] **Step 2: Create `hooks/useInstitutes.ts` and `hooks/useInstituteMutations.ts`**

```ts
// useInstitutes.ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { InstituteListParams, InstituteListResponse } from '../../../types/institutes.js';

export function useInstitutes(params: InstituteListParams) {
  const { token } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ['institutes', params],
    queryFn: () => apiFetch<InstituteListResponse>(`/institutes${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token,
  });
}
```
```ts
// useInstituteMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { InstituteInput } from '../../../types/institutes.js';

export function useInstituteMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['institutes'] });
  const create = useMutation({ mutationFn: (b: InstituteInput) => apiFetch('/institutes', { method: 'POST', body: b, token }), onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<InstituteInput> }) => apiFetch(`/institutes/${id}`, { method: 'PATCH', body, token }), onSuccess: invalidate });
  const bulk = useMutation({ mutationFn: (b: { ids: string[]; action: 'approve' | 'disable' }) => apiFetch('/institutes/bulk', { method: 'POST', body: b, token }), onSuccess: invalidate });
  return { create, update, bulk };
}
```

- [ ] **Step 3: Build the list page + toolbar + table + bulk bar + modal**

Port the Institute Management markup from `matchday-admin-app_23.html` lines 1507–1584 using real classes: the overview `.kpis`/`.kpi` (`iTotal`/`iPending`/`iUploaded`/`iAvgMr`), `.dm-toolbar`/`.dm-search`/`.select`, `.bulkbar`/`.bb` (Approve/Assign Drives (disabled → "coming soon")/Disable/Clear), `table.dm` with sortable funnel columns + `.cb` checkboxes + `.badge-st`/`.st-active/.st-pending/.st-archived` status (verify class for Disabled), per-row action menu (View / Edit / Approve / Disable), `.dm-pager`, and the create/edit modal (`.modal-scrim`/`.modal`/`.modal-h`/`.modal-b`/`.fld`/`.modal-f`).

- `index.tsx` — `AppShell` (crumb "Supply", title "Institute Management"); render overview KPIs from `data.overview`; toolbar + BulkBar + table + pager. State: `params`, `selectedIds`, `modal` (`{mode:'create'} | {mode:'edit', institute} | null`). Row "View" (or row click) → `navigate('/institutes/:id')`. Create/Edit → `InstituteModal`. Approve/Disable (row + bulk) → `useInstituteMutations()`. "Assign Drives" bulk button present but disabled with a "coming soon" title. CSV export from `data.items`.
- `InstituteModal.tsx` — form (name/type/city/owner/email/status) in the modal; create → `create.mutateAsync`, edit → `update.mutateAsync({id, body})`; close on success; surface validation errors (the server 400 `validation`).
- `InstitutesTable.tsx` — presentational, explicit props; sortable headers, checkboxes, `.badge-st` status, funnel columns as `NN%`, action menu. Status badge class map: Active→`st-active`, Pending→`st-pending`, Disabled→`st-archived` (verify in theme.css).

- [ ] **Step 4: Wire route + nav**

`App.tsx`: `import { InstitutesPage } from './pages/Institutes/index.js';` and `<Route path="/institutes" element={<ProtectedRoute><InstitutesPage /></ProtectedRoute>} />`. `Sidebar.tsx`: Institutes `to` → `/institutes`.

- [ ] **Step 5: Write `client/src/test/InstitutesTable.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstitutesTable } from '../pages/Institutes/InstitutesTable.js';
import type { InstituteListItem } from '../types/institutes.js';

const items: InstituteListItem[] = [
  { id: '1', name: 'CBIT', city: 'Hyderabad', type: 'Engineering College', status: 'Active', owner: 'Sharath P.', email: 'spoc@cbit.edu', uploaded: 96, signupPct: 80, completionPct: 75, matchReadyPct: 60, shortlistPct: 40, offerPct: 20, joinedPct: 10 },
];

describe('InstitutesTable', () => {
  it('renders an institute row with name, status and a funnel %', () => {
    render(<InstitutesTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={vi.fn()} />);
    expect(screen.getByText('CBIT')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit -p client/tsconfig.json` → 0. `npm run test -w client` → all pass, pristine. `npm run build -w client` → success.
```bash
git add client/src/types/institutes.ts client/src/pages/Institutes client/src/App.tsx client/src/components/Sidebar.tsx client/src/test/InstitutesTable.test.tsx
git commit -m "feat(client): institutes list page with overview KPIs, filters, bulk, create/edit modal"
```

---

## Task 6: Institute detail page + payload-driven tabs

**Files:**
- Create: `client/src/pages/Institutes/hooks/useInstitute.ts`, `client/src/pages/Institutes/detail/InstituteDetail.tsx`, `TabOverview.tsx`, `TabFunnel.tsx`, `TabPerformance.tsx`, `TabOwnership.tsx`, `TabDrivesComingSoon.tsx`
- Modify: `client/src/App.tsx` (`/institutes/:id` route)
- Test: `client/src/test/InstituteDetail.test.tsx`

**Interfaces:** `useInstitute(id)` → `GET /api/institutes/:id` (`InstituteDetailResponse`). `InstituteDetail` renders the header + KPI row + tabbar; tabs Overview/Funnel/Performance/Ownership render from the detail payload; Drives tab = coming-soon; Candidates/Audit tabs are added in Task 7 (until then their buttons render a small "loading in next task" placeholder OR are wired to the Task 7 components if built — for THIS task, render a placeholder for Candidates/Audit panes with a `// TODO(Task 7)` and keep the tab buttons).

- [ ] **Step 1: Create `hooks/useInstitute.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { InstituteDetailResponse } from '../../../types/institutes.js';

export function useInstitute(id: string | undefined) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['institute', id],
    queryFn: () => apiFetch<InstituteDetailResponse>(`/institutes/${id}`, { token }),
    enabled: !!token && !!id,
  });
}
```

- [ ] **Step 2: Build `InstituteDetail.tsx` + the payload tabs**

Port the Institute Details markup from `matchday-admin-app_23.html` lines 1587–1630 using real classes: `.backlink`, `.idhead`/`.biglogo`/`.idmeta` (h2 + `.badge-st` + `.subrow`)/`.idactions`, the KPI row `.kpis`, `.tabbar` buttons + `.tabpane`. `InstituteDetail` reads `:id` (`useParams`), `useInstitute(id)`, holds `activeTab` state, renders the active pane. Header actions: Edit (navigates back to list modal OR opens an inline edit — simplest: link back to `/institutes` for now, or reuse the modal; keep minimal), Assign Drives + Upload = disabled "coming soon". Logo initials from the name.

Tabs (from the detail payload):
- `TabOverview` — summary + the funnel snapshot (reuse a small funnel bar list like the Command Center's, bound to `funnel`).
- `TabFunnel` — the funnel steps (uploaded → signup → completion → match-ready → shortlist → offer → joined) as a `.funnel`/`.fstep`/`.ftrack` list bound to `funnel` percentages.
- `TabPerformance` — `performance`: this institute's match-ready% and joined% vs `avgMatchReadyPct`, plus rank (`#rank of ofActive`).
- `TabOwnership` — a table/timeline of `institute.ownershipHistory` (owner, email, changedAt, changedBy).
- `TabDrivesComingSoon` — a `.card` with a "This tab is coming soon — institute↔drive assignment is not in this build yet." message.
- Candidates + Audit panes: render `<div>…</div>` placeholders with a `// TODO(Task 7): render TabCandidates/TabAudit` comment; keep the tab buttons so the bar is complete.

- [ ] **Step 3: Wire the route**

`App.tsx`: `import { InstituteDetail } from './pages/Institutes/detail/InstituteDetail.js';` and `<Route path="/institutes/:id" element={<ProtectedRoute><InstituteDetail /></ProtectedRoute>} />`.

- [ ] **Step 4: Write `client/src/test/InstituteDetail.test.tsx`**

Mock `fetch` to return a detail payload; render `InstituteDetail` inside `MemoryRouter` at `/institutes/abc` with a route; assert the name renders, the Overview pane shows a funnel %, and clicking the "Drives" tab shows the coming-soon text. (Provide the router with `initialEntries={['/institutes/abc']}` and a `<Routes>` mapping `/institutes/:id`.)

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit -p client/tsconfig.json` → 0. `npm run test -w client` → all pass, pristine. `npm run build -w client` → success.
```bash
git add client/src/pages/Institutes/hooks/useInstitute.ts client/src/pages/Institutes/detail client/src/App.tsx client/src/test/InstituteDetail.test.tsx
git commit -m "feat(client): institute detail page with overview/funnel/performance/ownership tabs + coming-soon drives"
```

---

## Task 7: Candidates + Audit tabs (paginated)

**Files:**
- Create: `client/src/pages/Institutes/hooks/useInstituteCandidates.ts`, `useInstituteAudit.ts`, `client/src/pages/Institutes/detail/TabCandidates.tsx`, `TabAudit.tsx`
- Modify: `client/src/pages/Institutes/detail/InstituteDetail.tsx` (render the real Candidates/Audit panes)
- Test: `client/src/test/TabCandidates.test.tsx`

**Interfaces:** `useInstituteCandidates(id, page, limit)` → `GET /api/institutes/:id/candidates`; `useInstituteAudit(id, page, limit)` → `GET /api/institutes/:id/audit`. Both return `Paged<T>`.

- [ ] **Step 1: Create the two hooks**

```ts
// useInstituteCandidates.ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { CandidateRow, Paged } from '../../../types/institutes.js';

export function useInstituteCandidates(id: string, page: number, limit = 10) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['institute-candidates', id, page, limit],
    queryFn: () => apiFetch<Paged<CandidateRow>>(`/institutes/${id}/candidates?page=${page}&limit=${limit}`, { token }),
    enabled: !!token && !!id,
  });
}
```
```ts
// useInstituteAudit.ts — same shape, path `/institutes/${id}/audit`, key ['institute-audit', id, page, limit], type Paged<AuditRow>
```

- [ ] **Step 2: Build `TabCandidates.tsx` and `TabAudit.tsx`**

- `TabCandidates` — takes `instituteId`; holds `page` state; `useInstituteCandidates`; renders a `.dm`/`.lb` table (Name, Branch, Grad Year, CGPA, Source, Stage, Profile) with a simple pager (prev/next + "X–Y of total"); loading/empty states.
- `TabAudit` — takes `instituteId`; `useInstituteAudit`; renders a timeline/table (Action, Detail, Actor, When — format `at` via `new Date(at).toLocaleString()`) with a pager.

- [ ] **Step 3: Render the real panes in `InstituteDetail.tsx`**

Replace the Task 6 Candidates/Audit placeholder panes with `<TabCandidates instituteId={id} />` and `<TabAudit instituteId={id} />`.

- [ ] **Step 4: Write `client/src/test/TabCandidates.test.tsx`**

Mock `fetch` to return one candidate page; render `TabCandidates` (wrapped in QueryClientProvider + AuthProvider); assert a candidate row renders (name + stage) and the pager shows the total. Ensure output is pristine.

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit -p client/tsconfig.json` → 0. `npm run test -w client` → all pass, pristine. `npm run build -w client` → success.
```bash
git add client/src/pages/Institutes/hooks/useInstituteCandidates.ts client/src/pages/Institutes/hooks/useInstituteAudit.ts client/src/pages/Institutes/detail/TabCandidates.tsx client/src/pages/Institutes/detail/TabAudit.tsx client/src/pages/Institutes/detail/InstituteDetail.tsx client/src/test/TabCandidates.test.tsx
git commit -m "feat(client): institute detail candidates and audit-log tabs (paginated)"
```

---

## Task 8: End-to-end verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full suite** — `npm test` → server + client all green, pristine.
- [ ] **Step 2: Type-check both** — `npx tsc --noEmit -p server/tsconfig.json` and `-p client/tsconfig.json` → 0. `npm run build -w client` → success.
- [ ] **Step 3: Re-seed + API smoke** (mongod running): `npm run seed`, start the server, and with a login token exercise: `GET /api/institutes` (items + overview KPIs), `POST /api/institutes` (201, status Pending), `PATCH /api/institutes/:id` (approve → Active), `POST /api/institutes/bulk` (approve/disable), `GET /api/institutes/:id` (funnel + performance), `GET /api/institutes/:id/candidates`, `GET /api/institutes/:id/audit`, and confirm the Command Center still returns readiness 82 / matchReady 531 (institute schema change is additive).
- [ ] **Step 4: Manual smoke** — `npm run dev`, log in, open `/institutes`: KPIs + list render; filter/sort/paginate; create an institute (modal); approve/disable a row + bulk; open a detail page; switch tabs (Overview/Candidates/Funnel/Performance/Ownership/Audit render; Drives shows coming-soon).
- [ ] **Step 5: Update `README.md`** — add an "Institutes" line under Modules.
- [ ] **Step 6: Commit** — `docs: note Institutes module and verify end-to-end`.

---

## Self-Review Notes (author checklist — resolved)

- **Spec coverage:** Institute schema + AuditLog (T1) · list funnel/overview + detail + create/update(ownership+audit) + bulk + candidates/audit (T2) · protected routes incl. reject `assign` (T3) · seed institutes+audit (T4) · list UI + overview KPIs + modal + bulk + nav (T5) · detail shell + Overview/Funnel/Performance/Ownership tabs + Drives coming-soon (T6) · Candidates + Audit paginated tabs (T7) · E2E + Command Center re-verify (T8). ✔
- **Green at each step:** Institute change is additive/lenient (no `timestamps`, `type` stays String) so the Command Center dashboard tests keep passing; each server task ends green; client tasks build on the list.
- **Type consistency:** `InstituteListItem`/`Funnel`/`Overview`/`InstituteDetailResponse`/`Paged<T>` shapes match across server service and client `types/institutes.ts`; hooks call the exact route contracts.
- **Placeholder scan:** UI ports reference exact prototype line ranges; the only interim stub is the Candidates/Audit panes in T6, explicitly replaced in T7 (and the deliberate Drives-tab "coming soon"). All authored logic (schema, service, aggregation, routes, seed, hooks) is complete code. ✔
- **Scale note:** `listInstitutes` computes funnels in JS over all institutes (≈21) then sorts/paginates — fine at this scale; a single aggregation would be needed at much larger scale (logged as a future optimization, not silently assumed).
