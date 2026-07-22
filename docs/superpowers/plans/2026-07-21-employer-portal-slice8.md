# Employer Portal — Slice 8: Kanban Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-drive kanban board where each pool candidate sits in a stage column — derived from decision/consent/interview until the employer pins it by moving the card.

**Architecture:** A nullable `Application.stage` overlay (derived-until-moved). A shared pure `kanban` constants+derivation module. Two endpoints on the existing `/employer` gate: a board read (pool → cards with effective stage + reveal) and a stage PATCH (upsert + set). Client: an `EmployerKanban` board page with advance/back/reject/restore move buttons. Stacked on 5a+5b+6+7.

**Tech Stack:** Node/Express + Mongoose (ESM, NodeNext, `.js` import specifiers), Zod, Vitest + Supertest (server); React + React Query + React Router, Vitest + Testing Library (client).

## Global Constraints

- Base: this branch (`feat/employer-portal-slice8`) is **stacked on `feat/employer-portal-slice7`**. Do not rebase onto `main`.
- **Derived-until-moved:** a card's stage = `app.stage ?? deriveStage(decision, consentStatus, hasInterview)`. The stage PATCH **stores** `stage`; it must **not** mutate `decision`/`consent`/`interview`.
- **Identity revealed only when consent granted** (reuse 5a's granted-only identity load); `employerId` from `req.userId`, never the body.
- Out-of-pool/bad id → `404 not_found` (no oracle). Invalid `stage` value → `400 validation`.
- Error envelope `{ error: { message, code } }`. ESM: every relative import ends in `.js`.
- Full 13-stage set; buttons (advance/back/reject/restore), not drag-and-drop.

## Prerequisites (one-time)
`cd ~/code/matchday-employer8 && npm install`. Verify: `npm test -w server -- --run test/seeker-portal.route.test.ts` passes.

## File Structure
**Server — create:** `server/src/constants/kanban.ts`; `server/src/modules/employerPortal/employerBoard.schemas.ts`, `employerBoard.service.ts`, `employerBoard.controller.ts`; `server/test/employer-board.route.test.ts`.
**Server — modify:** `server/src/models/Application.ts` (+`stage`); `server/src/modules/employerPortal/employerPortal.routes.ts` (2 routes).
**Client — create:** `client/src/pages/EmployerPortal/hooks/useEmployerBoard.ts`; `client/src/pages/EmployerPortal/EmployerKanban.tsx`; `client/src/test/EmployerKanban.test.tsx`.
**Client — modify:** `client/src/types/employer.ts`; `client/src/pages/EmployerPortal/EmployerCandidates.tsx` (CTA); `client/src/App.tsx` (route).

---

## Task 1: Server — `Application.stage` + kanban constants + board read

**Files:** Create `server/src/constants/kanban.ts`, `employerBoard.service.ts`, `employerBoard.controller.ts`, `server/test/employer-board.route.test.ts`; Modify `server/src/models/Application.ts`, `employerPortal.routes.ts`.

**Interfaces:**
- Consumes: `poolSeekers`, `candidateScore`, `requirePoolMember` (`employerCandidates.service.js`), `hasApprovedRegistration` (`employerPortal.service.js`), `codeFor` (`jobseekers.service.js`), `consentBlock` (`constants/consent.js`), models `Drive`/`Jobseeker`/`Institute`/`Application`/`Interview`.
- Produces: `KANBAN_STAGES`/`KANBAN_ORDER`/`KANBAN_TERMINAL`/`KanbanStage`/`deriveStage`/`effectiveStage`; `getBoard(employerId, driveId) → { items: BoardCard[] }`; a `boardCard(...)` pure projector reused by Task 2. `BoardCard = { jobseekerId, code, branch, matchScore, evalPill, stage, decision, consentStatus, revealed: {name,email}|null }`. Route `GET /employer/drives/:id/board`.

- [ ] **Step 1: Add `stage` to the Application model**

In `server/src/models/Application.ts`, add to `applicationSchema` (after `consent`):

```ts
  stage: {
    type: String,
    enum: ['Recommended', 'Shortlisted', 'Candidate Confirmed', 'Scheduled', 'L1', 'L2', 'L3', 'HR', 'Offer Sent', 'Offer Accepted', 'Joined', 'Rejected', 'Withdrawn'],
    default: null,
  },
```

- [ ] **Step 2: Create the kanban constants + derivation**

Create `server/src/constants/kanban.ts`:

```ts
// Shared, pure kanban stage constants + derivation (Slice 8). No model imports.
export const KANBAN_STAGES = [
  'Recommended', 'Shortlisted', 'Candidate Confirmed', 'Scheduled',
  'L1', 'L2', 'L3', 'HR', 'Offer Sent', 'Offer Accepted', 'Joined',
  'Rejected', 'Withdrawn',
] as const;
export type KanbanStage = (typeof KANBAN_STAGES)[number];

// The linear advance/back flow (terminal stages are off-flow).
export const KANBAN_ORDER: KanbanStage[] = [
  'Recommended', 'Shortlisted', 'Candidate Confirmed', 'Scheduled',
  'L1', 'L2', 'L3', 'HR', 'Offer Sent', 'Offer Accepted', 'Joined',
];
export const KANBAN_TERMINAL: KanbanStage[] = ['Rejected', 'Withdrawn'];

// Initial column when the employer hasn't pinned a stage. Seeded (one-way) from
// the 5a decision, 5b consent, and whether a live interview exists (7).
export function deriveStage(
  decision: string | null | undefined,
  consentStatus: string | null | undefined,
  hasInterview: boolean,
): KanbanStage {
  if (consentStatus === 'granted') return hasInterview ? 'Scheduled' : 'Candidate Confirmed';
  if (consentStatus === 'declined') return 'Withdrawn';
  if (decision === 'Shortlisted') return 'Shortlisted';
  if (decision === 'Rejected') return 'Rejected';
  return 'Recommended';
}
```

- [ ] **Step 3: Write the failing board test**

Create `server/test/employer-board.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { Application } from '../src/models/Application.js';
import { Slot } from '../src/models/Slot.js';
import { Interview } from '../src/models/Interview.js';
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
function stageOf(items: any[], jsId: unknown) { return items.find((i) => i.jobseekerId === String(jsId))?.stage; }

describe('GET .../board', () => {
  it('derives effective stages from decision / consent / interview', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const now = new Date();
    const undecided = await seeker(inst._id, { email: 'u@x.test' });                                    // → Recommended
    const short = await seeker(inst._id, { email: 's@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: short._id, decision: 'Shortlisted' }); // → Shortlisted
    const confirmed = await seeker(inst._id, { email: 'c@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: confirmed._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } }); // granted, no interview → Candidate Confirmed
    const scheduled = await seeker(inst._id, { email: 'sc@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: scheduled._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    const sl = await Slot.create({ driveId: d._id, employerId: emp._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00', capacity: 10, status: 'Scheduled', link: 'x' });
    await Interview.create({ employerId: emp._id, driveId: d._id, jobseekerId: scheduled._id, slotId: sl._id, time: '10:30', status: 'Scheduled' }); // granted + interview → Scheduled
    const declined = await seeker(inst._id, { email: 'dec@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: declined._id, decision: 'Shortlisted', consent: { status: 'declined', requestedAt: now, expiresAt: now, respondedAt: now } }); // → Withdrawn
    const pinned = await seeker(inst._id, { email: 'p@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: pinned._id, decision: 'Shortlisted', stage: 'L2' }); // pinned overrides

    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    const items = res.body.items;
    expect(stageOf(items, undecided._id)).toBe('Recommended');
    expect(stageOf(items, short._id)).toBe('Shortlisted');
    expect(stageOf(items, confirmed._id)).toBe('Candidate Confirmed');
    expect(stageOf(items, scheduled._id)).toBe('Scheduled');
    expect(stageOf(items, declined._id)).toBe('Withdrawn');
    expect(stageOf(items, pinned._id)).toBe('L2');
  });

  it('reveals identity only for consent-granted cards', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const now = new Date();
    const g = await seeker(inst._id, { email: 'g@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: g._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    const m = await seeker(inst._id, { email: 'm@x.test' });
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    const gc = res.body.items.find((i: any) => i.jobseekerId === String(g._id));
    const mc = res.body.items.find((i: any) => i.jobseekerId === String(m._id));
    expect(gc.revealed).toEqual({ name: 'Real Name', email: 'g@x.test' });
    expect(mc.revealed).toBeNull();
  });

  it('gated + employer-scoped + 401/403', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); const inst = await institute(); await seeker(inst._id);
    const app = createApp();
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tokenFor(a)}`)).status).toBe(400); // no reg
    await approve(a, d);
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/board`)).status).toBe(401);
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${signToken({ sub: String(a._id), role: 'admin' })}`)).status).toBe(403);
  });
});
```

- [ ] **Step 4: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-board.route.test.ts`
Expected: FAIL — route 404 / service missing.

