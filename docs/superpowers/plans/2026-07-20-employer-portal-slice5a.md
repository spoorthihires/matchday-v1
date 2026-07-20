# Employer Portal — Slice 5a: Candidates + Passport (the `Application` backbone) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an employer a **masked** candidate pool + candidate passport for a drive they have an Approved registration for, with a decision (Shortlist/Hold/Reject) + private notes persisted as the net-new `Application` entity — identity never leaves the server.

**Architecture:** New `Application` model (sparse: created only on a decision/note). The candidate list is derived on read (eligible ∩ Match-Ready jobseekers, reusing `isEligible` + `MATCH_READY_STAGES`), passed through a **redacted** projection (candidate `code`, never name/email) with a **derived** match score, LEFT-joined with this employer's `Application` rows. Four endpoints on the existing `/employer` gate (logic in a focused `employerCandidates.*` module); two client pages (list + passport) reached from a gated drive-detail CTA.

**Tech Stack:** Server — Express 4, Mongoose 8, zod, TS strict, ESM (`.js` suffixes), vitest + supertest. Client — React 18, Vite, react-router-dom 6, @tanstack/react-query 5, vitest + @testing-library/react.

## Global Constraints

- ESM everywhere: `.js` import suffixes even for `.ts`. TS strict; `tsc --noEmit` clean (server + client).
- Error contract `{ error: { message, code } }`. zod → `400 validation`; `requireRole` → `403`; no token → `401`; a jobseeker outside the drive's pool / bad id / another employer's data → `404 not_found` (no enumeration oracle); missing approved registration → `400 registration_not_approved`.
- **PII masking is the security crux:** the candidate/passport projection must NEVER contain `name`, `email`, `passwordHash`, phone, institute name, or institute city. Only the redacted fields listed below. `employerId` on `Application` is server-set from `req.userId` (JWT `sub`), never the body.
- **Identity stays masked in 5a** — there is NO reveal. Reveal/consent is Slice 5b.
- Derived-never-stored: the candidate pool and the match score are computed on read, never persisted. `Application` stores only `decision` + `notes`.
- Match score formula (documented, derived): `normCgpa = clamp(cgpa/10,0,1)`; `evalWeight = {completed:1, pending:.5, na:.3, failed:0}` (default `.3`); `stageWeight = {Joined:1, Offer:.9, Shortlisted:.8, MatchReady:.6}` (default `.5`); `matchScore = round(100·(0.5·normCgpa + 0.3·evalWeight + 0.2·stageWeight))`; `evalPill = matchScore ≥ 80 ? 'Strong' : 'Qualified'`.
- Gate reuse: every candidate endpoint requires `hasApprovedRegistration(employerId, driveId)` (from Slice 4) → else `400 registration_not_approved`.
- Client employer screens render INSIDE `EmployerShell` — no `.employer-app` re-wrap; `.err-msg` needs `.show-err` on its `.field` parent to show. Reuse the ported `.cand*`/`.pp-*` CSS — author no new CSS.
- Commit messages end with exactly: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Work only in `/Users/srinivasarao.kandula/code/matchday-employer5a` (branch `feat/employer-portal-slice5a`). Never `git checkout`/`switch`/`branch`, never run seed against / write to the shared `matchday` DB; E2E uses an isolated DB dropped after.
- Admin `jobseekers`/`seekerPortal` modules stay untouched (only a one-word `export` is added to `hasApprovedRegistration`).

## File Structure

**Server:**
- Create `server/src/models/Application.ts` — the new entity.
- Create `server/src/modules/employerPortal/employerCandidates.service.ts` — pool derivation, redaction, score, `listCandidates`/`getPassport`/`setDecision`/`addNote`.
- Create `server/src/modules/employerPortal/employerCandidates.schemas.ts` — zod for the query, decision, note.
- Create `server/src/modules/employerPortal/employerCandidates.controller.ts` — 4 controllers.
- Modify `server/src/modules/employerPortal/employerPortal.service.ts` — add `export` to `hasApprovedRegistration` (one word).
- Modify `server/src/modules/employerPortal/employerPortal.routes.ts` — register the 4 candidate routes.
- Create `server/test/Application.model.test.ts` (Task 1), `server/test/employer-candidates.route.test.ts` (Task 1 list; Task 2 extends with passport/decision/notes).

**Client:**
- Modify `client/src/types/employer.ts` — `EmployerCandidate`, `CandidatePassport`, `CandidateDecision`.
- Create `client/src/pages/EmployerPortal/hooks/useEmployerCandidates.ts` — `useEmployerCandidates`, `useCandidatePassport`, `useCandidateMutations`.
- Create `client/src/pages/EmployerPortal/EmployerCandidates.tsx` (Task 3), `client/src/pages/EmployerPortal/EmployerCandidatePassport.tsx` (Task 4).
- Modify `client/src/App.tsx` — two routes.
- Modify `client/src/pages/EmployerPortal/EmployerDriveDetail.tsx` — the gated "View candidates" CTA (Task 3).
- Modify `client/src/pages/EmployerPortal/EmployerShell.tsx` — repoint the "Candidates" nav (Task 3).
- Create `client/src/test/EmployerCandidates.test.tsx` (Task 3), `client/src/test/EmployerCandidatePassport.test.tsx` (Task 4); modify `client/src/test/EmployerDriveDetail.test.tsx` (Task 3, CTA).

---

### Task 1: Server — `Application` model + candidate pool/redaction/score + `GET candidates`

**Files:**
- Create: `server/src/models/Application.ts`
- Create: `server/src/modules/employerPortal/employerCandidates.service.ts`, `employerCandidates.schemas.ts`, `employerCandidates.controller.ts`
- Modify: `server/src/modules/employerPortal/employerPortal.service.ts` (export `hasApprovedRegistration`), `employerPortal.routes.ts` (one route)
- Test: `server/test/Application.model.test.ts`, `server/test/employer-candidates.route.test.ts`

