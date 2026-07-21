# Employer Portal — Slice 6: Shortlist Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-drive shortlist workspace: bulk shortlist/hold/reject over the redacted candidate pool, a derived decision summary, an informational deadline, and a redacted shortlist-pack CSV download.

**Architecture:** No new model — the workspace drives 5a's `Application.decision`. Two endpoints on the existing `/employer` gate: a `bulk-decision` write (upserts `decision` for a set of pool members) and a `shortlist/pack` read (JSON of Shortlisted candidates + note text + consentStatus, fully redacted). The client renders the CSV in-browser (matching the 5 existing exporters). The deadline is derived client-side from the drive's event date; nothing new is stored.

**Tech Stack:** Node/Express + Mongoose (ESM, NodeNext, `.js` import specifiers), Zod, Vitest + Supertest (server); React + React Query + React Router, Vitest + Testing Library (client).

## Global Constraints

- Base: this branch (`feat/employer-portal-slice6`) is **stacked on `feat/employer-portal-slice5b`**. Do not rebase onto `main`.
- **Bulk decision is non-null only** (`Shortlisted`/`Hold`/`Rejected`); clearing a decision stays the single-candidate 5a path. `employerId` from `req.userId` (JWT sub), never the body.
- **No enumeration oracle:** non-pool / unknown `jobseekerIds` in a bulk call are silently skipped and excluded from the returned `updated` count.
- **Pack is fully redacted:** never emit `name`/`email`/institute `name`/`city`. It carries `consentStatus` (derived via 5b's `consentBlock`) + note **text**, for `decision==='Shortlisted'` candidates still in the pool only.
- **Bulk upsert leaves `notes` and `consent` intact** (a later decision change never revokes consent — 5b invariant).
- **Deadline is informational only** — derived client-side from the drive's event date − 24h; no server write-lock.
- Counts stay over the full pool; search/evaluation/decision filtering is client-side.
- Error envelope `{ error: { message, code } }`. ESM: every relative import ends in `.js`.

## Prerequisites (one-time)

The worktree `~/code/matchday-employer6` has no dependencies yet. From the repo root once, before Task 1:

```bash
cd ~/code/matchday-employer6 && npm install
```

Verify: `npm test -w server -- --run test/app.test.ts` passes and `npm test -w server -- --run test/seeker-portal.route.test.ts` passes (confirms the mongodb-memory-server toolchain works).

## File Structure

**Server — create:**
- `server/src/modules/employerPortal/employerShortlist.schemas.ts` — `bulkDecisionSchema`.
- `server/src/modules/employerPortal/employerShortlist.service.ts` — `bulkDecision`, `shortlistPack` (+ `ShortlistPackItem`).
- `server/src/modules/employerPortal/employerShortlist.controller.ts` — the 2 controllers.
- `server/test/employer-shortlist.route.test.ts` — both endpoints.

**Server — modify:**
- `server/src/modules/employerPortal/employerCandidates.service.ts` — `export` the existing private `poolSeekers`.
- `server/src/modules/employerPortal/employerPortal.routes.ts` — 2 new routes.

**Client — create:**
- `client/src/pages/EmployerPortal/hooks/useEmployerShortlist.ts` — `useBulkDecision`, `fetchShortlistPack`.
- `client/src/pages/EmployerPortal/EmployerShortlist.tsx` — the workspace page.
- `client/src/test/EmployerShortlist.test.tsx` — its tests.

**Client — modify:**
- `client/src/types/employer.ts` — `ShortlistPackItem`, `ShortlistPack`.
- `client/src/pages/EmployerPortal/EmployerCandidates.tsx` — a "Shortlist workspace" CTA.
- `client/src/App.tsx` — the `/employer/drives/:id/shortlist` route.

---

## Task 1: Server — export `poolSeekers` + bulk-decision endpoint

**Files:**
- Modify: `server/src/modules/employerPortal/employerCandidates.service.ts`, `server/src/modules/employerPortal/employerPortal.routes.ts`
- Create: `server/src/modules/employerPortal/employerShortlist.schemas.ts`, `employerShortlist.service.ts`, `employerShortlist.controller.ts`, `server/test/employer-shortlist.route.test.ts`

**Interfaces:**
- Consumes: `poolSeekers(drive)` (newly exported), `candidateScore`, `cgpaBand` from `employerCandidates.service.js`; `hasApprovedRegistration` from `employerPortal.service.js`; `codeFor`/`evaluationLabel` from `jobseekers.service.js`; `consentBlock` from `constants/consent.js`.
- Produces: `bulkDecision(employerId, driveId, jobseekerIds: string[], decision: 'Shortlisted'|'Hold'|'Rejected') → { updated: number }`; route `POST /employer/drives/:id/candidates/bulk-decision`. (Task 2 adds `shortlistPack` + the pack route in the same files.)

- [ ] **Step 1: Export `poolSeekers`**

In `server/src/modules/employerPortal/employerCandidates.service.ts:59`, change the private helper to exported (one word):

```ts
export async function poolSeekers(drive: DriveLean): Promise<SeekerLean[]> {
```

(Nothing else changes; `listCandidates` still calls it locally.)

- [ ] **Step 2: Write the failing bulk-decision test**

Create `server/test/employer-shortlist.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { Application } from '../src/models/Application.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function institute() { return Institute.create({ name: 'Secret College', city: 'Hyderabad', type: 'Tier-1' }); }
async function drive(over: Record<string, unknown> = {}) {
  return Drive.create({
    name: 'D', domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
    eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' }, ...over,
  });
}
async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane', ...over });
}
function tokenFor(e: { _id: unknown }) { return signToken({ sub: String(e._id), role: 'employer' }); }
async function approve(e: { _id: unknown }, d: { _id: unknown }) {
  return RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: e._id, driveId: d._id, driveName: 'D', role: 'R', status: 'Approved', activity: [] });
}
async function seeker(instId: unknown, over: Record<string, unknown> = {}) {
  return Jobseeker.create({ name: 'Real Name', email: 'real@x.test', instituteId: instId, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', evaluationStatus: 'completed', stage: 'MatchReady', ...over });
}

describe('POST .../candidates/bulk-decision', () => {
  it('bulk-upserts a decision for pool members and returns updated count', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const a = await seeker(inst._id); const b = await seeker(inst._id, { email: 'b@x.test' });
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [String(a._id), String(b._id)], decision: 'Shortlisted' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(await Application.countDocuments({ employerId: emp._id, driveId: d._id, decision: 'Shortlisted' })).toBe(2);
  });

  it('skips non-pool / unknown ids (no oracle) and excludes them from the count', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const a = await seeker(inst._id);                                   // in pool
    const notReady = await seeker(inst._id, { email: 'n@x.test', stage: 'Applied' }); // not Match-Ready → not in pool
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send({ jobseekerIds: [String(a._id), String(notReady._id), String(new Types.ObjectId())], decision: 'Hold' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(await Application.countDocuments({ employerId: emp._id, driveId: d._id })).toBe(1);
  });

  it('preserves notes/consent on an existing row when bulk-changing its decision', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const a = await seeker(inst._id);
    const now = new Date();
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: a._id, decision: 'Shortlisted',
      notes: [{ text: 'keep', by: 'Jane', at: now }], consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [String(a._id)], decision: 'Rejected' });
    const app = await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: a._id }).lean();
    expect(app?.decision).toBe('Rejected');
    expect(app?.notes).toHaveLength(1);
    expect(app?.consent?.status).toBe('granted');
  });

  it('gated on an approved registration; 400 on bad body; 401/403', async () => {
    const emp = await employer(); const d = await drive(); const inst = await institute();
    const a = await seeker(inst._id);
    const app = createApp();
    // no registration → 400 registration_not_approved
    const noReg = await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [String(a._id)], decision: 'Shortlisted' });
    expect(noReg.status).toBe(400);
    expect(noReg.body.error.code).toBe('registration_not_approved');
    await approve(emp, d);
    // bad decision → 400 validation
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [String(a._id)], decision: 'Maybe' })).status).toBe(400);
    // empty ids → 400
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerIds: [], decision: 'Shortlisted' })).status).toBe(400);
    // 401 no token
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`).send({ jobseekerIds: [String(a._id)], decision: 'Shortlisted' })).status).toBe(401);
    // 403 admin token
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`).send({ jobseekerIds: [String(a._id)], decision: 'Shortlisted' })).status).toBe(403);
  });

  it('is employer-scoped: employer B\'s bulk does not touch employer A\'s rows', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const s = await seeker(inst._id);
    await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(a)}`).send({ jobseekerIds: [String(s._id)], decision: 'Shortlisted' });
    await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/bulk-decision`)
      .set('Authorization', `Bearer ${tokenFor(b)}`).send({ jobseekerIds: [String(s._id)], decision: 'Rejected' });
    expect((await Application.findOne({ employerId: a._id, driveId: d._id, jobseekerId: s._id }).lean())?.decision).toBe('Shortlisted');
    expect((await Application.findOne({ employerId: b._id, driveId: d._id, jobseekerId: s._id }).lean())?.decision).toBe('Rejected');
  });
});
```