- [ ] **Step 5: Create the board service**

Create `server/src/modules/employerPortal/employerBoard.service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Application } from '../../models/Application.js';
import { Interview } from '../../models/Interview.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { poolSeekers, candidateScore } from './employerCandidates.service.js';
import { codeFor } from '../jobseekers/jobseekers.service.js';
import { consentBlock } from '../../constants/consent.js';
import { deriveStage, type KanbanStage } from '../../constants/kanban.js';

interface SeekerLean { _id: Types.ObjectId; instituteId: Types.ObjectId; branch: string; gradYear: number; cgpa: number; source: string; evaluationStatus: string; stage: string }
interface AppLean { jobseekerId: Types.ObjectId; decision?: string | null; consent?: { status?: string } | null; stage?: KanbanStage | null }
export interface RevealedIdentity { name: string; email: string; }
export interface BoardCard {
  jobseekerId: string; code: string; branch: string; matchScore: number; evalPill: 'Strong' | 'Qualified';
  stage: KanbanStage; decision: 'Shortlisted' | 'Hold' | 'Rejected' | null;
  consentStatus: 'requested' | 'granted' | 'declined' | 'expired' | 'none'; revealed: RevealedIdentity | null;
}

interface DriveLean { _id: Types.ObjectId; eligibility?: { branches?: string[]; gradYears?: number[]; sources?: string[] } }

async function gateAndDrive(employerId: string, driveId: string): Promise<DriveLean> {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean<DriveLean>();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  return drive;
}

export function boardCard(s: SeekerLean, app: AppLean | undefined, hasInterview: boolean, reveal: RevealedIdentity | null): BoardCard {
  const { matchScore } = candidateScore(s.cgpa, s.evaluationStatus, s.stage);
  const cb = consentBlock(app?.consent as Parameters<typeof consentBlock>[0]);
  const consentStatus = (cb ? (cb.expired ? 'expired' : cb.status) : 'none') as BoardCard['consentStatus'];
  const stage = (app?.stage as KanbanStage | null | undefined) ?? deriveStage(app?.decision, app?.consent?.status, hasInterview);
  return {
    jobseekerId: String(s._id), code: codeFor(s._id), branch: s.branch,
    matchScore, evalPill: matchScore >= 80 ? 'Strong' : 'Qualified',
    stage, decision: (app?.decision as BoardCard['decision']) ?? null, consentStatus, revealed: reveal,
  };
}

async function revealMapFor(apps: AppLean[]): Promise<Map<string, RevealedIdentity>> {
  const grantedIds = apps.filter((a) => a.consent?.status === 'granted').map((a) => a.jobseekerId);
  const map = new Map<string, RevealedIdentity>();
  if (grantedIds.length) {
    const revealed = await Jobseeker.find({ _id: { $in: grantedIds } }).select('name email').lean<{ _id: Types.ObjectId; name: string; email?: string }[]>();
    for (const r of revealed) map.set(String(r._id), { name: r.name, email: r.email ?? '' });
  }
  return map;
}

export async function getBoard(employerId: string, driveId: string) {
  const drive = await gateAndDrive(employerId, driveId);
  const pool = await poolSeekers(drive) as unknown as SeekerLean[];
  const apps = await Application.find({ employerId, driveId, jobseekerId: { $in: pool.map((s) => s._id) } }).lean<AppLean[]>();
  const appByJs = new Map(apps.map((a) => [String(a.jobseekerId), a]));
  const interviewed = new Set(
    (await Interview.find({ employerId, driveId, status: { $ne: 'Cancelled' } }).select('jobseekerId').lean<{ jobseekerId: Types.ObjectId }[]>())
      .map((i) => String(i.jobseekerId)),
  );
  const revealMap = await revealMapFor(apps);
  const items = pool.map((s) => boardCard(s, appByJs.get(String(s._id)), interviewed.has(String(s._id)), revealMap.get(String(s._id)) ?? null));
  items.sort((a, b) => b.matchScore - a.matchScore);
  return { items };
}
```

