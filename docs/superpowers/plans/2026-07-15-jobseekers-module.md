# Jobseekers Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Jobseekers module — a candidate list with 7 view lenses + add/edit + Block, and a 5-step CSV/XLSX bulk-import wizard (dedupe + validate + commit) — on the existing MatchDay MERN app.

**Architecture:** Add `email` + `consent` to `Jobseeker` additively (keeping `stage`/`profileCompleted`/`evaluationStatus` as the funnel source of truth); derive offer/match%/eval-label/dup-risk. Add an `/api/jobseekers` module (list with derived-field-filter translation, add/edit, block, and import `preview`/`commit`). Add `/jobseekers` React page (list + add/edit modal + full-screen 5-step import wizard with client-side SheetJS parsing).

**Tech Stack:** Same as prior slices; adds `xlsx` (SheetJS) as a client dependency for CSV/XLSX parsing.

## Global Constraints

- **Language:** TypeScript strict; ESM `.js` import extensions in `.ts`/`.tsx`.
- **Spec is authoritative:** `docs/superpowers/specs/2026-07-15-jobseekers-module-design.md`.
- **Error shape:** `{ error: { message, code } }` via existing `errorHandler`/`HttpError`.
- **Auth:** all `/api/jobseekers/*` behind `requireAuth`. Actor = `"Platform Admin"`.
- **Do NOT switch `Jobseeker` to `{ timestamps: true }`** — keep its explicit `createdAt`, because the Command Center dashboard tests seed jobseekers with explicit `createdAt` for the 30-day window. Add `email`/`consent` as optional-with-defaults so existing fixtures (which create jobseekers without them) keep passing. Do NOT change `stage`/`evaluationStatus`/`profileCompleted`.
- **Derived, never stored:** offerStatus, matchReadinessPct, evaluationLabel, dupRisk (see the mappings in Task 2). Only `email` + `consent` are new stored fields.
- **Import validation/dedup is ONE source of truth** (`jobseekers.import.ts`) used by BOTH preview and commit; commit re-runs it server-side (never trusts the client).
- **Type-check gate:** after each change, `npx tsc --noEmit -p server/tsconfig.json` and/or `client/tsconfig.json` → 0 errors.
- **Faithful UI port:** real prototype classes; grep `theme.css` to confirm.
- **Commit trailer:** end every commit body with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
server/src/
  models/Jobseeker.ts                        # + email, consent (T1)
  modules/jobseekers/
    jobseekers.schemas.ts jobseekers.import.ts jobseekers.service.ts
    jobseekers.controller.ts jobseekers.routes.ts   # (T2/T3/T4)
  app.ts                                     # mount /api/jobseekers (T4)
  seed/seed.ts                               # + email/consent on jobseekers (T5)
server/test/
  jobseekers.service.test.ts                 # (T2)
  jobseekers.import.test.ts                  # (T3)
  jobseekers.route.test.ts                   # (T4)
client/src/
  types/jobseekers.ts                        # (T6)
  pages/Jobseekers/
    index.tsx JobseekersToolbar.tsx ViewPills.tsx JobseekersTable.tsx BulkBar.tsx JobseekerModal.tsx  # (T6)
    hooks/useJobseekers.ts useJobseekerMutations.ts                                                     # (T6)
    upload/UploadWizard.tsx parse.ts template.ts                                                        # (T7)
    upload/hooks/useImportPreview.ts useImportCommit.ts                                                 # (T7)
    upload/StepUpload.tsx StepDuplicates.tsx StepValidation.tsx StepSummary.tsx StepCompletion.tsx      # (T8)
  App.tsx                                    # /jobseekers route (T6)
  components/Sidebar.tsx                     # Jobseekers → /jobseekers (T6)
client/package.json                          # + xlsx (T7)
client/src/test/
  JobseekersTable.test.tsx                   # (T6)
  UploadWizard.test.tsx                      # (T8)
```

---

## Task 1: Jobseeker schema (additive: email + consent)

**Files:**
- Modify: `server/src/models/Jobseeker.ts`
- Test: `server/test/models.test.ts` (append)

**Interfaces:** `Jobseeker` gains `email: string` (default '') and `consent: 'Granted'|'Pending'|'Revoked'` (default 'Granted'). Everything else unchanged; keep explicit `createdAt`, no `timestamps`.

- [ ] **Step 1: Add the two fields to `server/src/models/Jobseeker.ts`**

In the schema definition, add after `source`:
```ts
  email: { type: String, default: '' },
  consent: { type: String, enum: ['Granted', 'Pending', 'Revoked'], default: 'Granted' },