- [ ] **Step 3: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-shortlist.route.test.ts`
Expected: FAIL — the route 404s (not mounted).

- [ ] **Step 4: Create the schema**

Create `server/src/modules/employerPortal/employerShortlist.schemas.ts`:

```ts
import { z } from 'zod';

export const bulkDecisionSchema = z.object({
  jobseekerIds: z.array(z.string()).min(1).max(500),
  decision: z.enum(['Shortlisted', 'Hold', 'Rejected']),
});
export type BulkDecisionPayload = z.infer<typeof bulkDecisionSchema>;
```

- [ ] **Step 5: Create the service (`bulkDecision` + the shared gate helper)**

Create `server/src/modules/employerPortal/employerShortlist.service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Application } from '../../models/Application.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { poolSeekers } from './employerCandidates.service.js';

interface DriveShape { _id: Types.ObjectId; name?: string; eligibility?: { branches?: string[]; gradYears?: number[]; sources?: string[] } }

async function gateAndDrive(employerId: string, driveId: string): Promise<DriveShape> {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean<DriveShape>();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  return drive;
}

export async function bulkDecision(employerId: string, driveId: string, jobseekerIds: string[], decision: 'Shortlisted' | 'Hold' | 'Rejected') {
  const drive = await gateAndDrive(employerId, driveId);
  const pool = await poolSeekers(drive);
  const requested = new Set(jobseekerIds);
  const valid = pool.filter((s) => requested.has(String(s._id)));   // intersect with the pool; unknown/non-pool ids are silently skipped
  if (valid.length) {
    await Application.bulkWrite(valid.map((s) => ({
      updateOne: {
        filter: { employerId, driveId, jobseekerId: s._id },
        update: { $set: { decision }, $setOnInsert: { employerId, driveId, jobseekerId: s._id } },
        upsert: true,
      },
    })));
  }
  return { updated: valid.length };
}
```

- [ ] **Step 6: Create the controller + register the route**

Create `server/src/modules/employerPortal/employerShortlist.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { bulkDecisionSchema } from './employerShortlist.schemas.js';
import { bulkDecision } from './employerShortlist.service.js';