- [ ] **Step 6: Create the controller + register the board route**

Create `server/src/modules/employerPortal/employerBoard.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { getBoard } from './employerBoard.service.js';

export async function boardController(req: Request, res: Response) {
  res.json(await getBoard(req.userId as string, req.params.id));
}
```

In `server/src/modules/employerPortal/employerPortal.routes.ts`, add the import (after the interviews controller import) and the route (after the interviews routes, before the final `.get('/employer', ...)`):

```ts
import { boardController } from './employerBoard.controller.js';
```
```ts
employerPortalRoutes.get('/employer/drives/:id/board', asyncHandler(boardController));
```

- [ ] **Step 7: Run tests + type-check**

Run: `npm test -w server -- --run test/employer-board.route.test.ts && npx -w server tsc --noEmit`
Expected: all PASS; tsc `ok`.

- [ ] **Step 8: Commit**

```bash
git add server/src/models/Application.ts server/src/constants/kanban.ts server/src/modules/employerPortal/employerBoard.service.ts server/src/modules/employerPortal/employerBoard.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-board.route.test.ts
git commit -m "feat(server): kanban Application.stage + board read (derived-until-moved, reveal-gated)"
```

---

## Task 2: Server — stage PATCH (move a card)

**Files:** Create `server/src/modules/employerPortal/employerBoard.schemas.ts`; Modify `employerBoard.service.ts`, `employerBoard.controller.ts`, `employerPortal.routes.ts`, `server/test/employer-board.route.test.ts` (append).