**Interfaces:**
- Consumes: `isEligible` (`seekerPortal.service.ts`), `codeFor`/`evaluationLabel` (`jobseekers.service.ts`), `MATCH_READY_STAGES` (`constants/stages.ts`), `hasApprovedRegistration` (now exported from `employerPortal.service.ts`), models `Jobseeker`/`Drive`/`Institute`/`Employer`/`Application`.
- Produces (Task 2 + client rely on):
  - `Application` model (`{ employerId, driveId, jobseekerId, decision, notes[] }`, unique `(employerId,driveId,jobseekerId)`).
  - `interface RedactedCandidate { jobseekerId, code, branch, gradYear, source, cgpaBand, instituteCategory, evaluationStatus, evaluationLabel, stage, matchScore, evalPill, decision, noteCount }`.
  - `candidateScore(cgpa, evaluationStatus, stage) → { matchScore, factors:{normCgpa,evalW,stageW} }`, `cgpaBand(cgpa)`, `redactCandidate(seeker, instituteCategory, app?)`.
  - `listCandidates(employerId, driveId, filters:{q?,decision?,evaluation?}) → { items: RedactedCandidate[] }`.
  - `requirePoolMember(employerId, driveId, jobseekerId) → { drive, seeker }` (Task 2 reuses).
  - Route `GET /api/me/employer/drives/:id/candidates`.

- [ ] **Step 1: Write the `Application` model test**

Create `server/test/Application.model.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Application } from '../src/models/Application.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('Application model', () => {
  it('rejects a duplicate (employerId, driveId, jobseekerId)', async () => {
    const employerId = new Types.ObjectId(); const driveId = new Types.ObjectId(); const jobseekerId = new Types.ObjectId();
    await Application.create({ employerId, driveId, jobseekerId, decision: 'Shortlisted' });
    await expect(Application.create({ employerId, driveId, jobseekerId, decision: 'Hold' })).rejects.toThrow();
  });

  it('defaults decision to null and notes to []', async () => {
    const a = await Application.create({ employerId: new Types.ObjectId(), driveId: new Types.ObjectId(), jobseekerId: new Types.ObjectId() });
    expect(a.decision ?? null).toBeNull();
    expect(a.notes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -w server -- Application.model`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the `Application` model**

Create `server/src/models/Application.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const noteSchema = new Schema({
  text: { type: String, required: true },
  by: { type: String, default: '' },
  at: { type: Date, default: Date.now },
}, { _id: false });

// Net-new per-(employer × drive × candidate) join. Sparse: a row exists only
// once the employer acts on a candidate (a decision or a note). Later slices
// extend this same doc (consent sub-state → 5b, kanban stage → 8, offer → 9).
const applicationSchema = new Schema({
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true },
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  jobseekerId: { type: Schema.Types.ObjectId, ref: 'Jobseeker', required: true },
  decision: { type: String, enum: ['Shortlisted', 'Hold', 'Rejected'], default: null },
  notes: { type: [noteSchema], default: [] },
}, { timestamps: true });

applicationSchema.index({ employerId: 1, driveId: 1, jobseekerId: 1 }, { unique: true });

export type ApplicationDoc = InferSchemaType<typeof applicationSchema>;
export const Application = model('Application', applicationSchema);
```

- [ ] **Step 4: Run the model test — verify it passes**

Run: `npm test -w server -- Application.model`
Expected: PASS.

- [ ] **Step 5: Export `hasApprovedRegistration`**

In `server/src/modules/employerPortal/employerPortal.service.ts`, change the existing `async function hasApprovedRegistration(` to `export async function hasApprovedRegistration(` (only that line).

- [ ] **Step 6: Write the failing candidate-list route test**

Create `server/test/employer-candidates.route.test.ts`:

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

describe('GET /api/me/employer/drives/:id/candidates', () => {
  it('returns a redacted pool (no name/email) of eligible + Match-Ready jobseekers', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    await seeker(inst._id);                                   // eligible + MatchReady → included
    await seeker(inst._id, { email: 'b@x.test', branch: 'ECE' });   // not eligible (branch) → excluded
    await seeker(inst._id, { email: 'c@x.test', stage: 'Applied' }); // not Match-Ready → excluded
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const c = res.body.items[0];
    expect(c).not.toHaveProperty('name');
    expect(c).not.toHaveProperty('email');
    expect(c.code).toMatch(/^C-/);
    expect(c.instituteCategory).toBe('Tier-1');   // Institute.type, NOT its name/city
    expect(c.matchScore).toBe(82);                // cgpa8/completed/MatchReady → 100*(.5*.8+.3*1+.2*.6)
    expect(c.evalPill).toBe('Strong');
    expect(c.decision).toBeNull();
  });

  it('rejects without an approved registration (Pending does not unlock)', async () => {
    const emp = await employer(); const d = await drive();
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: 'D', role: 'R', status: 'Pending review', activity: [] });
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('registration_not_approved');
  });

  it('sorts by matchScore desc and filters by evaluation', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    await seeker(inst._id, { email: 's1@x.test', cgpa: 9, evaluationStatus: 'completed', stage: 'Shortlisted' }); // high
    await seeker(inst._id, { email: 's2@x.test', cgpa: 6, evaluationStatus: 'pending', stage: 'MatchReady' });     // low → Qualified
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.body.items[0].matchScore).toBeGreaterThanOrEqual(res.body.items[1].matchScore);
    const q = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates?evaluation=Qualified`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(q.body.items.every((c: { evalPill: string }) => c.evalPill === 'Qualified')).toBe(true);
  });

  it('401 no token, 403 admin token', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/candidates`)).status).toBe(401);
    const adminTok = signToken({ sub: String(emp._id), role: 'admin' });
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${adminTok}`)).status).toBe(403);
  });
});
```

- [ ] **Step 7: Run it — verify it fails**

Run: `npm test -w server -- employer-candidates`
Expected: FAIL (route/module missing).

- [ ] **Step 8: Create the schemas**

Create `server/src/modules/employerPortal/employerCandidates.schemas.ts`:

```ts
import { z } from 'zod';

export const candidatesQuerySchema = z.object({
  q: z.string().optional(),
  decision: z.enum(['Shortlisted', 'Hold', 'Rejected', 'undecided']).optional(),
  evaluation: z.enum(['Strong', 'Qualified']).optional(),
});
export const decisionSchema = z.object({ decision: z.enum(['Shortlisted', 'Hold', 'Rejected']).nullable() });
export const noteInputSchema = z.object({ text: z.string().trim().min(1) });

export type CandidatesQuery = z.infer<typeof candidatesQuerySchema>;
```

- [ ] **Step 9: Create the service (helpers + `listCandidates` + `requirePoolMember`)**