export async function bulkDecisionController(req: Request, res: Response) {
  const { jobseekerIds, decision } = bulkDecisionSchema.parse(req.body);
  res.json(await bulkDecision(req.userId as string, req.params.id, jobseekerIds, decision));
}
```

In `server/src/modules/employerPortal/employerPortal.routes.ts`, add the import (after the `employerConsent.controller` import):

```ts
import { bulkDecisionController } from './employerShortlist.controller.js';
```

And add this line after the reveal-request routes (after line 35, before the final `.get('/employer', ...)`):

```ts
employerPortalRoutes.post('/employer/drives/:id/candidates/bulk-decision', asyncHandler(bulkDecisionController));
```

(Safe next to `GET /candidates/:jobseekerId`: it is a POST with a single trailing segment and there is no `POST /candidates/:jobseekerId` route, so no shadowing.)

- [ ] **Step 7: Run tests + type-check**

Run: `npm test -w server -- --run test/employer-shortlist.route.test.ts && npx -w server tsc --noEmit`
Expected: all PASS; tsc `ok`.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/employerPortal/employerCandidates.service.ts server/src/modules/employerPortal/employerShortlist.schemas.ts server/src/modules/employerPortal/employerShortlist.service.ts server/src/modules/employerPortal/employerShortlist.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-shortlist.route.test.ts
git commit -m "feat(server): employer bulk-decision endpoint (pool-scoped, notes/consent preserved)"
```

---

## Task 2: Server — shortlist pack endpoint

**Files:**
- Modify: `server/src/modules/employerPortal/employerShortlist.service.ts`, `employerShortlist.controller.ts`, `employerPortal.routes.ts`, `server/test/employer-shortlist.route.test.ts` (append)

**Interfaces:**
- Consumes: `gateAndDrive`/`poolSeekers` (Task 1); `candidateScore`, `cgpaBand` from `employerCandidates.service.js`; `codeFor`, `evaluationLabel` from `jobseekers.service.js`; `consentBlock` from `constants/consent.js`.
- Produces: `shortlistPack(employerId, driveId) → { driveName, generatedAt, items: ShortlistPackItem[] }`; route `GET /employer/drives/:id/shortlist/pack`. `ShortlistPackItem = { code, matchScore, evalPill, branch, gradYear, cgpaBand, instituteCategory, stage, consentStatus, notes: string[] }`.

- [ ] **Step 1: Write the failing pack tests (append to `server/test/employer-shortlist.route.test.ts`)**

Append (helpers from Task 1 are in scope):