```
(Leave `profileCompleted`, `evaluationStatus`, `stage`, `createdAt`, and `JOBSEEKER_STAGES`/`JobseekerStage` exports exactly as they are.)

- [ ] **Step 2: Append tests to `server/test/models.test.ts`**

```ts
  it('persists a jobseeker with email and consent, defaulting consent to Granted', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College' });
    const withEmail = await Jobseeker.create({ name: 'A', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', email: 'a@cbit.edu' });
    expect(withEmail.email).toBe('a@cbit.edu');
    expect(withEmail.consent).toBe('Granted');
    const noEmail = await Jobseeker.create({ name: 'B', instituteId: inst._id, branch: 'IT', gradYear: 2026, cgpa: 7, source: 'Campus' });
    expect(noEmail.email).toBe('');
    expect(noEmail.consent).toBe('Granted');
  });

  it('rejects an invalid consent value', async () => {
    const inst = await Institute.create({ name: 'X', city: 'Y', type: 'Bootcamp' });
    await expect(
      Jobseeker.create({ name: 'C', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', consent: 'Maybe' as never }),
    ).rejects.toThrow();
  });
```
(Ensure `Institute` + `Jobseeker` are imported at the top of the file.)

- [ ] **Step 3: Type-check + tests + commit**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0. `npm run test -w server` → all pass (existing + 2 new).
```bash
git add server/src/models/Jobseeker.ts server/test/models.test.ts
git commit -m "feat(server): add email and consent to Jobseeker (additive)"
```

---

## Task 2: Jobseekers zod + service (list/add/get/update/block)

**Files:**
- Create: `server/src/modules/jobseekers/jobseekers.schemas.ts`, `jobseekers.service.ts`
- Test: `server/test/jobseekers.service.test.ts`

**Interfaces:**
- `jobseekers.schemas.ts`: `createJobseekerSchema`, `updateJobseekerSchema = createJobseekerSchema.partial()`, `listQuerySchema`, `bulkSchema` (`action: 'block'`).
- `jobseekers.service.ts`:
  - derived helpers `offerStatus(stage)`, `matchReadinessPct(stage)`, `evaluationLabel(evalStatus)`, `codeFor(id)`.
  - `listJobseekers(params): Promise<{ items: JobseekerListItem[]; total; page; limit }>`
  - `addJobseeker(input): Promise<JobseekerDoc>`
  - `getJobseeker(id): Promise<JobseekerDoc>` (404)
  - `updateJobseeker(id, patch): Promise<JobseekerDoc>` (404)
  - `blockJobseekers(ids): Promise<{ affected }>` (sets consent Revoked)
  - exported `JobseekerListItem`, `ListParams`.

- [ ] **Step 1: Create `server/src/modules/jobseekers/jobseekers.schemas.ts`**

```ts
import { z } from 'zod';

export const createJobseekerSchema = z.object({
  name: z.string().trim().min(1),
  instituteId: z.string().min(1),
  branch: z.string().min(1),
  gradYear: z.coerce.number().int().min(2020).max(2030),
  cgpa: z.coerce.number().min(0).max(10),
  source: z.string().optional(),
  email: z.string().email().or(z.literal('')).optional(),
  consent: z.enum(['Granted', 'Pending', 'Revoked']).optional(),
  stage: z.enum(['Applied', 'Screened', 'Evaluated', 'MatchReady', 'Shortlisted', 'Offer', 'Joined', 'DroppedOff']).optional(),
  evaluationStatus: z.enum(['na', 'pending', 'completed']).optional(),
  profileCompleted: z.boolean().optional(),
});
export const updateJobseekerSchema = createJobseekerSchema.partial();

export const listQuerySchema = z.object({
  q: z.string().optional(),
  instituteId: z.string().optional(),
  stream: z.string().optional(),                 // = branch
  evaluationStatus: z.enum(['na', 'pending', 'completed']).optional(),
  offer: z.enum(['None', 'Shortlisted', 'Offer sent', 'Joined', 'Rejected']).optional(),
  consent: z.enum(['Granted', 'Pending', 'Revoked']).optional(),
  matchBucket: z.enum(['high', 'mid', 'low']).optional(),
  sort: z.enum(['name', 'institute', 'matchReady']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export const bulkSchema = z.object({ ids: z.array(z.string()).min(1), action: z.enum(['block']) });

export type CreateJobseekerInput = z.infer<typeof createJobseekerSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
```

- [ ] **Step 2: Write the failing test `server/test/jobseekers.service.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import {
  listJobseekers, addJobseeker, getJobseeker, updateJobseeker, blockJobseekers,
} from '../src/modules/jobseekers/jobseekers.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

let instId: string;
async function seed() {
  const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College', status: 'Active' });
  instId = String(inst._id);
  const mk = (over: Record<string, unknown>) => Jobseeker.create({
    name: 'JS', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus',
    profileCompleted: true, evaluationStatus: 'completed', ...over,
  });
  await mk({ name: 'Aarav', stage: 'MatchReady', email: 'dup@x.edu', consent: 'Granted' });
  await mk({ name: 'Diya', stage: 'Shortlisted', email: 'dup@x.edu', consent: 'Granted' });  // shares email → dup risk
  await mk({ name: 'Vihaan', stage: 'Offer', email: 'v@x.edu', consent: 'Pending' });
  await mk({ name: 'Ananya', stage: 'Joined', email: 'a@x.edu', consent: 'Granted' });
  await mk({ name: 'Rohan', stage: 'Applied', email: 'r@x.edu', evaluationStatus: 'na', profileCompleted: false });
  await mk({ name: 'Meera', stage: 'DroppedOff', email: 'm@x.edu' });
}

describe('jobseekers.service', () => {
  it('lists with derived display fields and code', async () => {
    await seed();
    const res = await listJobseekers({ sort: 'name', order: 'asc' });
    expect(res.total).toBe(6);
    const aarav = res.items.find((x) => x.name === 'Aarav')!;
    expect(aarav.offerStatus).toBe('None');          // MatchReady → None
    expect(aarav.matchReadinessPct).toBe(75);        // MatchReady → 75
    expect(aarav.evaluationLabel).toBe('Completed');
    expect(aarav.instituteName).toBe('CBIT');
    expect(aarav.code).toMatch(/^C-[0-9A-F]{6}$/);
    expect(aarav.dupRisk).toBe('High');              // shares dup@x.edu with Diya
    const rohan = res.items.find((x) => x.name === 'Rohan')!;
    expect(rohan.dupRisk).toBe('Low');
    expect(rohan.evaluationLabel).toBe('Not started');
    expect(res.items.find((x) => x.name === 'Vihaan')!.offerStatus).toBe('Offer sent');
    expect(res.items.find((x) => x.name === 'Meera')!.offerStatus).toBe('Rejected');
  });

  it('filters by offer status (derived → stage)', async () => {
    await seed();
    expect((await listJobseekers({ offer: 'Joined' })).total).toBe(1);           // Ananya
    expect((await listJobseekers({ offer: 'None' })).total).toBe(2);             // MatchReady(Aarav) + Applied(Rohan)
    expect((await listJobseekers({ offer: 'Rejected' })).total).toBe(1);         // Meera
  });

  it('filters by matchBucket, consent, and institute', async () => {
    await seed();
    expect((await listJobseekers({ matchBucket: 'high' })).total).toBe(4);       // MatchReady/Shortlisted/Offer/Joined
    expect((await listJobseekers({ matchBucket: 'low' })).total).toBe(2);        // Applied + DroppedOff
    expect((await listJobseekers({ consent: 'Pending' })).total).toBe(1);        // Vihaan
    expect((await listJobseekers({ instituteId: instId })).total).toBe(6);
  });

  it('sorts by matchReady descending (stage ordinal)', async () => {
    await seed();
    const res = await listJobseekers({ sort: 'matchReady', order: 'desc' });
    expect(res.items[0].name).toBe('Ananya');   // Joined = 100
  });

  it('adds a jobseeker with Applied defaults', async () => {
    await seed();
    const js = await addJobseeker({ name: 'New', instituteId: instId, branch: 'IT', gradYear: 2026, cgpa: 7 });
    expect(js.stage).toBe('Applied');
    expect(js.consent).toBe('Granted');
  });

  it('updates, blocks (consent → Revoked), and 404s', async () => {
    await seed();
    const one = await Jobseeker.findOne({ name: 'Aarav' });
    const upd = await updateJobseeker(String(one!._id), { branch: 'ECE' });
    expect(upd.branch).toBe('ECE');
    const two = await Jobseeker.find({}).limit(2);
    const res = await blockJobseekers(two.map((j) => String(j._id)));
    expect(res.affected).toBe(2);
    expect(await Jobseeker.countDocuments({ consent: 'Revoked' })).toBe(2);
    await expect(getJobseeker('64b000000000000000000000')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run to confirm RED**

Run: `npm run test -w server -- jobseekers.service` → FAIL (module not found).

- [ ] **Step 4: Implement `server/src/modules/jobseekers/jobseekers.service.ts`**

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import type { CreateJobseekerInput, ListQuery } from './jobseekers.schemas.js';

export type ListParams = Partial<ListQuery>;

const MR_ORDINAL: Record<string, number> = {
  Applied: 10, Screened: 30, Evaluated: 55, MatchReady: 75, Shortlisted: 85, Offer: 92, Joined: 100, DroppedOff: 0,
};
export function matchReadinessPct(stage: string): number { return MR_ORDINAL[stage] ?? 0; }
export function offerStatus(stage: string): string {
  return stage === 'Shortlisted' ? 'Shortlisted' : stage === 'Offer' ? 'Offer sent'
    : stage === 'Joined' ? 'Joined' : stage === 'DroppedOff' ? 'Rejected' : 'None';
}
export function evaluationLabel(s: string): string {
  return s === 'completed' ? 'Completed' : s === 'pending' ? 'In progress' : 'Not started';
}
export function codeFor(id: unknown): string { return `C-${String(id).slice(-6).toUpperCase()}`; }

export interface JobseekerListItem {
  id: string; code: string; name: string; email: string;
  instituteId: string; instituteName: string; stream: string;
  evaluationLabel: string; matchReadinessPct: number; offerStatus: string;
  dupRisk: 'High' | 'Low'; consent: string; stage: string;
}

function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Jobseeker not found', 'not_found');
}

const OFFER_TO_STAGE: Record<string, string[]> = {
  Shortlisted: ['Shortlisted'], 'Offer sent': ['Offer'], Joined: ['Joined'], Rejected: ['DroppedOff'],
  None: ['Applied', 'Screened', 'Evaluated', 'MatchReady'],
};
const BUCKET_TO_STAGE: Record<string, string[]> = {
  high: ['MatchReady', 'Shortlisted', 'Offer', 'Joined'], mid: ['Screened', 'Evaluated'], low: ['Applied', 'DroppedOff'],
};

export async function listJobseekers(params: ListParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const match: Record<string, unknown> = {};
  if (params.q) match.name = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (params.instituteId && Types.ObjectId.isValid(params.instituteId)) match.instituteId = new Types.ObjectId(params.instituteId);
  if (params.stream) match.branch = params.stream;
  if (params.evaluationStatus) match.evaluationStatus = params.evaluationStatus;
  if (params.consent) match.consent = params.consent;
  const stageSets: string[][] = [];
  if (params.offer) stageSets.push(OFFER_TO_STAGE[params.offer] ?? []);
  if (params.matchBucket) stageSets.push(BUCKET_TO_STAGE[params.matchBucket] ?? []);
  if (stageSets.length === 1) match.stage = { $in: stageSets[0] };
  else if (stageSets.length > 1) {
    // intersection of the two stage sets
    const inter = stageSets[0].filter((s) => stageSets[1].includes(s));
    match.stage = { $in: inter };
  }

  // duplicate-email set (emails appearing more than once, non-empty)
  const dupAgg = await Jobseeker.aggregate<{ _id: string }>([
    { $match: { email: { $ne: '' } } },
    { $group: { _id: { $toLower: '$email' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  const dupEmails = new Set(dupAgg.map((d) => d._id));

  const sortField = params.sort === 'institute' ? 'inst.name' : params.sort === 'matchReady' ? '_mr' : 'name';
  const sortDir = (params.order ?? 'asc') === 'desc' ? -1 : 1;

  const facet = await Jobseeker.aggregate([
    { $match: match },
    { $addFields: { _mr: { $switch: {
      branches: Object.entries(MR_ORDINAL).map(([stage, v]) => ({ case: { $eq: ['$stage', stage] }, then: v })),
      default: 0,
    } } } },
    { $lookup: { from: 'institutes', localField: 'instituteId', foreignField: '_id', as: 'inst' } },
    { $unwind: { path: '$inst', preserveNullAndEmptyArrays: true } },
    { $sort: { [sortField]: sortDir, _id: 1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
  ]);
  const rows = facet[0]?.items ?? [];
  const total = facet[0]?.total?.[0]?.n ?? 0;
  const items: JobseekerListItem[] = rows.map((d: Record<string, any>) => ({
    id: String(d._id), code: codeFor(d._id), name: d.name, email: d.email ?? '',
    instituteId: String(d.instituteId), instituteName: d.inst?.name ?? '—', stream: d.branch,
    evaluationLabel: evaluationLabel(d.evaluationStatus), matchReadinessPct: matchReadinessPct(d.stage),
    offerStatus: offerStatus(d.stage),
    dupRisk: d.email && dupEmails.has(String(d.email).toLowerCase()) ? 'High' : 'Low',
    consent: d.consent ?? 'Granted', stage: d.stage,
  }));
  return { items, total, page, limit };
}

export async function addJobseeker(input: CreateJobseekerInput) {
  return Jobseeker.create({
    ...input, instituteId: new Types.ObjectId(input.instituteId),
    stage: input.stage ?? 'Applied', evaluationStatus: input.evaluationStatus ?? 'na',
    consent: input.consent ?? 'Granted', source: input.source ?? 'Manual',
  });
}
export async function getJobseeker(id: string) {
  assertId(id);
  const j = await Jobseeker.findById(id);
  if (!j) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  return j;
}
export async function updateJobseeker(id: string, patch: Partial<CreateJobseekerInput>) {
  assertId(id);
  const doc: Record<string, unknown> = { ...patch };
  if (patch.instituteId) doc.instituteId = new Types.ObjectId(patch.instituteId);
  const j = await Jobseeker.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!j) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  return j;
}
export async function blockJobseekers(ids: string[]) {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id));
  const res = await Jobseeker.updateMany({ _id: { $in: valid } }, { $set: { consent: 'Revoked' } });
  return { affected: res.modifiedCount };
}
```

- [ ] **Step 5: Run to confirm GREEN**

Run: `npm run test -w server -- jobseekers.service` → PASS. Fix the service (not assertions) if any value differs.

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0.
```bash
git add server/src/modules/jobseekers/jobseekers.schemas.ts server/src/modules/jobseekers/jobseekers.service.ts server/test/jobseekers.service.test.ts
git commit -m "feat(server): jobseekers service (list w/ derived fields + filters, add/get/update/block)"
```

---

## Task 3: Import logic (validation + dedup) + preview/commit

**Files:**
- Create: `server/src/modules/jobseekers/jobseekers.import.ts`
- Test: `server/test/jobseekers.import.test.ts`

**Interfaces:**
- `jobseekers.import.ts`:
  - `RawRow = { name?; email?; institute?; branch?; gradYear?; cgpa?; source? }`
  - `previewImport(rows: RawRow[]): Promise<{ rows: RowResult[]; summary: Summary }>` — resolves institutes by name, validates, detects duplicates (within-batch + vs existing).
  - `commitImport(rows: RawRow[]): Promise<{ imported; skipped; skippedReasons: { duplicates; invalid } }>` — re-runs preview, inserts `valid && !dupe` with defaults.
  - types `RowResult`, `Summary`.

- [ ] **Step 1: Write the failing test `server/test/jobseekers.import.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { previewImport, commitImport } from '../src/modules/jobseekers/jobseekers.import.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function seedInstitute() {
  await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College', status: 'Active' });
}
const goodRow = (over = {}) => ({ name: 'Aarav Sharma', email: 'aarav@cbit.edu', institute: 'CBIT', branch: 'CSE', gradYear: '2026', cgpa: '8.4', ...over });

describe('jobseekers import', () => {
  it('flags validation errors (missing field, bad email, cgpa range, unknown institute, bad year)', async () => {
    await seedInstitute();
    const rows = [
      goodRow(),
      goodRow({ name: '', email: 'x@x.edu' }),          // missing name
      goodRow({ email: 'not-an-email' }),                // bad email
      goodRow({ email: 'b@cbit.edu', cgpa: '11' }),      // cgpa out of range
      goodRow({ email: 'c@cbit.edu', institute: 'Nowhere U' }), // unknown institute
      goodRow({ email: 'd@cbit.edu', gradYear: '1999' }),// bad year
    ];
    const { rows: r, summary } = await previewImport(rows);
    expect(r[0].valid).toBe(true);
    expect(r[1].valid).toBe(false); expect(r[1].errors.join()).toMatch(/name/i);
    expect(r[2].valid).toBe(false); expect(r[2].errors.join()).toMatch(/email/i);
    expect(r[3].valid).toBe(false); expect(r[3].errors.join()).toMatch(/cgpa/i);
    expect(r[4].valid).toBe(false); expect(r[4].errors.join()).toMatch(/institute/i);
    expect(r[5].valid).toBe(false); expect(r[5].errors.join()).toMatch(/year/i);
    expect(summary.total).toBe(6);
    expect(summary.invalid).toBe(5);
    expect(summary.valid).toBe(1);
  });

  it('detects within-batch and existing duplicates', async () => {
    await seedInstitute();
    const inst = await Institute.findOne({ name: 'CBIT' });
    await Jobseeker.create({ name: 'Existing One', instituteId: inst!._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Seed', email: 'exists@cbit.edu' });
    const rows = [
      goodRow({ email: 'new@cbit.edu' }),                       // ok
      goodRow({ email: 'new@cbit.edu', name: 'Different' }),    // within-batch dup email
      goodRow({ email: 'exists@cbit.edu', name: 'Someone' }),   // dup vs existing (email)
    ];
    const { rows: r, summary } = await previewImport(rows);
    expect(r[0].dupe).toBe(false);
    expect(r[1].dupe).toBe(true); expect(r[1].dupeReason).toMatch(/within/i);
    expect(r[2].dupe).toBe(true); expect(r[2].dupeReason).toMatch(/exist/i);
    expect(summary.duplicates).toBe(2);
    expect(summary.willImport).toBe(1);
  });

  it('commits only valid non-duplicate rows with defaults', async () => {
    await seedInstitute();
    const rows = [
      goodRow({ email: 'p@cbit.edu' }),
      goodRow({ email: 'p@cbit.edu', name: 'Dup' }),   // within-batch dup
      goodRow({ email: 'bad', name: 'Invalid' }),      // invalid
    ];
    const res = await commitImport(rows);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(2);
    expect(res.skippedReasons).toEqual({ duplicates: 1, invalid: 1 });
    const inserted = await Jobseeker.findOne({ email: 'p@cbit.edu' });
    expect(inserted!.stage).toBe('Applied');
    expect(inserted!.evaluationStatus).toBe('na');
    expect(inserted!.source).toBe('Bulk import');
    expect(inserted!.profileCompleted).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm RED**

Run: `npm run test -w server -- jobseekers.import` → FAIL (module not found).

- [ ] **Step 3: Implement `server/src/modules/jobseekers/jobseekers.import.ts`**

```ts
import { Types } from 'mongoose';
import { Institute } from '../../models/Institute.js';
import { Jobseeker } from '../../models/Jobseeker.js';

export interface RawRow { name?: string; email?: string; institute?: string; branch?: string; gradYear?: string | number; cgpa?: string | number; source?: string; }
export interface RowResult {
  index: number;
  data: { name: string; email: string; instituteId: string | null; instituteName: string | null; branch: string; gradYear: number | null; cgpa: number | null; source: string };
  valid: boolean; errors: string[]; dupe: boolean; dupeReason?: string;
}
export interface Summary { total: number; valid: number; invalid: number; duplicates: number; willImport: number; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown) => (v == null ? '' : String(v).trim());

async function analyze(rows: RawRow[]): Promise<RowResult[]> {
  const institutes = await Institute.find({}).select('name').lean();
  const instByName = new Map(institutes.map((i) => [String(i.name).toLowerCase(), i]));

  const existing = await Jobseeker.find({}).select('name email instituteId').lean();
  const existEmails = new Set(existing.filter((e) => e.email).map((e) => String(e.email).toLowerCase()));
  const existNameInst = new Set(existing.map((e) => `${String(e.name).toLowerCase()}|${String(e.instituteId)}`));

  const seenEmails = new Set<string>();
  const seenNameInst = new Set<string>();

  return rows.map((row, index) => {
    const name = clean(row.name);
    const email = clean(row.email).toLowerCase();
    const instName = clean(row.institute);
    const branch = clean(row.branch) || 'CSE';
    const errors: string[] = [];
    if (!name) errors.push('Name is required');
    if (!email) errors.push('Email is required');
    else if (!EMAIL_RE.test(email)) errors.push('Invalid email format');
    const inst = instName ? instByName.get(instName.toLowerCase()) : undefined;
    if (!instName) errors.push('Institute is required');
    else if (!inst) errors.push('Unknown institute');
    let gradYear: number | null = null;
    if (row.gradYear != null && clean(row.gradYear) !== '') {
      const y = Number(row.gradYear);
      if (!Number.isInteger(y) || y < 2020 || y > 2030) errors.push('Graduation year must be 2020–2030');
      else gradYear = y;
    }
    let cgpa: number | null = null;
    if (row.cgpa != null && clean(row.cgpa) !== '') {
      const c = Number(row.cgpa);
      if (Number.isNaN(c) || c < 0 || c > 10) errors.push('CGPA must be 0–10');
      else cgpa = c;
    }
    const valid = errors.length === 0;
    let dupe = false; let dupeReason: string | undefined;
    const instId = inst ? String(inst._id) : null;
    if (valid && instId) {
      const nameKey = `${name.toLowerCase()}|${instId}`;
      if (seenEmails.has(email)) { dupe = true; dupeReason = 'Duplicate email within file'; }
      else if (seenNameInst.has(nameKey)) { dupe = true; dupeReason = 'Duplicate name+institute within file'; }
      else if (existEmails.has(email)) { dupe = true; dupeReason = 'Email already exists'; }
      else if (existNameInst.has(nameKey)) { dupe = true; dupeReason = 'Candidate already exists'; }
      seenEmails.add(email); seenNameInst.add(nameKey);
    }
    return {
      index,
      data: { name, email, instituteId: instId, instituteName: inst ? String(inst.name) : null, branch, gradYear, cgpa, source: clean(row.source) || 'Bulk import' },
      valid, errors, dupe, dupeReason,
    };
  });
}

function summarize(rows: RowResult[]): Summary {
  const valid = rows.filter((r) => r.valid).length;
  const duplicates = rows.filter((r) => r.valid && r.dupe).length;
  return { total: rows.length, valid, invalid: rows.length - valid, duplicates, willImport: rows.filter((r) => r.valid && !r.dupe).length };
}

export async function previewImport(rows: RawRow[]) {
  const analyzed = await analyze(rows);
  return { rows: analyzed, summary: summarize(analyzed) };
}

export async function commitImport(rows: RawRow[]) {
  const analyzed = await analyze(rows);
  const toInsert = analyzed.filter((r) => r.valid && !r.dupe);
  if (toInsert.length) {
    await Jobseeker.insertMany(toInsert.map((r) => ({
      name: r.data.name, email: r.data.email, instituteId: new Types.ObjectId(r.data.instituteId as string),
      branch: r.data.branch, gradYear: r.data.gradYear ?? 2026, cgpa: r.data.cgpa ?? 0, source: 'Bulk import',
      stage: 'Applied', evaluationStatus: 'na', profileCompleted: false, consent: 'Granted',
    })));
  }
  const invalid = analyzed.filter((r) => !r.valid).length;
  const duplicates = analyzed.filter((r) => r.valid && r.dupe).length;
  return { imported: toInsert.length, skipped: invalid + duplicates, skippedReasons: { duplicates, invalid } };
}
```

- [ ] **Step 4: Run to confirm GREEN + type-check**

Run: `npm run test -w server -- jobseekers.import` → PASS. `npx tsc --noEmit -p server/tsconfig.json` → 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/jobseekers/jobseekers.import.ts server/test/jobseekers.import.test.ts
git commit -m "feat(server): jobseeker import preview/commit (validation + dedup, single source of truth)"
```

---

## Task 4: Jobseekers routes + controller (protected)

**Files:**
- Create: `server/src/modules/jobseekers/jobseekers.controller.ts`, `jobseekers.routes.ts`
- Modify: `server/src/app.ts` (mount)
- Test: `server/test/jobseekers.route.test.ts`

**Interfaces:** `jobseekerRoutes` (all behind `requireAuth`): `GET /`, `POST /`, `POST /bulk`, `POST /import/preview`, `POST /import/commit`, `GET /:id`, `PATCH /:id`. Route order: `/bulk`, `/import/preview`, `/import/commit` BEFORE `/:id`.

- [ ] **Step 1: Create `server/src/modules/jobseekers/jobseekers.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { createJobseekerSchema, updateJobseekerSchema, listQuerySchema, bulkSchema } from './jobseekers.schemas.js';
import { listJobseekers, addJobseeker, getJobseeker, updateJobseeker, blockJobseekers } from './jobseekers.service.js';
import { previewImport, commitImport } from './jobseekers.import.js';

const rowsSchema = z.object({ rows: z.array(z.record(z.unknown())).max(5000) });

export async function listController(req: Request, res: Response) {
  res.json(await listJobseekers(listQuerySchema.parse(req.query)));
}
export async function createController(req: Request, res: Response) {
  res.status(201).json(await addJobseeker(createJobseekerSchema.parse(req.body)));
}
export async function getController(req: Request, res: Response) {
  res.json(await getJobseeker(req.params.id));
}
export async function patchController(req: Request, res: Response) {
  res.json(await updateJobseeker(req.params.id, updateJobseekerSchema.parse(req.body)));
}
export async function bulkController(req: Request, res: Response) {
  const { ids } = bulkSchema.parse(req.body);
  res.json(await blockJobseekers(ids));
}
export async function previewController(req: Request, res: Response) {
  const { rows } = rowsSchema.parse(req.body);
  res.json(await previewImport(rows as never));
}
export async function commitController(req: Request, res: Response) {
  const { rows } = rowsSchema.parse(req.body);
  res.json(await commitImport(rows as never));
}
```

- [ ] **Step 2: Create `server/src/modules/jobseekers/jobseekers.routes.ts`**

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  listController, createController, getController, patchController, bulkController, previewController, commitController,
} from './jobseekers.controller.js';

export const jobseekerRoutes = Router();
jobseekerRoutes.use(requireAuth);
jobseekerRoutes.get('/', asyncHandler(listController));
jobseekerRoutes.post('/', asyncHandler(createController));
jobseekerRoutes.post('/bulk', asyncHandler(bulkController));
jobseekerRoutes.post('/import/preview', asyncHandler(previewController));
jobseekerRoutes.post('/import/commit', asyncHandler(commitController));
jobseekerRoutes.get('/:id', asyncHandler(getController));
jobseekerRoutes.patch('/:id', asyncHandler(patchController));
```

- [ ] **Step 3: Mount in `server/src/app.ts`**

```ts
import { jobseekerRoutes } from './modules/jobseekers/jobseekers.routes.js';
```
```ts
  app.use('/api/jobseekers', jobseekerRoutes);
```
(errorHandler stays last; no duplicate mounts.)

- [ ] **Step 4: Write `server/test/jobseekers.route.test.ts`**

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);

describe('jobseekers routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/jobseekers')).status).toBe(401);
  });
  it('adds then lists a jobseeker with derived fields', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College' });
    const c = await auth(request(createApp()).post('/api/jobseekers').send({ name: 'Aarav', instituteId: String(inst._id), branch: 'CSE', gradYear: 2026, cgpa: 8 }));
    expect(c.status).toBe(201);
    const list = await auth(request(createApp()).get('/api/jobseekers'));
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].offerStatus).toBe('None');
    expect(list.body.items[0].code).toMatch(/^C-/);
  });
  it('import preview then commit', async () => {
    await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College' });
    const rows = [
      { name: 'A One', email: 'a1@cbit.edu', institute: 'CBIT', branch: 'CSE', gradYear: '2026', cgpa: '8' },
      { name: 'A One', email: 'a1@cbit.edu', institute: 'CBIT' },   // dup email in-batch
      { name: 'Bad', email: 'nope', institute: 'CBIT' },            // invalid
    ];
    const prev = await auth(request(createApp()).post('/api/jobseekers/import/preview').send({ rows }));
    expect(prev.body.summary).toMatchObject({ total: 3, willImport: 1, duplicates: 1, invalid: 1 });
    const commit = await auth(request(createApp()).post('/api/jobseekers/import/commit').send({ rows }));
    expect(commit.body).toMatchObject({ imported: 1, skipped: 2 });
    const list = await auth(request(createApp()).get('/api/jobseekers'));
    expect(list.body.total).toBe(1);
  });
  it('blocks (consent → Revoked) and 404s on unknown id', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyd', type: 'Bootcamp' });
    const c = await auth(request(createApp()).post('/api/jobseekers').send({ name: 'X', instituteId: String(inst._id), branch: 'CSE', gradYear: 2026, cgpa: 7 }));
    const b = await auth(request(createApp()).post('/api/jobseekers/bulk').send({ ids: [c.body._id], action: 'block' }));
    expect(b.body.affected).toBe(1);
    const miss = await auth(request(createApp()).get('/api/jobseekers/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run + type-check**

Run: `npm run test -w server -- jobseekers.route` → PASS. `npx tsc --noEmit -p server/tsconfig.json` → 0. `npm run test -w server` → all pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/jobseekers/jobseekers.controller.ts server/src/modules/jobseekers/jobseekers.routes.ts server/src/app.ts server/test/jobseekers.route.test.ts
git commit -m "feat(server): protected /api/jobseekers routes (list/add/get/patch/bulk/import)"
```

---

## Task 5: Seed email + consent on jobseekers

**Files:**
- Modify: `server/src/seed/seed.ts`

- [ ] **Step 1: Add email + consent to seeded jobseekers**

In the jobseeker-building loop (the `stageBuckets` loop that pushes into `jobseekerDocs`), add `email` and `consent` to each pushed object. Add a consent picker helper near the top of `run()`:
```ts
    const consentPick = () => { const r = rng(); return r < 0.85 ? 'Granted' : r < 0.95 ? 'Pending' : 'Revoked'; };
```
Then in the pushed jobseeker object add:
```ts
        email: `${pick(rng, FIRST)}.${pick(rng, LAST)}${intBetween(rng, 1, 999)}@${(inst.name as string).toLowerCase().replace(/[^a-z]+/g, '').slice(0, 10) || 'inst'}.edu`.toLowerCase(),
        consent: consentPick(),
```
(`inst` is the institute chosen for that jobseeker in the loop; it's already in scope. Keep everything else — name/stage/etc. — unchanged.)

- [ ] **Step 2: Type-check + run seed + tests**

Run: `npx tsc --noEmit -p server/tsconfig.json` → 0. `npm run seed` (mongod running) → "Seed complete." `npm run test -w server` → all pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/seed/seed.ts
git commit -m "feat(server): seed jobseeker email + consent"
```

---

## Task 6: Jobseekers list page + add/edit modal + nav

**Files:**
- Create: `client/src/types/jobseekers.ts`, `client/src/pages/Jobseekers/index.tsx`, `JobseekersToolbar.tsx`, `ViewPills.tsx`, `JobseekersTable.tsx`, `BulkBar.tsx`, `JobseekerModal.tsx`, `hooks/useJobseekers.ts`, `hooks/useJobseekerMutations.ts`
- Modify: `client/src/App.tsx`, `client/src/components/Sidebar.tsx`
- Test: `client/src/test/JobseekersTable.test.tsx`

**Interfaces:** `useJobseekers(params)` → `GET /api/jobseekers`; `useJobseekerMutations()` (add/update/block, invalidate `['jobseekers']`). `types/jobseekers.ts` mirrors the server DTOs.

- [ ] **Step 1: Create `client/src/types/jobseekers.ts`**

```ts
export interface JobseekerListItem {
  id: string; code: string; name: string; email: string;
  instituteId: string; instituteName: string; stream: string;
  evaluationLabel: string; matchReadinessPct: number; offerStatus: string;
  dupRisk: 'High' | 'Low'; consent: 'Granted' | 'Pending' | 'Revoked'; stage: string;
}
export interface JobseekerListResponse { items: JobseekerListItem[]; total: number; page: number; limit: number; }
export interface JobseekerListParams {
  q?: string; instituteId?: string; stream?: string; evaluationStatus?: string;
  offer?: string; consent?: string; matchBucket?: string;
  sort?: string; order?: 'asc' | 'desc'; page?: number; limit?: number;
}
export interface JobseekerInput {
  name: string; instituteId: string; branch: string; gradYear: number; cgpa: number;
  email?: string; consent?: string; stage?: string; evaluationStatus?: string; source?: string;
}
```

- [ ] **Step 2: Create the two hooks**

```ts
// useJobseekers.ts — mirror useInstitutes: queryKey ['jobseekers', params], GET `/jobseekers?<qs>`, enabled on token.
// useJobseekerMutations.ts — add (POST /jobseekers), update (PATCH /jobseekers/:id), block (POST /jobseekers/bulk {ids, action:'block'}); all invalidate ['jobseekers'].
```
(Model these on `client/src/pages/Institutes/hooks/useInstitutes.ts` + `useInstituteMutations.ts` exactly — same shape, different path/key/types.)

- [ ] **Step 3: Build the list page + view pills + toolbar + table + bulk bar + modal**

Port the Jobseeker Management markup from `matchday-admin-app_23.html` lines 1633–1708 with real classes: `.viewpills` + buttons (`ViewPills`), `.dm-toolbar`/`.dm-search`, `.bulkbar`/`.bb` (Block + Clear; deferred bulk buttons omitted), `table.dm` (columns Candidate/Institute/Stream/Evaluation/Match/Offer/Dup Risk/Consent/Actions, `.cb` checkboxes, per-row menu View/Edit/Block), `.dm-pager` (rows 10/20/50), and the add/edit modal (`.modal-scrim`/`.modal`/`.fld`). GREP theme.css to confirm classes. Status/consent/offer badges reuse `.badge-st`/pill classes (verify names).

- `index.tsx` — `AppShell` (crumb "Supply", title "Jobseeker Management"); state `view` + `params` + `selectedIds` + `modal`. The `ViewPills` set which contextual filter is active: All→none; By Institute→`instituteId` (dropdown of institutes — fetch via `useInstitutes` or a lightweight call, OR a text/select); By Stream→`stream` (branch options CSE/IT/ECE/EEE/MECH); By Evaluation→`evaluationStatus` (na/pending/completed shown as labels); By Match Readiness→`matchBucket` (high/mid/low); By Offer Status→`offer` (None/Shortlisted/Offer sent/Joined/Rejected); By Consent→`consent`. Changing a view clears other view-filters. `useJobseekers(params)` drives the table. Add → modal; row Edit → modal (prefilled from the row; institute options from institutes). Block (row + bulk) → `useJobseekerMutations().block`. Bulk Upload → open the wizard (Task 7 — for THIS task wire a `// TODO(Task 7)` stub state `uploadOpen`/`setUploadOpen` and a disabled-ish "Bulk Upload" that flips it; the wizard component lands in Task 7). CSV export from `data.items`.
- `JobseekerModal.tsx` — fields: Full name, Institute (select — needs institute options; fetch a simple institutes list), Stream (branch select), Evaluation status (Not started/In progress/Completed → na/pending/completed), Offer status (None/Shortlisted/Offer sent/Joined/Rejected → sets `stage`), Consent (Granted/Pending/Revoked), Email. **Match-readiness % shown read-only** (derive from the chosen offer/stage via the same ordinal map). On save: add → `add.mutateAsync`, edit → `update.mutateAsync({id, body})`; map offer→stage and eval-label→enum before sending. Close on success; surface validation errors.
- `JobseekersTable.tsx` — presentational, explicit props (test-friendly); renders derived columns; dup-risk badge (High=warn); consent badge; offer/eval pills.

For the institute select options in the modal + the "By Institute" view filter, fetch institutes with a minimal query (reuse `useInstitutes({ limit: 100 })` from the Institutes module and map `items` → `{id, name}`).

- [ ] **Step 4: Wire route + nav**

`App.tsx`: `<Route path="/jobseekers" element={<ProtectedRoute><JobseekersPage /></ProtectedRoute>} />`. `Sidebar.tsx`: Jobseekers `to` → `/jobseekers`.

- [ ] **Step 5: Write `client/src/test/JobseekersTable.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JobseekersTable } from '../pages/Jobseekers/JobseekersTable.js';
import type { JobseekerListItem } from '../types/jobseekers.js';

const items: JobseekerListItem[] = [
  { id: '1', code: 'C-ABC123', name: 'Aarav Sharma', email: 'a@cbit.edu', instituteId: 'i1', instituteName: 'CBIT', stream: 'CSE', evaluationLabel: 'Completed', matchReadinessPct: 75, offerStatus: 'None', dupRisk: 'Low', consent: 'Granted', stage: 'MatchReady' },
];

describe('JobseekersTable', () => {
  it('renders a candidate row with derived fields', () => {
    render(<JobseekersTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={vi.fn()} />);
    expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    expect(screen.getByText('CBIT')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit -p client/tsconfig.json` → 0. `npm run test -w client` → all pass, pristine. `npm run build -w client` → success.
```bash
git add client/src/types/jobseekers.ts client/src/pages/Jobseekers client/src/App.tsx client/src/components/Sidebar.tsx client/src/test/JobseekersTable.test.tsx
git commit -m "feat(client): jobseekers list page with view lenses, filters, block, add/edit modal"
```

---

## Task 7: Upload wizard shell + parse + hooks + open-wiring

**Files:**
- Create: `client/src/pages/Jobseekers/upload/UploadWizard.tsx`, `parse.ts`, `template.ts`, `hooks/useImportPreview.ts`, `hooks/useImportCommit.ts`
- Modify: `client/src/pages/Jobseekers/index.tsx` (open the wizard), `client/package.json` (+ `xlsx`)
- Test: (covered in Task 8)

**Interfaces:**
- `parse.ts`: `parseFile(file: File): Promise<RawRow[]>` — uses `xlsx` (SheetJS) to read CSV/XLSX → array of `{name,email,institute,branch,gradYear,cgpa,source}` (header row mapped case-insensitively). `parseCsvText(text): RawRow[]` for the sample/tests.
- `template.ts`: `CSV_TEMPLATE` string (header + one example row) and `SAMPLE_ROWS: RawRow[]`.
- `useImportPreview()` / `useImportCommit()`: mutations to `/jobseekers/import/preview` and `/import/commit`; commit invalidates `['jobseekers']`.
- `UploadWizard.tsx`: `<UploadWizard onClose={() => void} />` — full-screen overlay; steps 0–4; holds `rows`, `preview`, `commit`.

- [ ] **Step 1: Install SheetJS**

Run: `npm install xlsx -w client`
(Then confirm `client/package.json` lists `xlsx` under dependencies.)

- [ ] **Step 2: Create `parse.ts`**

```ts
import * as XLSX from 'xlsx';
import type { RawRow } from './template.js';

const FIELD_MAP: Record<string, keyof RawRow> = {
  name: 'name', 'full name': 'name', email: 'email', 'email address': 'email',
  institute: 'institute', college: 'institute', branch: 'branch', stream: 'branch',
  gradyear: 'gradYear', 'graduation year': 'gradYear', 'grad year': 'gradYear',
  cgpa: 'cgpa', gpa: 'cgpa', source: 'source',
};
function mapRow(obj: Record<string, unknown>): RawRow {
  const out: RawRow = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = FIELD_MAP[k.trim().toLowerCase()];
    if (key) out[key] = v == null ? '' : String(v).trim();
  }
  return out;
}
export async function parseFile(file: File): Promise<RawRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return json.map(mapRow);
}
export function parseCsvText(text: string): RawRow[] {
  const wb = XLSX.read(text, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }).map(mapRow);
}
```

- [ ] **Step 3: Create `template.ts`**

```ts
export interface RawRow { name?: string; email?: string; institute?: string; branch?: string; gradYear?: string; cgpa?: string; source?: string; }
export const CSV_TEMPLATE = 'name,email,institute,branch,gradYear,cgpa,source\nAarav Sharma,aarav@cbit.edu,CBIT,CSE,2026,8.4,Campus\n';
export const SAMPLE_ROWS: RawRow[] = [
  { name: 'Aarav Sharma', email: 'aarav@cbit.edu', institute: 'CBIT', branch: 'CSE', gradYear: '2026', cgpa: '8.4', source: 'Campus' },
  { name: 'Diya Reddy', email: 'diya@cbit.edu', institute: 'CBIT', branch: 'IT', gradYear: '2026', cgpa: '9.1', source: 'Campus' },
  { name: 'Aarav Sharma', email: 'aarav@cbit.edu', institute: 'CBIT', branch: 'CSE', gradYear: '2026', cgpa: '8.4', source: 'Campus' }, // dup
];
```

- [ ] **Step 4: Create the two mutation hooks**

```ts
// useImportPreview.ts — useMutation, mutationFn: (rows) => apiFetch('/jobseekers/import/preview', {method:'POST', body:{rows}, token})
// useImportCommit.ts  — useMutation, mutationFn: (rows) => apiFetch('/jobseekers/import/commit', {method:'POST', body:{rows}, token}); onSuccess invalidate ['jobseekers']
```
(Return the full `{rows, summary}` / `{imported, skipped, skippedReasons}` payloads; type them per the spec.)

- [ ] **Step 5: Build `UploadWizard.tsx` shell (steps render placeholders until Task 8)**

Port the `#upWizard` chrome from `matchday-admin-app_23.html` lines 2211–2252: `.wiz-top`/`.glyph`/`.x`, `.wiz-body`/`.wiz-rail` (5 `.st` steps CSV Upload/Duplicate Check/Validation/Import Summary/Completion Report), `.wiz-main`/`.wiz-progress`/`.pbar`, `.wiz-foot` (Back / step number / Continue). GREP theme.css. State: `step` (0–4), `rows: RawRow[]`, `preview` result, `commit` result. Nav: Continue on step 0 requires `rows.length>0`; entering step 1 runs `useImportPreview` (once); step 4's primary button runs `useImportCommit`; success stays on step 4 showing the report. `onClose` when finished. For THIS task, render a per-step PLACEHOLDER (`<div className="wstep active">Step N — {name}</div>`) with a `// TODO(Task 8): render real step component`, so the shell compiles and nav/preview/commit are exercisable. Do NOT build the step UIs here (Task 8).

- [ ] **Step 6: Open the wizard from the list**

In `client/src/pages/Jobseekers/index.tsx`, replace the Task 6 `// TODO(Task 7)` stub: "Bulk Upload" sets `uploadOpen=true`; render `<UploadWizard onClose={() => setUploadOpen(false)} />` when open.

- [ ] **Step 7: Type-check + build + commit**

Run: `npx tsc --noEmit -p client/tsconfig.json` → 0. `npm run test -w client` → existing pass. `npm run build -w client` → success (xlsx bundles).
```bash
git add client/src/pages/Jobseekers/upload client/src/pages/Jobseekers/index.tsx client/package.json client/package-lock.json
git commit -m "feat(client): bulk upload wizard shell + client-side CSV/XLSX parse (SheetJS)"
```

---

## Task 8: Upload wizard step components + flow test

**Files:**
- Create: `client/src/pages/Jobseekers/upload/StepUpload.tsx`, `StepDuplicates.tsx`, `StepValidation.tsx`, `StepSummary.tsx`, `StepCompletion.tsx`
- Modify: `client/src/pages/Jobseekers/upload/UploadWizard.tsx` (render real steps)
- Test: `client/src/test/UploadWizard.test.tsx`

**Interfaces:** each step gets the wizard state slice it needs via props (`rows`, `preview`, `commit`, and callbacks like `onFile`, `onRemoveRow`).

- [ ] **Step 1: Build the five step components (port markup)**

Port from `matchday-admin-app_23.html` lines 2232–2243 + the runtime render helpers:
- `StepUpload` — `.dropzone` (click + drag/drop → `parseFile` → set `rows`), a file chip showing name + row count, `.up-note` with "Download CSV template" (downloads `CSV_TEMPLATE` as a Blob) and "use a sample dataset" (`SAMPLE_ROWS` → set `rows`).
- `StepDuplicates` — table of `preview.rows.filter(r => r.dupe)` (name/email/reason) with a Remove action (drops the row from `rows` and re-previews); empty state "No duplicates found".
- `StepValidation` — table of `preview.rows.filter(r => !r.valid)` (row #, field errors); empty state "All rows valid".
- `StepSummary` — the `preview.summary` counts as stat tiles (total / duplicates excluded / invalid excluded / will import), using existing `.kpi`/stat classes.
- `StepCompletion` — after commit: imported/skipped counts + a "Download result log" (CSV of outcomes as a Blob); a Done button → `onClose`.

Bind everything to the wizard state; use real prototype classes (`.wstep`, `.wh`, `.dropzone`, `.up-note`, `.dm`/`.lb` tables, `.kpi`).

- [ ] **Step 2: Render the real steps in `UploadWizard.tsx`**

Replace the placeholder switch with the five components, passing state + callbacks. Wire: entering Duplicate Check (step 1) triggers preview if not already run; Import Summary uses `preview.summary`; Completion runs commit on entry (or via the footer's final "Import" button) and shows the result.

- [ ] **Step 3: Write `client/src/test/UploadWizard.test.tsx`**

Mock `fetch` for preview + commit. Render `UploadWizard` (QueryClientProvider + AuthProvider). Drive the flow: use the "sample dataset" link to set rows (avoids a real File), Continue → assert the duplicate step shows the seeded dup, Continue through validation + summary (assert `willImport` count), then Import → assert the completion shows imported/skipped from the mocked commit. Pristine output. (If simulating a File is needed, construct `new File([csvText], 'x.csv', {type:'text/csv'})` and call the drop handler; but the sample-dataset path is simpler and sufficient.)

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit -p client/tsconfig.json` → 0. `npm run test -w client` → all pass, pristine. `npm run build -w client` → success.
```bash
git add client/src/pages/Jobseekers/upload client/src/test/UploadWizard.test.tsx
git commit -m "feat(client): bulk upload wizard steps (upload/duplicates/validation/summary/completion)"
```

---

## Task 9: End-to-end verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full suite** — `npm test` → server + client all green, pristine.
- [ ] **Step 2: Type-check both** — `npx tsc --noEmit -p server/tsconfig.json` and `-p client/tsconfig.json` → 0. `npm run build -w client` → success.
- [ ] **Step 3: Re-seed + API smoke** (mongod running): `npm run seed`, start the server, and with a login token exercise: `GET /api/jobseekers` (items + derived fields + a view filter e.g. `?offer=Joined`), `POST /api/jobseekers` (add), `PATCH` (edit), `POST /api/jobseekers/bulk` (block), `POST /api/jobseekers/import/preview` + `/commit` with a small rows array (assert imported/skipped), and confirm the Command Center still returns readiness 82 / matchReady 531 (Jobseeker change is additive).
- [ ] **Step 4: Manual smoke** — `npm run dev`, log in, open `/jobseekers`: list + view pills + filters + pagination; add a candidate; edit; block; Bulk Upload → sample dataset → step through duplicates/validation/summary → Import → completion; the imported candidates appear in the list.
- [ ] **Step 5: Update `README.md`** — add a "Jobseekers" line under Modules.
- [ ] **Step 6: Commit** — `docs: note Jobseekers module and verify end-to-end`.

---

## Self-Review Notes (author checklist — resolved)

- **Spec coverage:** Jobseeker email/consent (T1) · list w/ derived fields + derived-filter translation + dupRisk + add/get/update/block (T2) · import preview/commit validation+dedup single source of truth (T3) · protected routes incl. import (T4) · seed email/consent (T5) · list UI + view lenses + modal + block + nav (T6) · upload wizard shell + SheetJS parse + preview/commit hooks (T7) · wizard steps + flow test (T8) · E2E + Command Center re-verify (T9). ✔
- **Green at each step:** Jobseeker change additive (email/consent optional, no timestamps, stage/eval untouched) → Command Center + Institutes tests stay green; each server task ends green; client tasks build on the list.
- **Type consistency:** `JobseekerListItem`/`JobseekerInput`/import `RowResult`/`Summary` shapes match across server service/import and client `types/jobseekers.ts` + upload types; hooks call the exact route contracts; derived maps (MR_ORDINAL/offer/eval) shared by list + modal read-only display.
- **Placeholder scan:** UI ports reference exact prototype line ranges; interim stubs are the list's Bulk-Upload opener (T6→T7) and the wizard step placeholders (T7→T8), each explicitly replaced. All authored logic (schema, service, import, routes, seed, hooks, parse) is complete code. ✔
- **Dependency note:** `xlsx` (SheetJS) added client-side for CSV/XLSX parsing (T7) — the standard parser; heavier bundle, acceptable for an admin tool.