Create `server/src/modules/employerPortal/employerCandidates.service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Institute } from '../../models/Institute.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Application } from '../../models/Application.js';
import { MATCH_READY_STAGES, MATCH_READY_STAGE_SET } from '../../constants/stages.js';
import { isEligible } from '../seekerPortal/seekerPortal.service.js';
import { codeFor, evaluationLabel } from '../jobseekers/jobseekers.service.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import type { CandidatesQuery } from './employerCandidates.schemas.js';

interface DriveLean { _id: Types.ObjectId; eligibility?: { branches?: string[]; gradYears?: number[]; sources?: string[] } }
interface SeekerLean { _id: Types.ObjectId; instituteId: Types.ObjectId; branch: string; gradYear: number; cgpa: number; source: string; evaluationStatus: string; stage: string }

export interface RedactedCandidate {
  jobseekerId: string; code: string;
  branch: string; gradYear: number; source: string;
  cgpaBand: string; instituteCategory: string;
  evaluationStatus: string; evaluationLabel: string; stage: string;
  matchScore: number; evalPill: 'Strong' | 'Qualified';
  decision: 'Shortlisted' | 'Hold' | 'Rejected' | null; noteCount: number;
}

const EVAL_WEIGHT: Record<string, number> = { completed: 1, pending: 0.5, na: 0.3, failed: 0 };
const STAGE_WEIGHT: Record<string, number> = { Joined: 1, Offer: 0.9, Shortlisted: 0.8, MatchReady: 0.6 };

export function candidateScore(cgpa: number, evaluationStatus: string, stage: string) {
  const normCgpa = Math.max(0, Math.min(1, (cgpa ?? 0) / 10));
  const evalW = EVAL_WEIGHT[evaluationStatus] ?? 0.3;
  const stageW = STAGE_WEIGHT[stage] ?? 0.5;
  const matchScore = Math.round(100 * (0.5 * normCgpa + 0.3 * evalW + 0.2 * stageW));
  return { matchScore, factors: { normCgpa, evalW, stageW } };
}
export function cgpaBand(cgpa: number): string {
  const lo = Math.floor((cgpa ?? 0) * 2) / 2;
  return `${lo.toFixed(1)}–${(lo + 0.5).toFixed(1)}`;
}
function redactCandidate(s: SeekerLean, instituteCategory: string, app?: { decision?: string | null; notes?: unknown[] } | null): RedactedCandidate {
  const { matchScore } = candidateScore(s.cgpa, s.evaluationStatus, s.stage);
  return {
    jobseekerId: String(s._id), code: codeFor(s._id),
    branch: s.branch, gradYear: s.gradYear, source: s.source,
    cgpaBand: cgpaBand(s.cgpa), instituteCategory,
    evaluationStatus: s.evaluationStatus, evaluationLabel: evaluationLabel(s.evaluationStatus), stage: s.stage,
    matchScore, evalPill: matchScore >= 80 ? 'Strong' : 'Qualified',
    decision: (app?.decision as RedactedCandidate['decision']) ?? null, noteCount: app?.notes?.length ?? 0,
  };
}

async function poolSeekers(drive: DriveLean): Promise<SeekerLean[]> {
  const seekers = await Jobseeker.find({ stage: { $in: MATCH_READY_STAGES } })
    .select('instituteId branch gradYear cgpa source evaluationStatus stage').lean<SeekerLean[]>();
  return seekers.filter((s) => isEligible(drive.eligibility, { branch: s.branch, gradYear: s.gradYear, source: s.source }));
}

export async function listCandidates(employerId: string, driveId: string, filters: CandidatesQuery) {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive to view candidates', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean<DriveLean>();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  const pool = await poolSeekers(drive);
  const instIds = [...new Set(pool.map((s) => String(s.instituteId)))];
  const insts = await Institute.find({ _id: { $in: instIds } }).select('type').lean<{ _id: Types.ObjectId; type?: string }[]>();
  const instType = new Map(insts.map((i) => [String(i._id), i.type ?? '—']));
  const apps = await Application.find({ employerId, driveId, jobseekerId: { $in: pool.map((s) => s._id) } }).lean();
  const appByJs = new Map(apps.map((a) => [String(a.jobseekerId), a]));
  let items = pool.map((s) => redactCandidate(s, instType.get(String(s.instituteId)) ?? '—', appByJs.get(String(s._id))));
  if (filters.evaluation) items = items.filter((c) => c.evalPill === filters.evaluation);
  if (filters.decision) items = items.filter((c) => (filters.decision === 'undecided' ? c.decision === null : c.decision === filters.decision));
  if (filters.q && filters.q.trim()) {
    const rx = new RegExp(filters.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    items = items.filter((c) => rx.test(c.code) || rx.test(c.branch));
  }
  items.sort((a, b) => b.matchScore - a.matchScore);
  return { items };
}

// Reused by Task 2 (passport/decision/notes): gate + pool membership. 404 for a
// jobseeker outside this drive's eligible∩Match-Ready pool — indistinguishable
// from a bad id (no enumeration oracle).
export async function requirePoolMember(employerId: string, driveId: string, jobseekerId: string): Promise<{ drive: DriveLean; seeker: SeekerLean }> {
  if (!Types.ObjectId.isValid(driveId) || !Types.ObjectId.isValid(jobseekerId)) throw new HttpError(404, 'Candidate not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive to view candidates', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean<DriveLean>();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
  const seeker = await Jobseeker.findById(jobseekerId)
    .select('instituteId branch gradYear cgpa source evaluationStatus stage').lean<SeekerLean>();
  if (!seeker || !MATCH_READY_STAGE_SET.has(seeker.stage)
    || !isEligible(drive.eligibility, { branch: seeker.branch, gradYear: seeker.gradYear, source: seeker.source })) {
    throw new HttpError(404, 'Candidate not found', 'not_found');
  }
  return { drive, seeker };
}

export { redactCandidate };
```

- [ ] **Step 10: Create the controller (list only for now) + register the route**

Create `server/src/modules/employerPortal/employerCandidates.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { candidatesQuerySchema } from './employerCandidates.schemas.js';
import { listCandidates } from './employerCandidates.service.js';

export async function candidatesController(req: Request, res: Response) {
  res.json(await listCandidates(req.userId as string, req.params.id, candidatesQuerySchema.parse(req.query)));
}
```