```ts
describe('GET .../shortlist/pack', () => {
  it('returns only Shortlisted pool candidates, fully redacted, with notes + consentStatus', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const a = await seeker(inst._id); const b = await seeker(inst._id, { email: 'b@x.test' }); const c = await seeker(inst._id, { email: 'c@x.test' });
    const now = new Date();
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: a._id, decision: 'Shortlisted',
      notes: [{ text: 'great SQL', by: 'Jane', at: now }], consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: b._id, decision: 'Shortlisted' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: c._id, decision: 'Rejected' }); // excluded
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/shortlist/pack`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body.driveName).toBe('D');
    expect(res.body.items).toHaveLength(2);                 // only the 2 Shortlisted
    const item = res.body.items.find((i: { notes: string[] }) => i.notes.length > 0);
    expect(item.code).toMatch(/^C-/);
    expect(item.consentStatus).toBe('granted');
    expect(item.notes).toEqual(['great SQL']);
    const other = res.body.items.find((i: { notes: string[] }) => i.notes.length === 0);
    expect(other.consentStatus).toBe('none');
    // fully redacted — no identity anywhere in the payload
    const raw = JSON.stringify(res.body);
    for (const pii of ['Real Name', 'real@x.test', 'b@x.test', 'Secret College', 'Hyderabad']) expect(raw).not.toContain(pii);
    res.body.items.forEach((i: Record<string, unknown>) => { expect(i).not.toHaveProperty('name'); expect(i).not.toHaveProperty('email'); });
  });

  it('derives expired consentStatus and returns [] when nothing is shortlisted; gated; 401/403', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const a = await seeker(inst._id);
    const past = new Date(Date.now() - 3600_000);
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: a._id, decision: 'Shortlisted',
      consent: { status: 'requested', requestedAt: past, expiresAt: past } });
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/shortlist/pack`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.body.items[0].consentStatus).toBe('expired');

    const d2 = await drive({ name: 'Empty' }); await approve(emp, d2);
    const empty = await request(createApp()).get(`/api/me/employer/drives/${d2._id}/shortlist/pack`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(empty.body.items).toEqual([]);

    const app = createApp();
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/shortlist/pack`)).status).toBe(401);
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/shortlist/pack`).set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`)).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-shortlist.route.test.ts`
Expected: the new `shortlist/pack` describe FAILS (route 404).

- [ ] **Step 3: Add `shortlistPack` to the service**

Append to `server/src/modules/employerPortal/employerShortlist.service.ts` (add the imports at the top alongside the existing ones):

```ts
import { Institute } from '../../models/Institute.js';
import { candidateScore, cgpaBand } from './employerCandidates.service.js';
import { codeFor, evaluationLabel } from '../jobseekers/jobseekers.service.js';
import { consentBlock } from '../../constants/consent.js';
```

(Merge these with the existing import block — `poolSeekers` is already imported from `employerCandidates.service.js`; add `candidateScore, cgpaBand` to that same import.)

Append the function + type:

```ts
export interface ShortlistPackItem {
  code: string; matchScore: number; evalPill: 'Strong' | 'Qualified';
  branch: string; gradYear: number; cgpaBand: string; instituteCategory: string; stage: string;
  consentStatus: 'requested' | 'granted' | 'declined' | 'expired' | 'none';
  notes: string[];
}

export async function shortlistPack(employerId: string, driveId: string) {
  const drive = await gateAndDrive(employerId, driveId);
  const pool = await poolSeekers(drive);
  const poolById = new Map(pool.map((s) => [String(s._id), s]));
  const apps = await Application.find({ employerId, driveId, decision: 'Shortlisted', jobseekerId: { $in: pool.map((s) => s._id) } }).lean();
  const instIds = [...new Set(apps.map((a) => poolById.get(String(a.jobseekerId))).filter(Boolean).map((s) => String(s!.instituteId)))];
  const insts = await Institute.find({ _id: { $in: instIds } }).select('type').lean<{ _id: Types.ObjectId; type?: string }[]>();
  const instType = new Map(insts.map((i) => [String(i._id), i.type ?? '—']));
  const items: ShortlistPackItem[] = apps.map((a) => {
    const s = poolById.get(String(a.jobseekerId))!;
    const { matchScore } = candidateScore(s.cgpa, s.evaluationStatus, s.stage);
    const cb = consentBlock(a.consent as Parameters<typeof consentBlock>[0]);
    const consentStatus = (cb ? (cb.expired ? 'expired' : cb.status) : 'none') as ShortlistPackItem['consentStatus'];
    return {
      code: codeFor(s._id), matchScore, evalPill: matchScore >= 80 ? 'Strong' : 'Qualified',
      branch: s.branch, gradYear: s.gradYear, cgpaBand: cgpaBand(s.cgpa),
      instituteCategory: instType.get(String(s.instituteId)) ?? '—', stage: s.stage,
      consentStatus, notes: ((a.notes ?? []) as { text: string }[]).map((n) => n.text),
    };
  }).sort((x, y) => y.matchScore - x.matchScore);
  return { driveName: drive.name ?? '—', generatedAt: new Date().toISOString(), items };
}
```

Note: `poolSeekers` returns seekers with `cgpa`/`evaluationStatus`/`stage`/`branch`/`gradYear`/`instituteId` selected (5a), so no identity is loaded. `evaluationLabel` is imported for parity with the codebase's projection imports but not needed here — if `tsc`/lint flags it as unused, drop it from the import.

- [ ] **Step 4: Add the controller + route**

In `employerShortlist.controller.ts`, extend the imports and add the controller:

```ts
import { bulkDecision, shortlistPack } from './employerShortlist.service.js';
```

```ts
export async function shortlistPackController(req: Request, res: Response) {
  res.json(await shortlistPack(req.userId as string, req.params.id));
}
```

In `employerPortal.routes.ts`, extend the import and add the route (after the bulk-decision route):

```ts
import { bulkDecisionController, shortlistPackController } from './employerShortlist.controller.js';
```

```ts
employerPortalRoutes.get('/employer/drives/:id/shortlist/pack', asyncHandler(shortlistPackController));
```

- [ ] **Step 5: Run the file + full server suite + type-check**

Run: `npm test -w server -- --run test/employer-shortlist.route.test.ts && npm test -w server && npx -w server tsc --noEmit`
Expected: the file PASSES; full suite all-green; tsc `ok`. Report counts.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/employerPortal/employerShortlist.service.ts server/src/modules/employerPortal/employerShortlist.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-shortlist.route.test.ts
git commit -m "feat(server): shortlist pack endpoint (redacted JSON: shortlisted + notes + consentStatus)"
```