**Interfaces:**
- Consumes: `requirePoolMember` (`employerCandidates.service.js`), `boardCard`/`gateAndDrive` (Task 1), `KANBAN_STAGES` (`constants/kanban.js`), `Interview`.
- Produces: `setStage(employerId, driveId, jobseekerId, stage) → BoardCard`; route `PATCH /employer/drives/:id/candidates/:jobseekerId/stage`.

- [ ] **Step 1: Write the schema**

Create `server/src/modules/employerPortal/employerBoard.schemas.ts`:

```ts
import { z } from 'zod';
import { KANBAN_STAGES } from '../../constants/kanban.js';

export const setStageSchema = z.object({ stage: z.enum(KANBAN_STAGES) });
export type SetStagePayload = z.infer<typeof setStageSchema>;
```
(If the project's zod version rejects a `readonly` tuple in `z.enum`, use `z.enum([...KANBAN_STAGES] as [string, ...string[]])`.)

- [ ] **Step 2: Write the failing PATCH tests (append to `server/test/employer-board.route.test.ts`)**

```ts
describe('PATCH .../candidates/:jobseekerId/stage', () => {
  it('pins the stage on an existing Application without touching decision', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted' });
    const res = await request(createApp()).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ stage: 'L2' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('L2');
    expect(res.body.decision).toBe('Shortlisted'); // decision untouched
    const app = await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: s._id }).lean();
    expect(app?.stage).toBe('L2');
    expect(app?.decision).toBe('Shortlisted');
  });

  it('creates an Application (decision null) for a pure-pool candidate then pins the stage', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    expect(await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: s._id })).toBeNull();
    const res = await request(createApp()).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ stage: 'Shortlisted' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('Shortlisted');
    const app = await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: s._id }).lean();
    expect(app?.stage).toBe('Shortlisted');
    expect(app?.decision ?? null).toBeNull(); // decision NOT set by a stage move
  });

  it('rejects an invalid stage (400); out-of-pool → 404; 401/403', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    const applied = await seeker(inst._id, { email: 'ap@x.test', stage: 'Applied' }); // out of pool
    const app = createApp(); const tok = tokenFor(emp);
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`).set('Authorization', `Bearer ${tok}`).send({ stage: 'Nope' })).status).toBe(400);
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${applied._id}/stage`).set('Authorization', `Bearer ${tok}`).send({ stage: 'L1' })).status).toBe(404);
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`).send({ stage: 'L1' })).status).toBe(401);
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`).set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`).send({ stage: 'L1' })).status).toBe(403);
  });
});
```

- [ ] **Step 3: Run — verify it fails**

Run: `npm test -w server -- --run test/employer-board.route.test.ts`
Expected: the new PATCH describe FAILS (route 404).

- [ ] **Step 4: Add `setStage` to the service**

Append to `server/src/modules/employerPortal/employerBoard.service.ts` (add `requirePoolMember` to the `employerCandidates.service.js` import):

```ts
export async function setStage(employerId: string, driveId: string, jobseekerId: string, stage: KanbanStage): Promise<BoardCard> {
  const { seeker } = await requirePoolMember(employerId, driveId, jobseekerId);
  await Application.findOneAndUpdate(
    { employerId, driveId, jobseekerId },
    { $set: { stage }, $setOnInsert: { employerId, driveId, jobseekerId } },
    { upsert: true, new: true },
  );
  const app = await Application.findOne({ employerId, driveId, jobseekerId }).lean<AppLean>();
  const hasInterview = !!(await Interview.findOne({ employerId, driveId, jobseekerId, status: { $ne: 'Cancelled' } }));
  const reveal = app?.consent?.status === 'granted'
    ? await Jobseeker.findById(jobseekerId).select('name email').lean<{ name: string; email?: string }>().then((r) => ({ name: r?.name ?? '—', email: r?.email ?? '' }))
    : null;
  return boardCard(seeker as unknown as SeekerLean, app ?? undefined, hasInterview, reveal);
}
```
(`requirePoolMember` returns `{ drive, seeker }` with the non-identity seeker fields — reuse that `seeker` for the card.)

- [ ] **Step 5: Add the controller + route**

In `employerBoard.controller.ts`, extend the import + add the controller:

```ts
import { getBoard, setStage } from './employerBoard.service.js';
import { setStageSchema } from './employerBoard.schemas.js';
```
```ts
export async function setStageController(req: Request, res: Response) {
  const { stage } = setStageSchema.parse(req.body);
  res.json(await setStage(req.userId as string, req.params.id, req.params.jobseekerId, stage));
}
```

In `employerPortal.routes.ts`, extend the import + add the route (after the board GET):

```ts
import { boardController, setStageController } from './employerBoard.controller.js';
```
```ts
employerPortalRoutes.patch('/employer/drives/:id/candidates/:jobseekerId/stage', asyncHandler(setStageController));
```
(Safe next to the other `/candidates/:jobseekerId/*` routes — a distinct `/stage` suffix + PATCH method.)

- [ ] **Step 6: Run the file + full server suite + type-check**

Run: `npm test -w server -- --run test/employer-board.route.test.ts && npm test -w server && npx -w server tsc --noEmit`
Expected: file PASSES; full suite all-green; tsc `ok`. Report counts.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/employerPortal/employerBoard.schemas.ts server/src/modules/employerPortal/employerBoard.service.ts server/src/modules/employerPortal/employerBoard.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-board.route.test.ts
git commit -m "feat(server): kanban stage PATCH (upsert + pin, pool-gated, decision untouched)"
```

---

## Task 3: Client — board page + hooks + route + CTA

**Files:** Modify `client/src/types/employer.ts`, `EmployerCandidates.tsx`, `App.tsx`; Create `hooks/useEmployerBoard.ts`, `EmployerKanban.tsx`, `client/src/test/EmployerKanban.test.tsx`.

**Interfaces:**
- Consumes: `apiFetch`/`useAuth`; the Task 1/2 endpoints.
- Produces: `BoardCard`/`BoardStage` types + `KANBAN_ORDER`/`KANBAN_TERMINAL` client constants; `useEmployerBoard(driveId)` + `useMoveStage(driveId)`; `EmployerKanban` at `/employer/drives/:id/board`.

- [ ] **Step 1: Add the types + client constants**

In `client/src/types/employer.ts`, append:

```ts
export type BoardStage =
  | 'Recommended' | 'Shortlisted' | 'Candidate Confirmed' | 'Scheduled'
  | 'L1' | 'L2' | 'L3' | 'HR' | 'Offer Sent' | 'Offer Accepted' | 'Joined'
  | 'Rejected' | 'Withdrawn';
export const KANBAN_ORDER: BoardStage[] = ['Recommended', 'Shortlisted', 'Candidate Confirmed', 'Scheduled', 'L1', 'L2', 'L3', 'HR', 'Offer Sent', 'Offer Accepted', 'Joined'];
export const KANBAN_TERMINAL: BoardStage[] = ['Rejected', 'Withdrawn'];
export const KANBAN_ALL: BoardStage[] = [...KANBAN_ORDER, ...KANBAN_TERMINAL];
export interface BoardCard {
  jobseekerId: string; code: string; branch: string; matchScore: number; evalPill: 'Strong' | 'Qualified';
  stage: BoardStage; decision: 'Shortlisted' | 'Hold' | 'Rejected' | null;
  consentStatus: 'requested' | 'granted' | 'declined' | 'expired' | 'none';
  revealed: { name: string; email: string } | null;
}
export interface EmployerBoardResponse { items: BoardCard[]; }
```

- [ ] **Step 2: Add the hooks**

Create `client/src/pages/EmployerPortal/hooks/useEmployerBoard.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { BoardCard, BoardStage, EmployerBoardResponse } from '../../../types/employer.js';

export function useEmployerBoard(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-board', driveId],
    queryFn: () => apiFetch<EmployerBoardResponse>(`/me/employer/drives/${driveId}/board`, { token }),
    enabled: !!token && !!driveId,
  });
}

export function useMoveStage(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobseekerId, stage }: { jobseekerId: string; stage: BoardStage }) =>
      apiFetch<BoardCard>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}/stage`, { method: 'PATCH', body: { stage }, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-board', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}
```

- [ ] **Step 3: Write the failing page test**

Create `client/src/test/EmployerKanban.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerKanban } from '../pages/EmployerPortal/EmployerKanban.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const base = { branch: 'CSE', matchScore: 88, evalPill: 'Strong', decision: 'Shortlisted', consentStatus: 'none' };
const SHORT = { ...base, jobseekerId: 'j1', code: 'C-AAA111', stage: 'Shortlisted', revealed: null };
const GRANTED = { ...base, jobseekerId: 'j2', code: 'C-BBB222', stage: 'Candidate Confirmed', consentStatus: 'granted', revealed: { name: 'Ananya Sharma', email: 'a@x.test' } };

function mockFetch(items: unknown[]) {
  const move = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/stage$/) && method === 'PATCH') { move(url, JSON.parse(opts.body as string)); return { ok: true, status: 200, json: async () => ({ ...SHORT, stage: JSON.parse(opts.body as string).stage }) }; }
    if (url.match(/\/board$/)) return { ok: true, status: 200, json: async () => ({ items }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { move };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/board']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/board" element={<EmployerKanban />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerKanban', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('places cards in their stage columns; granted shows the revealed name', async () => {
    seedAuth(); mockFetch([SHORT, GRANTED]); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument();     // granted → revealed
  });

  it('Advance moves a card to the next stage in the order', async () => {
    seedAuth(); const { move } = mockFetch([SHORT]); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    const card = screen.getByText('C-AAA111').closest('.kcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Advance/i }));
    await waitFor(() => expect(move).toHaveBeenCalled());
    expect(move.mock.calls[0][0]).toMatch(/\/candidates\/j1\/stage$/);
    expect(move.mock.calls[0][1]).toEqual({ stage: 'Candidate Confirmed' }); // Shortlisted → next
  });

  it('Reject moves a card to Rejected', async () => {
    seedAuth(); const { move } = mockFetch([SHORT]); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    const card = screen.getByText('C-AAA111').closest('.kcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Reject/i }));
    await waitFor(() => expect(move).toHaveBeenCalled());
    expect(move.mock.calls[0][1]).toEqual({ stage: 'Rejected' });
  });

  it('shows the empty state when the pool is empty', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/No candidates in the pipeline/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerKanban.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 5: Build the `EmployerKanban` page**

Create `client/src/pages/EmployerPortal/EmployerKanban.tsx`:

```tsx
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerBoard, useMoveStage } from './hooks/useEmployerBoard.js';
import { KANBAN_ALL, KANBAN_ORDER, KANBAN_TERMINAL, type BoardCard, type BoardStage } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }
const DOT: Record<string, string> = {
  Recommended: '#8a90a6', Shortlisted: '#2f4fe0', 'Candidate Confirmed': '#17a673', Scheduled: '#2f4fe0',
  L1: '#d98a12', L2: '#d98a12', L3: '#d98a12', HR: '#7c3aed', 'Offer Sent': '#17a673', 'Offer Accepted': '#12805a',
  Joined: '#0f7a52', Rejected: '#e0463c', Withdrawn: '#8a90a6',
};

export function EmployerKanban() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const board = useEmployerBoard(driveId);
  const move = useMoveStage(driveId);
  const items = board.data?.items ?? [];
  const byStage = (st: BoardStage) => items.filter((c) => c.stage === st);

  const card = (c: BoardCard) => {
    const idx = KANBAN_ORDER.indexOf(c.stage);
    const terminal = KANBAN_TERMINAL.includes(c.stage);
    return (
      <div className="kcard" key={c.jobseekerId}>
        <div className="kc-top">
          <div style={{ minWidth: 0 }}>
            <div className="kc-name">{c.revealed ? c.revealed.name : c.code}</div>
            <div className="kc-id">{c.revealed ? `${c.code} · revealed` : 'identity hidden'}</div>
          </div>
          <span className="kc-score" style={{ background: c.matchScore >= 86 ? 'var(--green)' : 'var(--indigo)' }}>{c.matchScore}</span>
        </div>
        <div className="kc-foot">
          {terminal ? (
            <button type="button" className="kbtn" disabled={move.isPending} onClick={() => move.mutate({ jobseekerId: c.jobseekerId, stage: 'Recommended' })}>Restore</button>
          ) : (
            <>
              <button type="button" className="kbtn" aria-label="Back" disabled={move.isPending || idx <= 0} onClick={() => move.mutate({ jobseekerId: c.jobseekerId, stage: KANBAN_ORDER[idx - 1] })}>◀</button>
              <button type="button" className="kbtn" aria-label="Advance" disabled={move.isPending || idx >= KANBAN_ORDER.length - 1} onClick={() => move.mutate({ jobseekerId: c.jobseekerId, stage: KANBAN_ORDER[idx + 1] })}>▶</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="kbtn rej" aria-label="Reject" disabled={move.isPending} onClick={() => move.mutate({ jobseekerId: c.jobseekerId, stage: 'Rejected' })}>✕</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to candidates
      </button>
      <div className="card"><h2>Hiring pipeline</h2><p className="hint">Private to your team. Identities appear once a candidate consents. <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/interviews`)}>Interviews</button></p></div>
      {move.isError && <p className="otp-err" role="alert">{errMsg(move.error)}</p>}
      {board.isLoading ? <p className="hint">Loading…</p>
        : board.isError ? <p className="hint">{errMsg(board.error)}</p>
        : items.length === 0 ? <p className="cand-empty hint">No candidates in the pipeline yet.</p>
        : (
          <div className="kanban-board">
            {KANBAN_ALL.map((st) => {
              const cards = byStage(st);
              return (
                <div className="kanban-col" key={st}>
                  <div className="kcol-head"><span className="kdot" style={{ background: DOT[st] }} /><span className="kt">{st}</span><span className="kn">{cards.length}</span></div>
                  <div className="kcol-body">{cards.length ? cards.map(card) : <div className="kcol-empty">—</div>}</div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
```

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- --run src/test/EmployerKanban.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Add the route + CTA**

(a) `client/src/App.tsx`: add the import near the other employer imports and the route after the `.../interviews` route:

```tsx
import { EmployerKanban } from './pages/EmployerPortal/EmployerKanban.js';
```
```tsx
        <Route path="/employer/drives/:id/board" element={<RoleRoute role="employer"><EmployerShell><EmployerKanban /></EmployerShell></RoleRoute>} />
```

(b) `client/src/pages/EmployerPortal/EmployerCandidates.tsx`: add a "Pipeline board" CTA in the same button `<div style={{ marginTop: 10 }}>` (after the "Interviews" button), always enabled:

```tsx
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 6 }}
            onClick={() => navigate(`/employer/drives/${driveId}/board`)}>Pipeline board</button>
```

- [ ] **Step 8: Full client suite + type-check + build + commit**

Run: `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`
Expected: all-green (existing tests unaffected — the CTA is additive); tsc `ok`; build succeeds.

```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal/hooks/useEmployerBoard.ts client/src/pages/EmployerPortal/EmployerKanban.tsx client/src/pages/EmployerPortal/EmployerCandidates.tsx client/src/App.tsx client/src/test/EmployerKanban.test.tsx
git commit -m "feat(client): kanban pipeline board (columns + advance/back/reject/restore moves)"
```

---

## Task 4: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` && `npm test -w client`. Report counts.
- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer8_smoke`)** — mirror the prior smokes: **kill any stale listener on 4099 first** (`lsof -nP -iTCP:4099 -sTCP:LISTEN -t | xargs -r kill`), seed, start the server on `PORT=4099`, confirm no `EADDRINUSE`. Mint tokens via `signToken` (employer demo `_id` role employer; random `sub` role admin); create an Approved registration directly. Then:
  - Pick an Active drive with a pool; approve the demo employer.
  - Seed varied Applications directly for a few pool candidates (a Shortlisted-only; a granted-consent; a granted + a non-cancelled Interview; a declined) and leave one pure-pool.
  - `GET .../board` → verify each lands in the derived column (Shortlisted / Candidate Confirmed / Scheduled / Withdrawn / Recommended); a granted card carries `revealed.name` (the seeded real name), a masked one has `revealed:null`.
  - `PATCH .../candidates/:jobseekerId/stage {stage:'L2'}` on the shortlisted one → 200 `stage:'L2'`; a re-read shows it in `L2`; confirm the Application's `decision` is unchanged.
  - `PATCH` a pure-pool candidate → creates the Application (`decision:null`), pins the stage.
  - Invalid stage → 400; out-of-pool → 404; employer B `GET board` → sees none of A's pins/reveals; admin → 403.
- [ ] **Step 4: Teardown** — kill the server **by listener PID**; drop `matchday_employer8_smoke`; confirm shared `matchday` untouched. No commit.

---

## Notes for the executor
- Stacked on 7; the base has all of 5a/5b/6/7. Do not re-implement `poolSeekers`/`requirePoolMember`/`candidateScore`/`consentBlock`/`codeFor`/`Interview`.
- The kanban `stage` (Application) is DISTINCT from the Jobseeker `stage` (MatchReady/etc.) used by `candidateScore` — do not conflate them.
- The stage PATCH must NOT set `decision` — only `stage` (a pure-pool candidate's created Application has `decision:null`).
- Identity is loaded only for consent-granted candidates (batch in `getBoard`, single lookup in `setStage`).
- `Date.now()`/`new Date()` fine in client + server code.
- Known stubs (from the spec): offer stages are labels only (Slice 9); no feedback/scorecards; buttons not drag-and-drop; the board does not mutate decision/consent/interview; whole pool renders (Recommended may be large).