In `server/src/modules/employerPortal/employerPortal.routes.ts`, add the import and the route (after the slot routes):
```ts
import { candidatesController } from './employerCandidates.controller.js';
// ...
employerPortalRoutes.get('/employer/drives/:id/candidates', asyncHandler(candidatesController));
```

- [ ] **Step 11: Run tests — verify green + type-check**

Run: `npm test -w server -- employer-candidates Application.model` → PASS.
Run: `npx -w server tsc --noEmit` → clean.

- [ ] **Step 12: Commit**

```bash
git add server/src/models/Application.ts server/src/modules/employerPortal server/test/Application.model.test.ts server/test/employer-candidates.route.test.ts
git commit -m "feat(server): Application entity + redacted candidate pool + list endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server — passport + decision + notes (the `Application` write path)

**Files:**
- Modify: `server/src/modules/employerPortal/employerCandidates.service.ts` (add `getPassport`, `setDecision`, `addNote`)
- Modify: `server/src/modules/employerPortal/employerCandidates.controller.ts` (3 controllers)
- Modify: `server/src/modules/employerPortal/employerPortal.routes.ts` (3 routes)
- Test: `server/test/employer-candidates.route.test.ts` (extend)

**Interfaces:**
- Consumes: Task-1 `requirePoolMember`, `redactCandidate`, `candidateScore`, the `Application` model, `Employer` (for the note author), `Institute`.
- Produces:
  - `getPassport(employerId, driveId, jobseekerId) → RedactedCandidate & { factors, notes[] }`.
  - `setDecision(employerId, driveId, jobseekerId, decision) → RedactedCandidate`.
  - `addNote(employerId, driveId, jobseekerId, text) → passport`.
  - Routes `GET .../candidates/:jobseekerId`, `PUT .../candidates/:jobseekerId/decision`, `POST .../candidates/:jobseekerId/notes`.

- [ ] **Step 1: Write the failing tests (append to `server/test/employer-candidates.route.test.ts`)**

Add `import { Application } from '../src/models/Application.js';` at the top, then append:

```ts
async function poolSeekerId(instId: unknown) {
  const s = await seeker(instId);
  return String(s._id);
}

describe('GET .../candidates/:jobseekerId (passport)', () => {
  it('returns the redacted passport with factor breakdown + notes', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates/${jsId}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('name');
    expect(res.body.code).toMatch(/^C-/);
    expect(res.body.factors.cgpa.weight).toBe(0.5);
    expect(Array.isArray(res.body.notes)).toBe(true);
  });

  it('404 for a jobseeker not in the pool (Applied stage)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id, { stage: 'Applied' });
    const res = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates/${s._id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('PUT .../candidates/:jobseekerId/decision', () => {
  it('upserts an Application and is employer-scoped', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const app = createApp();
    const put = await request(app).put(`/api/me/employer/drives/${d._id}/candidates/${jsId}/decision`).set('Authorization', `Bearer ${tokenFor(a)}`).send({ decision: 'Shortlisted' });
    expect(put.status).toBe(200);
    expect(put.body.decision).toBe('Shortlisted');
    expect(await Application.countDocuments({ employerId: a._id, driveId: d._id, jobseekerId: jsId })).toBe(1);
    // employer B sees NO decision on the same candidate
    const bList = await request(app).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(bList.body.items.find((c: { jobseekerId: string }) => c.jobseekerId === jsId).decision).toBeNull();
  });

  it('clearing the decision to null with no notes deletes the row', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const app = createApp();
    await request(app).put(`/api/me/employer/drives/${d._id}/candidates/${jsId}/decision`).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ decision: 'Hold' });
    await request(app).put(`/api/me/employer/drives/${d._id}/candidates/${jsId}/decision`).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ decision: null });
    expect(await Application.countDocuments({ employerId: emp._id, driveId: d._id, jobseekerId: jsId })).toBe(0);
  });
});