---

## Task 3: Client — types + hooks + `EmployerShortlist` workspace + route + CTA

**Files:**
- Modify: `client/src/types/employer.ts`, `client/src/pages/EmployerPortal/EmployerCandidates.tsx`, `client/src/App.tsx`
- Create: `client/src/pages/EmployerPortal/hooks/useEmployerShortlist.ts`, `client/src/pages/EmployerPortal/EmployerShortlist.tsx`, `client/src/test/EmployerShortlist.test.tsx`

**Interfaces:**
- Consumes: `useEmployerCandidates(driveId, {})` + `useCandidateMutations(driveId)` (5a), `useEmployerDrive(driveId)` (5a); `apiFetch`/`useAuth`; server endpoints from Tasks 1–2.
- Produces: `useBulkDecision(driveId)` (`mutate({ jobseekerIds, decision })`), `fetchShortlistPack(driveId, token)`; `ShortlistPack`/`ShortlistPackItem` types; the `EmployerShortlist` page at `/employer/drives/:id/shortlist`.

- [ ] **Step 1: Add the types**

In `client/src/types/employer.ts`, append:

```ts
export interface ShortlistPackItem {
  code: string; matchScore: number; evalPill: 'Strong' | 'Qualified';
  branch: string; gradYear: number; cgpaBand: string; instituteCategory: string; stage: string;
  consentStatus: 'requested' | 'granted' | 'declined' | 'expired' | 'none';
  notes: string[];
}
export interface ShortlistPack { driveName: string; generatedAt: string; items: ShortlistPackItem[]; }
```

- [ ] **Step 2: Add the hooks**

Create `client/src/pages/EmployerPortal/hooks/useEmployerShortlist.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { ShortlistPack } from '../../../types/employer.js';

type BulkDecision = 'Shortlisted' | 'Hold' | 'Rejected';

// Bulk-writes 5a's decision for a set of jobseekers, then invalidates the candidates
// list + the employer-portal aggregate (same convention as useCandidateMutations).
export function useBulkDecision(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobseekerIds, decision }: { jobseekerIds: string[]; decision: BulkDecision }) =>
      apiFetch<{ updated: number }>(`/me/employer/drives/${driveId}/candidates/bulk-decision`, { method: 'POST', body: { jobseekerIds, decision }, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}

// One-shot fetch for the download handler (no query cache needed).
export function fetchShortlistPack(driveId: string, token: string | null) {
  return apiFetch<ShortlistPack>(`/me/employer/drives/${driveId}/shortlist/pack`, { token });
}
```

- [ ] **Step 3: Write the failing page test**

Create `client/src/test/EmployerShortlist.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerShortlist } from '../pages/EmployerPortal/EmployerShortlist.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const base = {
  branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1',
  evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady', evalPill: 'Strong',
  noteCount: 0, consent: null, revealed: null,
};
const C1 = { ...base, jobseekerId: 'j1', code: 'C-AAA111', matchScore: 90, decision: 'Shortlisted' };
const C2 = { ...base, jobseekerId: 'j2', code: 'C-BBB222', matchScore: 70, evalPill: 'Qualified', decision: null };

function mockFetch() {
  const bulk = vi.fn();
  const packFn = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.includes('/candidates/bulk-decision') && method === 'POST') { bulk(JSON.parse(opts.body as string)); return { ok: true, status: 200, json: async () => ({ updated: 1 }) }; }
    if (url.includes('/shortlist/pack')) { packFn(url); return { ok: true, status: 200, json: async () => ({ driveName: 'Aug Drive', generatedAt: '2026-07-21T00:00:00.000Z', items: [{ code: 'C-AAA111', matchScore: 90, evalPill: 'Strong', branch: 'CSE', gradYear: 2026, cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1', stage: 'MatchReady', consentStatus: 'none', notes: [] }] }) }; }
    if (url.includes('/candidates')) return { ok: true, status: 200, json: async () => ({ items: [C1, C2] }) };
    if (url.match(/\/drives\/[^/]+$/)) return { ok: true, status: 200, json: async () => ({ id: 'd1', name: 'Aug Drive', primaryEventDate: '2026-09-01T00:00:00.000Z', eventDates: ['2026-09-01T00:00:00.000Z'] }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { bulk, packFn };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/shortlist']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/shortlist" element={<EmployerShortlist />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerShortlist', () => {
  beforeEach(() => { localStorage.clear(); (URL as unknown as { createObjectURL?: unknown }).createObjectURL = vi.fn(() => 'blob:x'); (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL = vi.fn(); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('renders the full pool with a stable select-all count', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    expect(screen.getByText('C-BBB222')).toBeInTheDocument();
    // "Select all (N)" is unique text (avoids matching the chip + a row's decision text)
    expect(screen.getByText(/Select all \(2\)/)).toBeInTheDocument();
  });

  it('bulk-shortlists the selected rows', async () => {
    seedAuth(); const { bulk } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('C-BBB222')).toBeInTheDocument());
    const row = screen.getByText('C-BBB222').closest('.cand-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Bulk shortlist/i }));
    await waitFor(() => expect(bulk).toHaveBeenCalled());
    expect(bulk.mock.calls[0][0]).toEqual({ jobseekerIds: ['j2'], decision: 'Shortlisted' });
  });

  it('downloads the shortlist pack (fetches the pack endpoint)', async () => {
    seedAuth(); const { packFn } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Download shortlist pack/i }));
    await waitFor(() => expect(packFn).toHaveBeenCalled());
    expect(packFn.mock.calls[0][0]).toMatch(/\/shortlist\/pack$/);
  });
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerShortlist.test.tsx`
Expected: FAIL — `EmployerShortlist` module does not exist.

- [ ] **Step 5: Build the `EmployerShortlist` page**