describe('POST .../candidates/:jobseekerId/notes', () => {
  it('appends a private note visible only to that employer', async () => {
    const a = await employer(); const b = await employer({ email: 'b2@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const app = createApp();
    const note = await request(app).post(`/api/me/employer/drives/${d._id}/candidates/${jsId}/notes`).set('Authorization', `Bearer ${tokenFor(a)}`).send({ text: 'Strong SQL' });
    expect(note.status).toBe(200);
    expect(note.body.notes[0].text).toBe('Strong SQL');
    expect(note.body.notes[0].by).toBe('Jane'); // employer spoc
    const bPass = await request(app).get(`/api/me/employer/drives/${d._id}/candidates/${jsId}`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(bPass.body.notes).toHaveLength(0);
  });

  it('rejects an empty note (400)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const jsId = await poolSeekerId(inst._id);
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/${jsId}/notes`).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ text: '' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — verify the new describes fail**

Run: `npm test -w server -- employer-candidates`
Expected: FAIL on the passport/decision/notes describes; Task-1 cases still pass.

- [ ] **Step 3: Add `getPassport`/`setDecision`/`addNote` to the service**

Append to `server/src/modules/employerPortal/employerCandidates.service.ts` (add `Employer` to the imports):

```ts
// add: import { Employer } from '../../models/Employer.js';

export async function getPassport(employerId: string, driveId: string, jobseekerId: string) {
  const { seeker } = await requirePoolMember(employerId, driveId, jobseekerId);
  const inst = await Institute.findById(seeker.instituteId).select('type').lean<{ type?: string }>();
  const app = await Application.findOne({ employerId, driveId, jobseekerId }).lean();
  const base = redactCandidate(seeker, inst?.type ?? '—', app);
  const { factors } = candidateScore(seeker.cgpa, seeker.evaluationStatus, seeker.stage);
  return {
    ...base,
    factors: {
      cgpa: { weight: 0.5, value: factors.normCgpa, contribution: Math.round(100 * 0.5 * factors.normCgpa) },
      evaluation: { weight: 0.3, value: factors.evalW, contribution: Math.round(100 * 0.3 * factors.evalW) },
      stage: { weight: 0.2, value: factors.stageW, contribution: Math.round(100 * 0.2 * factors.stageW) },
    },
    notes: (app?.notes ?? []).map((n: { text: string; by?: string; at: Date }) => ({ text: n.text, by: n.by ?? '', at: new Date(n.at).toISOString() })),
  };
}

export async function setDecision(employerId: string, driveId: string, jobseekerId: string, decision: 'Shortlisted' | 'Hold' | 'Rejected' | null) {
  const { seeker } = await requirePoolMember(employerId, driveId, jobseekerId);
  if (decision === null) {
    const existing = await Application.findOne({ employerId, driveId, jobseekerId });
    if (existing && (existing.notes?.length ?? 0) === 0) await existing.deleteOne();
    else if (existing) { existing.decision = null; await existing.save(); }
  } else {
    await Application.findOneAndUpdate(
      { employerId, driveId, jobseekerId },
      { $set: { decision }, $setOnInsert: { employerId, driveId, jobseekerId } },
      { upsert: true, new: true },
    );
  }
  const app = await Application.findOne({ employerId, driveId, jobseekerId }).lean();
  const inst = await Institute.findById(seeker.instituteId).select('type').lean<{ type?: string }>();
  return redactCandidate(seeker, inst?.type ?? '—', app);
}

export async function addNote(employerId: string, driveId: string, jobseekerId: string, text: string) {
  await requirePoolMember(employerId, driveId, jobseekerId);
  const emp = await Employer.findById(employerId).select('spoc name').lean<{ spoc?: string; name?: string }>();
  const by = emp?.spoc || emp?.name || 'Employer';
  await Application.findOneAndUpdate(
    { employerId, driveId, jobseekerId },
    { $push: { notes: { text, by, at: new Date() } }, $setOnInsert: { employerId, driveId, jobseekerId } },
    { upsert: true, new: true },
  );
  return getPassport(employerId, driveId, jobseekerId);
}
```

- [ ] **Step 4: Add the 3 controllers**

In `server/src/modules/employerPortal/employerCandidates.controller.ts` (extend imports with `decisionSchema, noteInputSchema` and `getPassport, setDecision, addNote`):

```ts
export async function passportController(req: Request, res: Response) {
  res.json(await getPassport(req.userId as string, req.params.id, req.params.jobseekerId));
}
export async function decisionController(req: Request, res: Response) {
  const { decision } = decisionSchema.parse(req.body);
  res.json(await setDecision(req.userId as string, req.params.id, req.params.jobseekerId, decision));
}
export async function noteController(req: Request, res: Response) {
  const { text } = noteInputSchema.parse(req.body);
  res.json(await addNote(req.userId as string, req.params.id, req.params.jobseekerId, text));
}
```

- [ ] **Step 5: Add the 3 routes**

In `server/src/modules/employerPortal/employerPortal.routes.ts` (extend the candidate-controller import):

```ts
employerPortalRoutes.get('/employer/drives/:id/candidates/:jobseekerId', asyncHandler(passportController));
employerPortalRoutes.put('/employer/drives/:id/candidates/:jobseekerId/decision', asyncHandler(decisionController));
employerPortalRoutes.post('/employer/drives/:id/candidates/:jobseekerId/notes', asyncHandler(noteController));
```

- [ ] **Step 6: Run tests + full server suite + type-check**

Run: `npm test -w server -- employer-candidates` → PASS.
Run: `npm test -w server` → all green (jobseekers/seeker/slots/registrations untouched).
Run: `npx -w server tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/employerPortal server/test/employer-candidates.route.test.ts
git commit -m "feat(server): candidate passport + decision + notes (Application write path)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Client — types + hooks + `EmployerCandidates` list + CTA + nav

**Files:**
- Modify: `client/src/types/employer.ts`
- Create: `client/src/pages/EmployerPortal/hooks/useEmployerCandidates.ts`
- Create: `client/src/pages/EmployerPortal/EmployerCandidates.tsx`
- Modify: `client/src/App.tsx`, `client/src/pages/EmployerPortal/EmployerDriveDetail.tsx`, `client/src/pages/EmployerPortal/EmployerShell.tsx`
- Test: `client/src/test/EmployerCandidates.test.tsx` (create), `client/src/test/EmployerDriveDetail.test.tsx` (update)

**Interfaces:**
- Consumes: `GET /me/employer/drives/:id/candidates` (`{items}`), `PUT .../candidates/:jsId/decision`, `apiFetch`, `useAuth().token`, `useEmployerRegistrations()` (for the CTA gate).
- Produces: `EmployerCandidate`/`CandidateDecision` types; `useEmployerCandidates`/`useCandidateMutations`; the list page + route; the gated CTA; the nav repoint.

- [ ] **Step 1: Add the types**

Append to `client/src/types/employer.ts`:

```ts
export type CandidateDecision = 'Shortlisted' | 'Hold' | 'Rejected' | null;

// Mirrors server RedactedCandidate (Slice 5a) — NO name/email (identity masked).
export interface EmployerCandidate {
  jobseekerId: string;
  code: string;
  branch: string;
  gradYear: number;
  source: string;
  cgpaBand: string;
  instituteCategory: string;
  evaluationStatus: string;
  evaluationLabel: string;
  stage: string;
  matchScore: number;
  evalPill: 'Strong' | 'Qualified';
  decision: CandidateDecision;
  noteCount: number;
}
export interface EmployerCandidatesResponse { items: EmployerCandidate[]; }

export interface CandidatePassportFactors {
  cgpa: { weight: number; value: number; contribution: number };
  evaluation: { weight: number; value: number; contribution: number };
  stage: { weight: number; value: number; contribution: number };
}
export interface CandidateNote { text: string; by: string; at: string; }
export interface CandidatePassport extends EmployerCandidate {
  factors: CandidatePassportFactors;
  notes: CandidateNote[];
}
```

- [ ] **Step 2: Add the hooks**

Create `client/src/pages/EmployerPortal/hooks/useEmployerCandidates.ts`:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { CandidateDecision, CandidatePassport, EmployerCandidate, EmployerCandidatesResponse } from '../../../types/employer.js';

export interface CandidateFilters { q?: string; decision?: string; evaluation?: string; }

export function useEmployerCandidates(driveId: string, filters: CandidateFilters) {
  const { token } = useAuth();
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString();
  return useQuery({
    queryKey: ['employer-candidates', driveId, filters.q ?? '', filters.decision ?? '', filters.evaluation ?? ''],
    queryFn: () => apiFetch<EmployerCandidatesResponse>(`/me/employer/drives/${driveId}/candidates${qs ? `?${qs}` : ''}`, { token }),
    enabled: !!token && !!driveId,
    placeholderData: keepPreviousData,
  });
}

export function useCandidatePassport(driveId: string, jobseekerId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['candidate-passport', driveId, jobseekerId],
    queryFn: () => apiFetch<CandidatePassport>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}`, { token }),
    enabled: !!token && !!driveId && !!jobseekerId,
  });
}

export function useCandidateMutations(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = (jobseekerId: string) => {
    qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
    qc.invalidateQueries({ queryKey: ['candidate-passport', driveId, jobseekerId] });
    qc.invalidateQueries({ queryKey: ['employer-portal'] });
  };
  const setDecision = useMutation({
    mutationFn: ({ jobseekerId, decision }: { jobseekerId: string; decision: CandidateDecision }) =>
      apiFetch<EmployerCandidate>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}/decision`, { method: 'PUT', body: { decision }, token }),
    onSuccess: (_d, v) => invalidate(v.jobseekerId),
  });
  const addNote = useMutation({
    mutationFn: ({ jobseekerId, text }: { jobseekerId: string; text: string }) =>
      apiFetch<CandidatePassport>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}/notes`, { method: 'POST', body: { text }, token }),
    onSuccess: (_d, v) => invalidate(v.jobseekerId),
  });
  return { setDecision, addNote };
}
```

- [ ] **Step 3: Write the failing list test**

Create `client/src/test/EmployerCandidates.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerCandidates } from '../pages/EmployerPortal/EmployerCandidates.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const CAND = {
  jobseekerId: 'j1', code: 'C-ABC123', branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5',
  instituteCategory: 'Tier-1', evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady',
  matchScore: 82, evalPill: 'Strong', decision: null, noteCount: 0,
};
function mockFetch(items: unknown[]) {
  const put = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/candidates\/[^/]+\/decision$/) && method === 'PUT') {
      put(url, JSON.parse(opts.body as string));
      return { ok: true, status: 200, json: async () => ({ ...CAND, decision: 'Shortlisted' }) };
    }
    if (url.includes('/candidates')) return { ok: true, status: 200, json: async () => ({ items }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { put };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/candidates']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/candidates" element={<EmployerCandidates />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerCandidates', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders masked candidate rows (code, no name)', async () => {
    seedAuth(); mockFetch([CAND]); renderPage();
    await waitFor(() => expect(screen.getByText('C-ABC123')).toBeInTheDocument());
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.queryByText(/Real Name/)).toBeNull();
  });

  it('fires the decision mutation on Shortlist', async () => {
    seedAuth(); const { put } = mockFetch([CAND]); renderPage();
    await waitFor(() => expect(screen.getByText('C-ABC123')).toBeInTheDocument());
    const row = screen.getByText('C-ABC123').closest('.cand-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Shortlist/i }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1]).toEqual({ decision: 'Shortlisted' });
  });

  it('shows the empty state', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/No candidates/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `npm test -w client -- EmployerCandidates`
Expected: FAIL (page missing).

- [ ] **Step 5: Build the `EmployerCandidates` page**

Create `client/src/pages/EmployerPortal/EmployerCandidates.tsx` (inside the shell — `.page-wrap`, no `.employer-app`). Uses the ported `.cand*` CSS; marker classes (`.cand-row`) carry inline layout where a CSS rule is absent:

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerCandidates, useCandidateMutations, type CandidateFilters } from './hooks/useEmployerCandidates.js';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import type { CandidateDecision, EmployerCandidate } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

const DECISIONS: { key: string; label: string }[] = [
  { key: '', label: 'All' }, { key: 'undecided', label: 'Undecided' },
  { key: 'Shortlisted', label: 'Shortlisted' }, { key: 'Hold', label: 'Hold' }, { key: 'Rejected', label: 'Rejected' },
];
function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

export function EmployerCandidates() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const drive = useEmployerDrive(driveId);
  const [filters, setFilters] = useState<CandidateFilters>({ q: '', decision: '', evaluation: '' });
  const candidates = useEmployerCandidates(driveId, filters);
  const { setDecision } = useCandidateMutations(driveId);
  const items = candidates.data?.items ?? [];

  const decide = (c: EmployerCandidate, decision: CandidateDecision) =>
    setDecision.mutate({ jobseekerId: c.jobseekerId, decision: c.decision === decision ? null : decision });

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to drive
      </button>
      <div className="card">
        <h2>Candidates — {drive.data?.name ?? '…'}</h2>
        <p className="cand-privacy hint">Names, contact details and resumes stay hidden. Identity is only revealed after a shortlisted candidate confirms interest.</p>
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" placeholder="Search by code or branch" value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} style={{ maxWidth: 260 }} />
        <select className="select" value={filters.evaluation} onChange={(e) => setFilters((f) => ({ ...f, evaluation: e.target.value }))} style={{ maxWidth: 160 }}>
          <option value="">All evaluations</option><option value="Strong">Strong</option><option value="Qualified">Qualified</option>
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          {DECISIONS.map((d) => (
            <button key={d.key} type="button" className={`chip${filters.decision === d.key ? ' on' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, decision: d.key }))}>{d.label}</button>
          ))}
        </div>
      </div>

      <div className="card">
        {candidates.isLoading ? <p className="hint">Loading candidates…</p>
          : candidates.isError ? <p className="hint">{errMsg(candidates.error)}</p>
          : items.length === 0 ? <p className="cand-empty hint">No candidates match yet.</p>
          : (
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((c) => (
                <div className="cand-row" key={c.jobseekerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="match-ring" title="Match score">{c.matchScore}</span>
                    <div>
                      <div className="fv">{c.code} <span className={`status-pill ${c.evalPill === 'Strong' ? 'st-approved' : 'st-inprog'}`}>{c.evalPill}</span></div>
                      <div className="fl">{c.branch} · {c.gradYear} · CGPA {c.cgpaBand} · {c.instituteCategory} · {c.evaluationLabel} · {c.stage}{c.decision ? ` · ${c.decision}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/candidates/${c.jobseekerId}`)}>Passport</button>
                    <button type="button" className={`btn ${c.decision === 'Shortlisted' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide(c, 'Shortlisted')}>Shortlist</button>
                    <button type="button" className="btn btn-ghost" onClick={() => decide(c, 'Hold')}>Hold</button>
                    <button type="button" className="btn btn-ghost" onClick={() => decide(c, 'Rejected')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
```

(If `.chip`/`.match-ring` styling differs from expectation it's cosmetic — the classes exist in `employer.css`; do not author new CSS.)

- [ ] **Step 6: Run the list test — verify it passes**

Run: `npm test -w client -- EmployerCandidates`
Expected: PASS.

- [ ] **Step 7: Add the route + gated CTA + nav repoint**

In `client/src/App.tsx`, add the import and route (near the other drive sub-routes):
```tsx
import { EmployerCandidates } from './pages/EmployerPortal/EmployerCandidates.js';
// ...
<Route path="/employer/drives/:id/candidates" element={<RoleRoute role="employer"><EmployerShell><EmployerCandidates /></EmployerShell></RoleRoute>} />
```

In `client/src/pages/EmployerPortal/EmployerDriveDetail.tsx`, the `useEmployerRegistrations()` hook + `approvedForDrive` derivation already exist (Slice 4). Add a "View candidates" button next to "View slots", identically gated:
```tsx
<button
  type="button"
  className="btn btn-ghost"
  disabled={!approvedForDrive}
  title={approvedForDrive ? undefined : 'Available once your registration is approved'}
  onClick={() => navigate(`/employer/drives/${id}/candidates`)}
>
  View candidates
</button>
```

In `client/src/pages/EmployerPortal/EmployerShell.tsx`, the "Candidates" nav item currently points at `/employer/coming-soon/candidates`; repoint it to `/employer/drives` (candidates are viewed per-drive — the user picks a drive first). Change only that item's path; keep its label/icon.

- [ ] **Step 8: Update the drive-detail test**

In `client/src/test/EmployerDriveDetail.test.tsx`: the page already mocks `/me/employer/registrations`. Add an assertion that "View candidates" is disabled without an Approved registration and enabled with one (mirror the existing "View slots" CTA assertions). Keep all existing assertions green.

- [ ] **Step 9: Full client suite + type-check + commit**

Run: `npm test -w client -- EmployerCandidates` → PASS.
Run: `npm test -w client` → all green.
Run: `npx -w client tsc --noEmit` → clean.
```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal client/src/App.tsx client/src/test/EmployerCandidates.test.tsx client/src/test/EmployerDriveDetail.test.tsx
git commit -m "feat(client): employer candidates list + gated View-candidates CTA + nav

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Client — `EmployerCandidatePassport` page

**Files:**
- Create: `client/src/pages/EmployerPortal/EmployerCandidatePassport.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/src/test/EmployerCandidatePassport.test.tsx`

**Interfaces:**
- Consumes: `useCandidatePassport(driveId, jobseekerId)`, `useCandidateMutations(driveId)` (setDecision/addNote), the `CandidatePassport` type.
- Produces: the passport page + its route.

- [ ] **Step 1: Write the failing passport test**

Create `client/src/test/EmployerCandidatePassport.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerCandidatePassport } from '../pages/EmployerPortal/EmployerCandidatePassport.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const PASSPORT = {
  jobseekerId: 'j1', code: 'C-ABC123', branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5',
  instituteCategory: 'Tier-1', evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady',
  matchScore: 82, evalPill: 'Strong', decision: null, noteCount: 0,
  factors: { cgpa: { weight: 0.5, value: 0.8, contribution: 40 }, evaluation: { weight: 0.3, value: 1, contribution: 30 }, stage: { weight: 0.2, value: 0.6, contribution: 12 } },
  notes: [],
};
function mockFetch() {
  const post = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/notes$/) && method === 'POST') {
      post(JSON.parse(opts.body as string));
      return { ok: true, status: 200, json: async () => ({ ...PASSPORT, notes: [{ text: JSON.parse(opts.body as string).text, by: 'Jane', at: '2026-07-20T00:00:00.000Z' }] }) };
    }
    if (url.match(/\/candidates\/[^/]+$/)) return { ok: true, status: 200, json: async () => PASSPORT };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { post };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/candidates/j1']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/candidates/:jobseekerId" element={<EmployerCandidatePassport />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerCandidatePassport', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders the redacted passport with the score breakdown', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('C-ABC123')).toBeInTheDocument());
    expect(screen.getByText(/Identity hidden/i)).toBeInTheDocument();
    expect(screen.queryByText(/Real Name/)).toBeNull();
    expect(screen.getByText('CSE')).toBeInTheDocument();
    expect(screen.getByText(/40/)).toBeInTheDocument(); // cgpa factor contribution
  });

  it('adds a note', async () => {
    seedAuth(); const { post } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByPlaceholderText(/note/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: 'Strong SQL' } });
    fireEvent.click(screen.getByRole('button', { name: /Add note/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ text: 'Strong SQL' }));
  });

  it('blocks an empty note with show-err', async () => {
    seedAuth(); const { post } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Add note/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add note/i }));
    const field = screen.getByPlaceholderText(/note/i).closest('.field') as HTMLElement;
    await waitFor(() => expect(field).toHaveClass('show-err'));
    expect(post).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npm test -w client -- EmployerCandidatePassport`
Expected: FAIL (page missing).

- [ ] **Step 3: Build the passport page**

Create `client/src/pages/EmployerPortal/EmployerCandidatePassport.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCandidatePassport, useCandidateMutations } from './hooks/useEmployerCandidates.js';
import type { CandidateDecision } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