Create `client/src/pages/EmployerPortal/EmployerShortlist.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerCandidates, useCandidateMutations } from './hooks/useEmployerCandidates.js';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import { useBulkDecision, fetchShortlistPack } from './hooks/useEmployerShortlist.js';
import { useAuth } from '../../auth/AuthContext.js';
import type { CandidateDecision, EmployerCandidate } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported from the prototype's Screen 15 "Shortlist workspace" (#page-shortlist). Renders inside
// EmployerShell's ".page active" area (no ".employer-app" re-wrap). Loads the FULL pool (no server
// decision filter) so summary counts stay stable; search/eval/decision filtering is client-side.
// Reuses the ported .deadline-banner/.cand-sumchip/.bulk-bar/.chkbox/.match-ring/.status-pill CSS.

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

function deadlineInfo(primaryEventDate: string | null | undefined) {
  if (!primaryEventDate) return null;
  const close = new Date(new Date(primaryEventDate).getTime() - 24 * 3600 * 1000);
  const ms = close.getTime() - Date.now();
  const closed = ms <= 0;
  const h = Math.max(0, Math.floor(ms / 3600000)); const d = Math.floor(h / 24); const hr = h % 24;
  const remaining = closed ? 'Closed' : d > 0 ? `${d}d ${hr}h` : `${hr}h`;
  const urgency: 'crit' | 'warn' | 'ok' = closed || h < 24 ? 'crit' : h < 48 ? 'warn' : 'ok';
  return { close, closed, remaining, urgency };
}

const CHIPS: { key: string; label: string; color?: string }[] = [
  { key: 'all', label: 'All' }, { key: 'Shortlisted', label: 'Shortlisted', color: 'var(--green)' },
  { key: 'Hold', label: 'Hold', color: 'var(--amber)' }, { key: 'Rejected', label: 'Rejected', color: '#e0463c' },
  { key: 'undecided', label: 'Undecided', color: 'var(--grey-2)' },
];

export function EmployerShortlist() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const { token } = useAuth();
  const drive = useEmployerDrive(driveId);
  const candidates = useEmployerCandidates(driveId, {});   // full pool — counts stay stable
  const { setDecision } = useCandidateMutations(driveId);
  const bulk = useBulkDecision(driveId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [evalf, setEvalf] = useState('');
  const [dec, setDec] = useState('all');
  const [downloading, setDownloading] = useState(false);

  const all = candidates.data?.items ?? [];
  const counts = useMemo(() => {
    const c = { all: all.length, Shortlisted: 0, Hold: 0, Rejected: 0, undecided: 0 };
    for (const it of all) { if (it.decision) c[it.decision] += 1; else c.undecided += 1; }
    return c;
  }, [all]);

  const rows = all.filter((c) => {
    if (evalf && c.evalPill !== evalf) return false;
    if (dec === 'undecided' ? c.decision !== null : dec !== 'all' && c.decision !== dec) return false;
    if (q.trim() && !(`${c.code} ${c.branch}`.toLowerCase().includes(q.trim().toLowerCase()))) return false;
    return true;
  });

  const toggle = (jsId: string) => setSelected((s) => { const n = new Set(s); n.has(jsId) ? n.delete(jsId) : n.add(jsId); return n; });
  const allSelected = rows.length > 0 && rows.every((c) => selected.has(c.jobseekerId));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (rows.every((c) => n.has(c.jobseekerId))) rows.forEach((c) => n.delete(c.jobseekerId));
    else rows.forEach((c) => n.add(c.jobseekerId));
    return n;
  });
  const runBulk = (decision: 'Shortlisted' | 'Hold' | 'Rejected') =>
    bulk.mutate({ jobseekerIds: [...selected], decision }, { onSuccess: () => setSelected(new Set()) });
  const decide = (c: EmployerCandidate, decision: CandidateDecision) =>
    setDecision.mutate({ jobseekerId: c.jobseekerId, decision: c.decision === decision ? null : decision });

  const downloadPack = async () => {
    setDownloading(true);
    try {
      const pack = await fetchShortlistPack(driveId, token);
      const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const head = ['Code', 'Match', 'Evaluation', 'Branch', 'Grad year', 'CGPA band', 'Institute category', 'Stage', 'Consent', 'Notes'];
      const lines = pack.items.map((it) => [it.code, it.matchScore, it.evalPill, it.branch, it.gradYear, it.cgpaBand, it.instituteCategory, it.stage, it.consentStatus, it.notes.join(' | ')].map(esc).join(','));
      const csv = [`MatchDay Shortlist Pack — ${pack.driveName} — identities redacted`, head.map(esc).join(','), ...lines].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = `shortlist-pack-${driveId}.csv`; a.click(); URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  };

  const dl = deadlineInfo(drive.data?.primaryEventDate);

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to candidates
      </button>
      <div className="card">
        <h2>Shortlist workspace — {drive.data?.name ?? '…'}</h2>
        <p className="hint">Review, decide and package your shortlist. Identities stay redacted until a candidate confirms interest.</p>
      </div>

      {dl && (
        <div className={`deadline-banner ${dl.urgency}`}>
          <span className="db-ic"><svg className="ic ic-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
          <div>
            <div className="db-t">{dl.closed ? 'Shortlisting window has closed' : `Shortlisting closes ${dl.close.toLocaleDateString()}`}</div>
            <div className="db-s">Closes 24h before your MatchDay slot. This is a reminder — decisions stay open.</div>
          </div>
          <div className="db-count"><div className="n">{dl.remaining}</div><div className="l">{dl.closed ? 'window closed' : 'remaining'}</div></div>
        </div>
      )}
      {!dl && <p className="hint">No slot scheduled yet — shortlisting stays open.</p>}

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" placeholder="Search by code or branch" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
        <select className="select" value={evalf} onChange={(e) => setEvalf(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">All evaluations</option><option value="Strong">Strong</option><option value="Qualified">Qualified</option>
        </select>
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" className="btn btn-ghost" disabled={downloading} onClick={downloadPack}>Download shortlist pack</button>
        <button type="button" className="btn btn-primary" onClick={() => navigate(`/employer/drives/${driveId}/consent`)}>Consent status</button>
      </div>

      <div className="cand-summary" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0' }}>
        {CHIPS.map((ch) => (
          <button type="button" key={ch.key} className={`cand-sumchip ${dec === ch.key ? 'on' : ''}`} onClick={() => setDec(ch.key)}>
            {ch.color && <span className="dotc" style={{ background: ch.color }} />}{ch.label} <b>{counts[ch.key as keyof typeof counts]}</b>
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bb-n">{selected.size} selected</span>
          <button type="button" onClick={() => runBulk('Shortlisted')}>Bulk shortlist</button>
          <button type="button" onClick={() => runBulk('Hold')}>Bulk hold</button>
          <button type="button" onClick={() => runBulk('Rejected')}>Bulk reject</button>
          <span className="bb-sp" />
          <button type="button" className="clear" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="card">
        {candidates.isLoading ? <p className="hint">Loading candidates…</p>
          : candidates.isError ? <p className="hint">{errMsg(candidates.error)}</p>
          : all.length === 0 ? <p className="cand-empty hint">No candidates in this drive's pool yet.</p>
          : (
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--grey)' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all ({rows.length})
              </label>
              {rows.map((c) => (
                <div className="cand-row" key={c.jobseekerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input type="checkbox" checked={selected.has(c.jobseekerId)} onChange={() => toggle(c.jobseekerId)} aria-label={`Select ${c.code}`} />
                    <span className="match-ring" title="Match score">{c.matchScore}</span>
                    <div className="fact">
                      <div className="fv">{c.code} <span className={`status-pill ${c.evalPill === 'Strong' ? 'st-approved' : 'st-inprog'}`}>{c.evalPill}</span></div>
                      <div className="fl">{c.branch} · {c.gradYear} · CGPA {c.cgpaBand} · {c.stage}{c.decision ? ` · ${c.decision}` : ''}{c.consent ? ` · consent: ${c.consent.expired ? 'expired' : c.consent.status}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/candidates/${c.jobseekerId}`)}>Passport</button>
                    <button type="button" className={`btn ${c.decision === 'Shortlisted' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide(c, 'Shortlisted')}>Shortlist</button>
                    <button type="button" className={`btn ${c.decision === 'Hold' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide(c, 'Hold')}>Hold</button>
                    <button type="button" className={`btn ${c.decision === 'Rejected' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide(c, 'Rejected')}>Reject</button>
                  </div>
                </div>
              ))}
              {rows.length === 0 && <p className="hint">No candidates match these filters.</p>}
            </div>
          )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- --run src/test/EmployerShortlist.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Add the route + the candidates-page CTA**