export function EmployerCandidatePassport() {
  const { id, jobseekerId } = useParams();
  const driveId = id!;
  const jsId = jobseekerId!;
  const navigate = useNavigate();
  const passport = useCandidatePassport(driveId, jsId);
  const { setDecision, addNote } = useCandidateMutations(driveId);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState(false);
  const p = passport.data;

  const decide = (decision: CandidateDecision) =>
    setDecision.mutate({ jobseekerId: jsId, decision: p?.decision === decision ? null : decision });
  const submitNote = () => {
    if (!note.trim()) { setNoteErr(true); return; }
    setNoteErr(false);
    addNote.mutate({ jobseekerId: jsId, text: note.trim() }, { onSuccess: () => setNote('') });
  };

  if (passport.isLoading) return <div className="page-wrap"><div className="card" style={{ padding: 20 }}>Loading passport…</div></div>;
  if (passport.isError || !p) return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>← Back to candidates</button>
      <div className="card" style={{ padding: 20 }}><h3>Candidate not found</h3><p className="hint">This candidate isn&apos;t in this drive&apos;s pool.</p></div>
    </div>
  );

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to candidates
      </button>

      <div className="card pp-head">
        <div className="ps-anon">
          <h1>{p.code} <span className={`status-pill ${p.evalPill === 'Strong' ? 'st-approved' : 'st-inprog'}`}>{p.evalPill}</span></h1>
          <p className="hint">Identity hidden — redacted passport. Match score {p.matchScore}.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Facts</h3></div>
        <div className="card-body">
          <div className="pp-facts dd-facts">
            <div className="fact"><div><div className="fv">{p.branch}</div><div className="fl">Branch</div></div></div>
            <div className="fact"><div><div className="fv">{p.gradYear}</div><div className="fl">Grad year</div></div></div>
            <div className="fact"><div><div className="fv">{p.cgpaBand}</div><div className="fl">CGPA band</div></div></div>
            <div className="fact"><div><div className="fv">{p.source}</div><div className="fl">Source</div></div></div>
            <div className="fact"><div><div className="fv">{p.instituteCategory}</div><div className="fl">Institute (name hidden)</div></div></div>
            <div className="fact"><div><div className="fv">{p.evaluationLabel}</div><div className="fl">Evaluation</div></div></div>
            <div className="fact"><div><div className="fv">{p.stage}</div><div className="fl">Stage</div></div></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Match score — {p.matchScore}</h3></div>
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          {([['CGPA', p.factors.cgpa], ['Evaluation', p.factors.evaluation], ['Stage', p.factors.stage]] as const).map(([label, f]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="fl">{label} (weight {Math.round(f.weight * 100)}%)</span>
              <span className="fv">+{f.contribution}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Decision</h3></div>
        <div className="card-body" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={`btn ${p.decision === 'Shortlisted' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide('Shortlisted')}>Shortlist</button>
          <button type="button" className={`btn ${p.decision === 'Hold' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide('Hold')}>Hold</button>
          <button type="button" className={`btn ${p.decision === 'Rejected' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide('Rejected')}>Reject</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Internal notes <span className="hint">(private to your team)</span></h3></div>
        <div className="card-body" style={{ display: 'grid', gap: 10 }}>
          {p.notes.length === 0 ? <p className="hint">No notes yet.</p> : p.notes.map((n, i) => (
            <div key={i} className="note-row"><div className="fv">{n.text}</div><div className="fl">{n.by} · {new Date(n.at).toLocaleDateString()}</div></div>
          ))}
          <div className={`field${noteErr ? ' show-err' : ''}`}>
            <textarea className={`input${noteErr ? ' err' : ''}`} placeholder="Add a private note…" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            <div className="err-msg">A note can&apos;t be empty.</div>
          </div>
          {addNote.isError && <div className="otp-err">{errMsg(addNote.error)}</div>}
          <div><button type="button" className="btn btn-primary" disabled={addNote.isPending} onClick={submitNote}>Add note</button></div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the passport test — verify it passes**

Run: `npm test -w client -- EmployerCandidatePassport`
Expected: PASS.

- [ ] **Step 5: Add the route**

In `client/src/App.tsx`, add the import + route:
```tsx
import { EmployerCandidatePassport } from './pages/EmployerPortal/EmployerCandidatePassport.js';
// ...
<Route path="/employer/drives/:id/candidates/:jobseekerId" element={<RoleRoute role="employer"><EmployerShell><EmployerCandidatePassport /></EmployerShell></RoleRoute>} />
```

- [ ] **Step 6: Full client suite + type-check + commit**

Run: `npm test -w client -- EmployerCandidatePassport` → PASS.
Run: `npm test -w client` → all green.
Run: `npx -w client tsc --noEmit` → clean.
```bash
git add client/src/pages/EmployerPortal/EmployerCandidatePassport.tsx client/src/App.tsx client/src/test/EmployerCandidatePassport.test.tsx
git commit -m "feat(client): employer candidate passport (redacted detail + decision + notes)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` (all green) && `npm test -w client` (all green). Report counts.
- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build` — all clean/succeed.
- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer5a_smoke`)** — confirm the server's Mongo env var (read `server/src`), seed + run the server against the smoke DB URI (isolated port if needed). Using an employer demo token + an admin token:
  - Register the employer for an Active drive that has eligible+Match-Ready jobseekers in seed; admin approves it.
  - `GET /api/me/employer/drives/:driveId/candidates` → 200; assert the payload items contain a `code` and do **NOT** contain `name`/`email` (grep the raw JSON for a seeded jobseeker's real name — must be ABSENT). Only eligible+Match-Ready appear.
  - `GET .../candidates/:jobseekerId` → 200 passport (factors + notes); a jobseeker with an `Applied` stage → 404.
  - `PUT .../candidates/:jobseekerId/decision {decision:'Shortlisted'}` → 200 (`decision:'Shortlisted'`); confirm (query the smoke DB) exactly one `Application` with the auth'd employer's `employerId`.
  - `POST .../candidates/:jobseekerId/notes {text:'…'}` → 200, `notes[0].by` = the employer's spoc; a second employer approved for the same drive sees `decision:null` + `notes:[]` for that candidate (isolation).
  - Clear the decision (`null`) with no notes → the `Application` row is deleted.
  - Admin token → 403 on a candidate route.
- [ ] **Step 4: Teardown** — stop the server; drop `matchday_employer5a_smoke`; confirm the shared `matchday` DB was never written to and remains intact. No commit.

---

## Notes for the executor

- cgpa is assumed to be on a 0–10 scale (the score clamps `cgpa/10`); if seed uses a different scale the score skews but stays bounded — note it, don't fix silently.
- The candidate `code` reuses the existing `codeFor` helper (`C-<last6>`), not a new `HH-` scheme — a DRY choice consistent with the admin console; the spec's exact prefix was illustrative.
- Known stubs (from the spec): identity stays masked (reveal is 5b); the per-round-score/project passport sections are intentionally omitted (no backing data); `Application` carries only `decision`+`notes` now (consent → 5b, stage → 8, offer → 9).