(a) In `client/src/App.tsx`, add the import near the other employer imports:

```tsx
import { EmployerShortlist } from './pages/EmployerPortal/EmployerShortlist.js';
```

And the route immediately after the `.../consent` route (line 62):

```tsx
        <Route path="/employer/drives/:id/shortlist" element={<RoleRoute role="employer"><EmployerShell><EmployerShortlist /></EmployerShell></RoleRoute>} />
```

(b) In `client/src/pages/EmployerPortal/EmployerCandidates.tsx`, add a "Shortlist workspace" CTA next to the existing "Consent status" button (inside the same `<div style={{ marginTop: 10 }}>`), always enabled:

```tsx
          <button type="button" className="btn btn-ghost" style={{ marginRight: 6 }}
            onClick={() => navigate(`/employer/drives/${driveId}/shortlist`)}>Shortlist workspace</button>
```

(Place it before the existing "Consent status" button in that div.)

- [ ] **Step 8: Full client suite + type-check + build + commit**

Run: `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`
Expected: all-green (the existing EmployerCandidates tests still pass — the CTA is additive); tsc `ok`; build succeeds.

```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal/hooks/useEmployerShortlist.ts client/src/pages/EmployerPortal/EmployerShortlist.tsx client/src/pages/EmployerPortal/EmployerCandidates.tsx client/src/App.tsx client/src/test/EmployerShortlist.test.tsx
git commit -m "feat(client): shortlist workspace (bulk decide + summary + deadline + pack download)"
```

---

## Task 4: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` (all green) && `npm test -w client` (all green). Report counts.
- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build` — all clean/succeed.
- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer6_smoke`)** — mirror the 5a/5b smoke harness: seed the DB, start the server against it on an isolated port (`PORT=4099`; **kill any stale listener on 4099 first via `lsof -nP -iTCP:4099 -sTCP:LISTEN -t | xargs -r kill`**, then confirm `EADDRINUSE` did not occur by checking the server log). Using an employer demo token + an admin token, and creating an Approved registration directly:
  - Pick an Active drive with a non-empty eligible∩Match-Ready pool; approve the demo employer for it.
  - `POST .../candidates/bulk-decision { jobseekerIds:[3 pool ids], decision:'Shortlisted' }` → 200 `updated:3`; confirm 3 `Application` docs with `decision:'Shortlisted'`.
  - Include one non-pool id (a random ObjectId + an `Applied`-stage jobseeker) in a bulk call → it is excluded from `updated`.
  - `GET .../shortlist/pack` → 200 with exactly the 3 shortlisted items, **redacted** (grep the payload: a seeded real name is ABSENT), with `consentStatus` and (for one seeded with a note) note text present.
  - Bulk `Rejected` on one of the 3 → the pack shrinks to 2.
  - Employer B (approved for the same drive) `bulk-decision` `Rejected` on the same ids → employer A's decisions unchanged (isolation).
  - Admin token on `bulk-decision` and on `shortlist/pack` → 403.
- [ ] **Step 4: Teardown** — kill the server **by its listener PID** (`lsof -nP -iTCP:4099 -sTCP:LISTEN -t | xargs -r kill`), not just the tsx parent; drop `matchday_employer6_smoke`; confirm the shared `matchday` DB was never written to and remains intact. No commit.

---

## Notes for the executor

- The worktree is stacked on 5b; the base contains all of 5a+5b (Application, decision, consent, `poolSeekers`, `candidateScore`, `cgpaBand`, `consentBlock`, `codeFor`). Do not re-implement them.
- `poolSeekers` selects only non-identity fields (5a) — the pack must never load `name`/`email`; a server test greps the payload for their absence.
- Bulk decision writes non-null decisions only and preserves `notes`/`consent` (bulkWrite `$set: { decision }` touches nothing else).
- `Date.now()`/`new Date()` are fine in client + server code.
- Client CSV generation mirrors the 5 existing exporters (Blob + `a.download`); the test stubs `URL.createObjectURL`/`revokeObjectURL` + anchor `click` (jsdom lacks them).
- Known stubs (from the spec): pack is redacted-only (no consented reveal); deadline is informational (no lock); bulk clear-to-null unsupported (single-candidate 5a path); filtering is client-side over the full pool.
