# Employer Portal — Slice 5b: Consent / Reveal-Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employer request a candidate's consent to reveal their identity, let the candidate (jobseeker) grant/deny it via API, and reveal identity to that employer only on grant — a consent state machine layered onto the 5a `Application` doc.

**Architecture:** A `consent` sub-doc on `Application` (per employer×drive×candidate), with `expired` derived on read (no cron). A shared pure helper module derives the consent view. Reveal is an additive, `granted`-gated projection layer over 5a's redacted candidate/passport; identity is loaded from the DB only for granted candidates. Three employer mutation endpoints (request/remind/withdraw) + two jobseeker endpoints (list/respond) in `seekerPortal`. Employer-side client UI only (a consent-status page + a passport reveal block); the jobseeker-facing UI is left to the parallel `feat/jobseeker-portal` effort.

**Tech Stack:** Node/Express + Mongoose (ESM, NodeNext, `.js` import specifiers), Zod, Vitest + Supertest (server); React + React Query + React Router, Vitest + Testing Library (client).

## Global Constraints

- Base: this branch (`feat/employer-portal-slice5b`) is **stacked on `feat/employer-portal-slice5a`** (PR #25). Do not rebase onto `main`.
- **PII masking is enforced server-side.** Identity (`name`, `email`, institute `name`/`city`) is emitted ONLY via a `revealed` block gated on `consent.status === 'granted'`. Non-granted candidates' identity is never even loaded from the DB.
- **Derived-never-stored:** `expired` is derived (`status==='requested' && now > expiresAt`), never a stored status. Match score / pool / etc. stay derived (5a).
- `REVEAL_EXPIRY_HOURS = 48`.
- **Reveal set = real fields only:** `name`, `email`, institute `name`, institute `city`. No phone/resume (not on the model).
- **Terminal states:** `granted` and `declined` — no re-request. `withdraw`/`remind` allowed only while `requested` (an expired request is still stored as `requested`).
- Consent is gated on `decision==='Shortlisted'` **only at request time**; later decision changes never revoke an existing consent.
- Error envelope `{ error: { message, code } }`. New codes: `not_shortlisted`, `already_responded`, `not_remindable`, `not_withdrawable`, `request_expired`. Jobseeker respond on a foreign/unknown Application → uniform `404 not_found` (no enumeration oracle).
- **No jobseeker client UI** in this slice (API only).
- ESM: every relative import ends in `.js`. Follow existing module idioms exactly.

## Prerequisites (one-time)

The worktree `~/code/matchday-employer5b` has no dependencies yet. From the repo root once, before Task 1:

```bash
cd ~/code/matchday-employer5b && npm install
```

Expected: installs the `server` + `client` workspaces (node_modules present). Verify: `npm test -w server -- --run test/app.test.ts` passes.

## File Structure

**Server — create:**
- `server/src/constants/consent.ts` — pure consent helpers (`REVEAL_EXPIRY_HOURS`, `isExpired`, `consentBlock`, types). No model imports.
- `server/src/modules/employerPortal/employerConsent.service.ts` — `requestReveal` / `remindReveal` / `withdrawReveal`.
- `server/src/modules/employerPortal/employerConsent.controller.ts` — their 3 controllers.
- `server/src/modules/seekerPortal/seekerPortal.schemas.ts` — `respondSchema`.
- `server/test/Application.consent.model.test.ts` — consent sub-doc persistence.
- `server/test/employer-consent.route.test.ts` — read-side reveal gating + employer mutations.
- `server/test/seeker-reveal.route.test.ts` — jobseeker list/respond.

**Server — modify:**
- `server/src/models/Application.ts` — add the `consent` sub-doc.
- `server/src/modules/employerPortal/employerCandidates.service.ts` — `RevealedIdentity`, `consent`/`revealed` in the projection, granted-only identity load, and the **`setDecision` delete-guard fix** (consent-aware).
- `server/src/modules/employerPortal/employerPortal.routes.ts` — 3 reveal routes.
- `server/src/modules/seekerPortal/seekerPortal.service.ts` — `listRevealRequests` / `respondReveal`.
- `server/src/modules/seekerPortal/seekerPortal.controller.ts` — 2 controllers.
- `server/src/modules/seekerPortal/seekerPortal.routes.ts` — 2 routes.

**Client — create:**
- `client/src/pages/EmployerPortal/EmployerConsent.tsx` — the consent-status page.
- `client/src/test/EmployerConsent.test.tsx` — its tests.

**Client — modify:**
- `client/src/types/employer.ts` — `CandidateConsent`, `RevealedIdentity`; extend `EmployerCandidate`.
- `client/src/pages/EmployerPortal/hooks/useEmployerCandidates.ts` — `useRevealMutations`.
- `client/src/pages/EmployerPortal/EmployerCandidates.tsx` — gated "Consent status" CTA.
- `client/src/pages/EmployerPortal/EmployerCandidatePassport.tsx` — consent/reveal block.
- `client/src/App.tsx` — the `/employer/drives/:id/consent` route.
- `client/src/test/EmployerCandidatePassport.test.tsx` — a reveal-block test.

---

## Task 1: Server — `consent` sub-doc + shared helpers + read-side reveal gating + `setDecision` guard fix

**Files:**
- Create: `server/src/constants/consent.ts`, `server/test/Application.consent.model.test.ts`, `server/test/employer-consent.route.test.ts`
- Modify: `server/src/models/Application.ts`, `server/src/modules/employerPortal/employerCandidates.service.ts`

**Interfaces:**
- Produces (consumed by Tasks 2/3/4/5):
  - `consent.ts`: `REVEAL_EXPIRY_HOURS: number`; `interface StoredConsent { status?: 'requested'|'granted'|'declined'; requestedAt?: Date; expiresAt?: Date; respondedAt?: Date|null; remindedAt?: Date|null }`; `isExpired(c: StoredConsent|null|undefined, now?: Date): boolean`; `interface ConsentBlock { status: 'requested'|'granted'|'declined'|null; expired: boolean; requestedAt: string|null; expiresAt: string|null; respondedAt: string|null }`; `consentBlock(c, now?): ConsentBlock|null`.
  - `employerCandidates.service.ts`: `interface RevealedIdentity { name: string; email: string; institute: string; city: string }`; `RedactedCandidate` now also has `consent: ConsentBlock|null` and `revealed: RevealedIdentity|null`; `requirePoolMember`/`getPassport` unchanged signatures (reused by Task 2).

- [ ] **Step 1: Write the consent-subdoc model test**

Create `server/test/Application.consent.model.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Application } from '../src/models/Application.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('Application.consent sub-doc', () => {
  const ids = () => ({ employerId: new Types.ObjectId(), driveId: new Types.ObjectId(), jobseekerId: new Types.ObjectId() });

  it('defaults to absent (never requested)', async () => {
    const a = await Application.create({ ...ids(), decision: 'Shortlisted' });
    expect(a.consent).toBeUndefined();
  });

  it('persists a requested consent and reads it back', async () => {
    const now = new Date();
    const a = await Application.create({
      ...ids(), decision: 'Shortlisted',
      consent: { status: 'requested', requestedAt: now, expiresAt: new Date(now.getTime() + 3600_000) },
    });
    const read = await Application.findById(a._id).lean();
    expect(read?.consent?.status).toBe('requested');
    expect(read?.consent?.respondedAt ?? null).toBeNull();
  });

  it('rejects an invalid consent status', async () => {
    await expect(Application.create({
      ...ids(), consent: { status: 'maybe', requestedAt: new Date(), expiresAt: new Date() },
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -w server -- --run test/Application.consent.model.test.ts`
Expected: FAIL — `consent` is not in the schema (the requested/invalid cases don't behave as asserted).

- [ ] **Step 3: Add the `consent` sub-doc to the model**

In `server/src/models/Application.ts`, add a `consentSchema` above `applicationSchema` and a field on it. Full file after edit:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const noteSchema = new Schema({
  text: { type: String, required: true },
  by: { type: String, default: '' },
  at: { type: Date, default: Date.now },
}, { _id: false });

// Per-(employer × drive × candidate) reveal consent (Slice 5b). Absent until the
// employer requests a reveal. `expired` is NOT stored — it is derived on read
// (status 'requested' + past expiresAt). granted/declined are terminal.
const consentSchema = new Schema({
  status: { type: String, enum: ['requested', 'granted', 'declined'], required: true },
  requestedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  respondedAt: { type: Date, default: null },
  remindedAt: { type: Date, default: null },
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
  consent: { type: consentSchema, default: undefined },
}, { timestamps: true });

applicationSchema.index({ employerId: 1, driveId: 1, jobseekerId: 1 }, { unique: true });

export type ApplicationDoc = InferSchemaType<typeof applicationSchema>;
export const Application = model('Application', applicationSchema);
```

- [ ] **Step 4: Run the model test — verify it passes**

Run: `npm test -w server -- --run test/Application.consent.model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the shared consent helpers**

Create `server/src/constants/consent.ts`:

```ts
// Shared, pure consent helpers for the reveal-identity flow (Slice 5b).
// No model imports — safe for both the employerPortal and seekerPortal modules.

export const REVEAL_EXPIRY_HOURS = 48;

export interface StoredConsent {
  status?: 'requested' | 'granted' | 'declined';
  requestedAt?: Date;
  expiresAt?: Date;
  respondedAt?: Date | null;
  remindedAt?: Date | null;
}

// A 'requested' consent whose expiresAt has passed reads as expired (derived, never stored).
export function isExpired(consent: StoredConsent | null | undefined, now: Date = new Date()): boolean {
  return !!consent && consent.status === 'requested' && !!consent.expiresAt
    && now.getTime() > new Date(consent.expiresAt).getTime();
}

export interface ConsentBlock {
  status: 'requested' | 'granted' | 'declined' | null;
  expired: boolean;
  requestedAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
}

// The projection block shared by the employer candidate/passport views. Null = never requested.
export function consentBlock(consent: StoredConsent | null | undefined, now: Date = new Date()): ConsentBlock | null {
  if (!consent || !consent.status) return null;
  return {
    status: consent.status,
    expired: isExpired(consent, now),
    requestedAt: consent.requestedAt ? new Date(consent.requestedAt).toISOString() : null,
    expiresAt: consent.expiresAt ? new Date(consent.expiresAt).toISOString() : null,
    respondedAt: consent.respondedAt ? new Date(consent.respondedAt).toISOString() : null,
  };
}
```

- [ ] **Step 6: Write the failing read-side route test**

Create `server/test/employer-consent.route.test.ts`. (This file grows in Task 2; Task 1 adds the read-side `describe` only.)

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

describe('reveal gating (read side)', () => {
  it('candidates/passport carry consent:null + revealed:null when no request exists', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    const list = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(list.body.items[0].consent).toBeNull();
    expect(list.body.items[0].revealed).toBeNull();
    const pp = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates/${s._id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(pp.body.consent).toBeNull();
    expect(pp.body.revealed).toBeNull();
    expect(pp.body).not.toHaveProperty('name');
  });

  it('reveals identity ONLY when consent.status is granted', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    const now = new Date();
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted',
      consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    const pp = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates/${s._id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(pp.body.consent.status).toBe('granted');
    expect(pp.body.revealed).toEqual({ name: 'Real Name', email: 'real@x.test', institute: 'Secret College', city: 'Hyderabad' });
    const list = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(list.body.items[0].revealed.name).toBe('Real Name');
  });

  it('does NOT reveal for requested / declined (identity stays masked)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s1 = await seeker(inst._id);
    const s2 = await seeker(inst._id, { email: 's2@x.test' });
    const now = new Date();
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s1._id, decision: 'Shortlisted',
      consent: { status: 'requested', requestedAt: now, expiresAt: new Date(now.getTime() + 3600_000) } });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s2._id, decision: 'Shortlisted',
      consent: { status: 'declined', requestedAt: now, expiresAt: now, respondedAt: now } });
    const list = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    for (const item of list.body.items) expect(item.revealed).toBeNull();
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain('Real Name');
    expect(raw).not.toContain('s2@x.test');
  });
});
```

- [ ] **Step 7: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-consent.route.test.ts`
Expected: FAIL — items/passport have no `consent`/`revealed` keys yet.

- [ ] **Step 8: Add reveal gating to the projection + fix the `setDecision` delete guard**

Edit `server/src/modules/employerPortal/employerCandidates.service.ts`:

(a) Add the import near the other imports:

```ts
import { consentBlock, type ConsentBlock } from '../../constants/consent.js';
```

(b) Add the `RevealedIdentity` type and extend `RedactedCandidate` (add the two fields at the end of the interface):

```ts
export interface RevealedIdentity { name: string; email: string; institute: string; city: string; }
```

In `RedactedCandidate`, after `decision` / `noteCount`, add:

```ts
  consent: ConsentBlock | null;
  revealed: RevealedIdentity | null;
```

(c) Change `redactCandidate` to accept + emit them. Replace its signature and return literal:

```ts
function redactCandidate(s: SeekerLean, instituteCategory: string, app?: { decision?: string | null; notes?: unknown[]; consent?: unknown } | null, reveal?: RevealedIdentity | null): RedactedCandidate {
  const { matchScore } = candidateScore(s.cgpa, s.evaluationStatus, s.stage);
  return {
    jobseekerId: String(s._id), code: codeFor(s._id),
    branch: s.branch, gradYear: s.gradYear, source: s.source,
    cgpaBand: cgpaBand(s.cgpa), instituteCategory,
    evaluationStatus: s.evaluationStatus, evaluationLabel: evaluationLabel(s.evaluationStatus), stage: s.stage,
    matchScore, evalPill: matchScore >= 80 ? 'Strong' : 'Qualified',
    decision: (app?.decision as RedactedCandidate['decision']) ?? null, noteCount: (app?.notes as unknown[] | undefined)?.length ?? 0,
    consent: consentBlock(app?.consent as Parameters<typeof consentBlock>[0]),
    revealed: reveal ?? null,
  };
}
```

(d) In `listCandidates`, after the `appByJs` map is built and before `let items = ...`, load identity for granted candidates only, then pass it to `redactCandidate`:

```ts
  const grantedIds = apps.filter((a) => (a.consent as { status?: string } | undefined)?.status === 'granted').map((a) => a.jobseekerId);
  const revealMap = new Map<string, RevealedIdentity>();
  if (grantedIds.length) {
    const revealed = await Jobseeker.find({ _id: { $in: grantedIds } }).select('name email instituteId')
      .lean<{ _id: Types.ObjectId; name: string; email?: string; instituteId: Types.ObjectId }[]>();
    const revInstIds = [...new Set(revealed.map((r) => String(r.instituteId)))];
    const revInsts = await Institute.find({ _id: { $in: revInstIds } }).select('name city')
      .lean<{ _id: Types.ObjectId; name: string; city: string }[]>();
    const revInstMap = new Map(revInsts.map((i) => [String(i._id), i]));
    for (const r of revealed) {
      const ri = revInstMap.get(String(r.instituteId));
      revealMap.set(String(r._id), { name: r.name, email: r.email ?? '', institute: ri?.name ?? '—', city: ri?.city ?? '—' });
    }
  }
  let items = pool.map((s) => redactCandidate(s, instType.get(String(s.instituteId)) ?? '—', appByJs.get(String(s._id)), revealMap.get(String(s._id)) ?? null));
```

(Delete the old `let items = pool.map(...)` line — the new one above replaces it.)

(e) In `getPassport`, load identity only when granted. Replace the body up to `const base = ...`:

```ts
export async function getPassport(employerId: string, driveId: string, jobseekerId: string) {
  const { seeker } = await requirePoolMember(employerId, driveId, jobseekerId);
  const inst = await Institute.findById(seeker.instituteId).select('type').lean<{ type?: string }>();
  const app = await Application.findOne({ employerId, driveId, jobseekerId }).lean();
  let reveal: RevealedIdentity | null = null;
  if ((app?.consent as { status?: string } | undefined)?.status === 'granted') {
    const [ident, revInst] = await Promise.all([
      Jobseeker.findById(jobseekerId).select('name email').lean<{ name: string; email?: string }>(),
      Institute.findById(seeker.instituteId).select('name city').lean<{ name: string; city: string }>(),
    ]);
    reveal = { name: ident?.name ?? '—', email: ident?.email ?? '', institute: revInst?.name ?? '—', city: revInst?.city ?? '—' };
  }
  const base = redactCandidate(seeker, inst?.type ?? '—', app, reveal);
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
```

(f) Fix the `setDecision` clear-to-null delete guard so it does NOT delete a row carrying a consent sub-doc. In `setDecision`, change the `deleteOne` filter:

```ts
    const { deletedCount } = await Application.deleteOne({ employerId, driveId, jobseekerId, notes: { $size: 0 }, consent: { $exists: false } });
    if (deletedCount === 0) await Application.updateOne({ employerId, driveId, jobseekerId }, { $set: { decision: null } });
```

- [ ] **Step 9: Run the read-side tests + full server type-check**

Run: `npm test -w server -- --run test/employer-consent.route.test.ts test/employer-candidates.route.test.ts test/Application.consent.model.test.ts && npx -w server tsc --noEmit`
Expected: all PASS; tsc prints `ok`. (The existing 5a candidates tests must still pass — the projection additions are backward-compatible.)

- [ ] **Step 10: Commit**

```bash
git add server/src/models/Application.ts server/src/constants/consent.ts server/src/modules/employerPortal/employerCandidates.service.ts server/test/Application.consent.model.test.ts server/test/employer-consent.route.test.ts
git commit -m "feat(server): Application.consent sub-doc + consent-gated identity reveal in candidate/passport projection"
```

---

## Task 2: Server — employer reveal mutations (request / remind / withdraw)

**Files:**
- Create: `server/src/modules/employerPortal/employerConsent.service.ts`, `server/src/modules/employerPortal/employerConsent.controller.ts`
- Modify: `server/src/modules/employerPortal/employerPortal.routes.ts`, `server/test/employer-consent.route.test.ts` (append)

**Interfaces:**
- Consumes: `requirePoolMember`, `getPassport` (Task 1 / 5a) from `employerCandidates.service.js`; `REVEAL_EXPIRY_HOURS`, `isExpired` from `constants/consent.js`.
- Produces: `requestReveal(employerId, driveId, jobseekerId)`, `remindReveal(...)`, `withdrawReveal(...)` — each returns the updated passport shape (Task 1's `getPassport` return). Routes: `POST .../reveal-request`, `POST .../reveal-request/remind`, `DELETE .../reveal-request`.

- [ ] **Step 1: Write the failing mutation tests (append to `server/test/employer-consent.route.test.ts`)**

Append these two `describe` blocks (the helpers from Task 1 are in scope). Add a small helper first, then the blocks:

```ts
async function shortlisted(emp: { _id: unknown }, d: { _id: unknown }, jsId: unknown, over: Record<string, unknown> = {}) {
  return Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: jsId, decision: 'Shortlisted', ...over });
}

describe('POST .../reveal-request (+ remind, withdraw)', () => {
  it('requests a reveal for a Shortlisted candidate → requested + expiresAt', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await shortlisted(emp, d, s._id);
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/${s._id}/reveal-request`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    expect(res.body.consent.status).toBe('requested');
    expect(res.body.consent.expiresAt).toBeTruthy();
    expect(res.body.revealed).toBeNull();
  });

  it('rejects a reveal request when the candidate is not Shortlisted', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); // no Application / not shortlisted
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/${s._id}/reveal-request`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('not_shortlisted');
  });

  it('is terminal after a response (already_responded)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    const now = new Date();
    await shortlisted(emp, d, s._id, { consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/${s._id}/reveal-request`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('already_responded');
  });

  it('remind re-arms an expired request; withdraw clears it', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    const past = new Date(Date.now() - 3600_000);
    await shortlisted(emp, d, s._id, { consent: { status: 'requested', requestedAt: past, expiresAt: past } });
    const remind = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/${s._id}/reveal-request/remind`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(remind.status).toBe(200);
    expect(remind.body.consent.status).toBe('requested');
    expect(remind.body.consent.expired).toBe(false); // re-armed into the future
    const withdraw = await request(createApp()).delete(`/api/me/employer/drives/${d._id}/candidates/${s._id}/reveal-request`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.consent).toBeNull();
  });

  it('remind/withdraw reject when there is no pending request', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await shortlisted(emp, d, s._id);
    const remind = await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/${s._id}/reveal-request/remind`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(remind.status).toBe(400);
    expect(remind.body.error.code).toBe('not_remindable');
  });

  it('is employer-scoped: employer B never sees A\'s consent', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const s = await seeker(inst._id); await shortlisted(a, d, s._id);
    await request(createApp()).post(`/api/me/employer/drives/${d._id}/candidates/${s._id}/reveal-request`).set('Authorization', `Bearer ${tokenFor(a)}`);
    const bPass = await request(createApp()).get(`/api/me/employer/drives/${d._id}/candidates/${s._id}`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(bPass.body.consent).toBeNull();
    expect(bPass.body.revealed).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-consent.route.test.ts`
Expected: FAIL — the reveal-request routes 404 (not mounted).

- [ ] **Step 3: Create the employer consent service**

Create `server/src/modules/employerPortal/employerConsent.service.ts`:

```ts
import { HttpError } from '../../middleware/errorHandler.js';
import { Application } from '../../models/Application.js';
import { REVEAL_EXPIRY_HOURS, isExpired } from '../../constants/consent.js';
import { requirePoolMember, getPassport } from './employerCandidates.service.js';

function expiryFrom(now: Date): Date { return new Date(now.getTime() + REVEAL_EXPIRY_HOURS * 3600 * 1000); }

export async function requestReveal(employerId: string, driveId: string, jobseekerId: string) {
  await requirePoolMember(employerId, driveId, jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId });
  if (!app || app.decision !== 'Shortlisted') {
    throw new HttpError(400, 'Shortlist the candidate before requesting a reveal', 'not_shortlisted');
  }
  const status = app.consent?.status;
  if (status === 'granted' || status === 'declined') {
    throw new HttpError(400, 'The candidate has already responded to a reveal request', 'already_responded');
  }
  if (status === 'requested' && !isExpired(app.consent)) {
    return getPassport(employerId, driveId, jobseekerId); // idempotent — an active request already exists
  }
  const now = new Date();
  app.set('consent', { status: 'requested', requestedAt: now, expiresAt: expiryFrom(now), respondedAt: null, remindedAt: null });
  await app.save();
  return getPassport(employerId, driveId, jobseekerId);
}

export async function remindReveal(employerId: string, driveId: string, jobseekerId: string) {
  await requirePoolMember(employerId, driveId, jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId });
  if (!app || app.consent?.status !== 'requested') {
    throw new HttpError(400, 'No pending reveal request to remind', 'not_remindable');
  }
  const now = new Date();
  app.set('consent.expiresAt', expiryFrom(now));
  app.set('consent.remindedAt', now);
  await app.save();
  return getPassport(employerId, driveId, jobseekerId);
}

export async function withdrawReveal(employerId: string, driveId: string, jobseekerId: string) {
  await requirePoolMember(employerId, driveId, jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId });
  if (!app || app.consent?.status !== 'requested') {
    throw new HttpError(400, 'No pending reveal request to withdraw', 'not_withdrawable');
  }
  app.set('consent', undefined);
  await app.save();
  return getPassport(employerId, driveId, jobseekerId);
}
```

- [ ] **Step 4: Create the controllers**

Create `server/src/modules/employerPortal/employerConsent.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { requestReveal, remindReveal, withdrawReveal } from './employerConsent.service.js';

export async function requestRevealController(req: Request, res: Response) {
  res.json(await requestReveal(req.userId as string, req.params.id, req.params.jobseekerId));
}
export async function remindRevealController(req: Request, res: Response) {
  res.json(await remindReveal(req.userId as string, req.params.id, req.params.jobseekerId));
}
export async function withdrawRevealController(req: Request, res: Response) {
  res.json(await withdrawReveal(req.userId as string, req.params.id, req.params.jobseekerId));
}
```

- [ ] **Step 5: Register the routes**

In `server/src/modules/employerPortal/employerPortal.routes.ts`, add the import (after the `employerCandidates.controller` import):

```ts
import { requestRevealController, remindRevealController, withdrawRevealController } from './employerConsent.controller.js';
```

And add these three lines immediately after the existing `noteController` route (line with `.../notes`), before the final `employerPortalRoutes.get('/employer', ...)`:

```ts
employerPortalRoutes.post('/employer/drives/:id/candidates/:jobseekerId/reveal-request', asyncHandler(requestRevealController));
employerPortalRoutes.post('/employer/drives/:id/candidates/:jobseekerId/reveal-request/remind', asyncHandler(remindRevealController));
employerPortalRoutes.delete('/employer/drives/:id/candidates/:jobseekerId/reveal-request', asyncHandler(withdrawRevealController));
```

- [ ] **Step 6: Run tests + type-check**

Run: `npm test -w server -- --run test/employer-consent.route.test.ts && npx -w server tsc --noEmit`
Expected: all PASS; tsc `ok`.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/employerPortal/employerConsent.service.ts server/src/modules/employerPortal/employerConsent.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-consent.route.test.ts
git commit -m "feat(server): employer reveal-request / remind / withdraw endpoints"
```

---

## Task 3: Server — jobseeker reveal endpoints (list + respond) + full server verification

**Files:**
- Create: `server/src/modules/seekerPortal/seekerPortal.schemas.ts`, `server/test/seeker-reveal.route.test.ts`
- Modify: `server/src/modules/seekerPortal/seekerPortal.service.ts`, `seekerPortal.controller.ts`, `seekerPortal.routes.ts`

**Interfaces:**
- Consumes: `Application` model; `Employer`, `Drive` (already imported in the service); `isExpired` from `constants/consent.js`.
- Produces: `listRevealRequests(jobseekerId): { items: RevealRequestItem[] }` where `RevealRequestItem = { applicationId, company, driveName, status, expired, requestedAt, expiresAt, respondedAt }`; `respondReveal(jobseekerId, applicationId, decision: 'grant'|'deny'): { status }`. Routes: `GET /api/me/portal/reveal-requests`, `POST /api/me/portal/reveal-requests/:applicationId/respond`.

- [ ] **Step 1: Write the failing jobseeker route tests**

Create `server/test/seeker-reveal.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Application } from '../src/models/Application.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function scenario(consentOver: Record<string, unknown>) {
  const inst = await Institute.create({ name: 'CBIT', city: 'Hyd', type: 'Tier-1' });
  const emp = await Employer.create({ name: 'Acme Corp', industry: 'Tech', email: 'a@a.test', status: 'Active' });
  const d = await Drive.create({ name: 'Aug Drive', domain: 'Data / ML', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday' });
  const js = await Jobseeker.create({ name: 'Aarav', email: 'aarav@x.test', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', stage: 'MatchReady' });
  const now = new Date();
  const app = await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: js._id, decision: 'Shortlisted',
    consent: { status: 'requested', requestedAt: now, expiresAt: new Date(now.getTime() + 3600_000), ...consentOver } });
  return { emp, d, js, app };
}
function jsToken(js: { _id: unknown }) { return signToken({ sub: String(js._id), role: 'jobseeker' }); }

describe('GET /api/me/portal/reveal-requests', () => {
  it('lists only this jobseeker\'s requests, with the requesting company', async () => {
    const { js } = await scenario({});
    const other = await Jobseeker.create({ name: 'Bob', instituteId: (await Institute.create({ name: 'X', city: 'Y', type: 'Z' }))._id, branch: 'ECE', gradYear: 2026, cgpa: 7, source: 'Campus', stage: 'MatchReady' });
    const res = await request(createApp()).get('/api/me/portal/reveal-requests').set('Authorization', `Bearer ${jsToken(js)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ company: 'Acme Corp', driveName: 'Aug Drive', status: 'requested', expired: false });
    // the other jobseeker sees nothing
    const none = await request(createApp()).get('/api/me/portal/reveal-requests').set('Authorization', `Bearer ${jsToken(other)}`);
    expect(none.body.items).toHaveLength(0);
  });

  it('401 without a token, 403 for an employer token', async () => {
    const { js, emp } = await scenario({});
    expect((await request(createApp()).get('/api/me/portal/reveal-requests')).status).toBe(401);
    const empTok = signToken({ sub: String(emp._id), role: 'employer' });
    expect((await request(createApp()).get('/api/me/portal/reveal-requests').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);
  });
});

describe('POST /api/me/portal/reveal-requests/:applicationId/respond', () => {
  it('grant sets the consent to granted', async () => {
    const { js, app } = await scenario({});
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'grant' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('granted');
    const read = await Application.findById(app._id).lean();
    expect(read?.consent?.status).toBe('granted');
    expect(read?.consent?.respondedAt).toBeTruthy();
  });

  it('deny sets the consent to declined', async () => {
    const { js, app } = await scenario({});
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'deny' });
    expect(res.body.status).toBe('declined');
  });

  it('404 for another jobseeker\'s application (no oracle)', async () => {
    const { app } = await scenario({});
    const other = await Jobseeker.create({ name: 'Bob', instituteId: (await Institute.create({ name: 'X', city: 'Y', type: 'Z' }))._id, branch: 'ECE', gradYear: 2026, cgpa: 7, source: 'Campus', stage: 'MatchReady' });
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(other)}`).send({ decision: 'grant' });
    expect(res.status).toBe(404);
  });

  it('400 already_responded when already granted', async () => {
    const { js, app } = await scenario({ status: 'granted', respondedAt: new Date() });
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'grant' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('already_responded');
  });

  it('400 request_expired for an expired request', async () => {
    const past = new Date(Date.now() - 3600_000);
    const { js, app } = await scenario({ requestedAt: past, expiresAt: past });
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'grant' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('request_expired');
  });

  it('400 on an invalid decision', async () => {
    const { js, app } = await scenario({});
    const res = await request(createApp()).post(`/api/me/portal/reveal-requests/${app._id}/respond`).set('Authorization', `Bearer ${jsToken(js)}`).send({ decision: 'maybe' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -w server -- --run test/seeker-reveal.route.test.ts`
Expected: FAIL — routes 404 / 403 (not mounted).

- [ ] **Step 3: Create the respond schema**

Create `server/src/modules/seekerPortal/seekerPortal.schemas.ts`:

```ts
import { z } from 'zod';

export const respondSchema = z.object({ decision: z.enum(['grant', 'deny']) });
export type RespondPayload = z.infer<typeof respondSchema>;
```

- [ ] **Step 4: Add the service functions**

In `server/src/modules/seekerPortal/seekerPortal.service.ts`, add imports (after the existing model imports):

```ts
import { Application } from '../../models/Application.js';
import { isExpired } from '../../constants/consent.js';
```

Append at the end of the file:

```ts
export async function listRevealRequests(jobseekerId: string) {
  if (!Types.ObjectId.isValid(jobseekerId)) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  const apps = await Application.find({ jobseekerId, 'consent.status': { $in: ['requested', 'granted', 'declined'] } })
    .sort({ 'consent.requestedAt': -1 }).lean();
  const emps = await Employer.find({ _id: { $in: [...new Set(apps.map((a) => String(a.employerId)))] } }).select('name').lean();
  const empName = new Map(emps.map((e) => [String(e._id), e.name as string]));
  const drives = await Drive.find({ _id: { $in: [...new Set(apps.map((a) => String(a.driveId)))] } }).select('name').lean<{ _id: Types.ObjectId; name?: string }[]>();
  const driveName = new Map(drives.map((d) => [String(d._id), d.name ?? '—']));
  return {
    items: apps.map((a) => ({
      applicationId: String(a._id),
      company: empName.get(String(a.employerId)) ?? '—',
      driveName: driveName.get(String(a.driveId)) ?? '—',
      status: a.consent?.status as 'requested' | 'granted' | 'declined',
      expired: isExpired(a.consent),
      requestedAt: a.consent?.requestedAt ? new Date(a.consent.requestedAt).toISOString() : null,
      expiresAt: a.consent?.expiresAt ? new Date(a.consent.expiresAt).toISOString() : null,
      respondedAt: a.consent?.respondedAt ? new Date(a.consent.respondedAt).toISOString() : null,
    })),
  };
}

export async function respondReveal(jobseekerId: string, applicationId: string, decision: 'grant' | 'deny') {
  if (!Types.ObjectId.isValid(applicationId)) throw new HttpError(404, 'Request not found', 'not_found');
  const app = await Application.findOne({ _id: applicationId, jobseekerId });
  const status = app?.consent?.status;
  if (!app || !status) throw new HttpError(404, 'Request not found', 'not_found');
  if (status === 'granted' || status === 'declined') throw new HttpError(400, 'You have already responded to this request', 'already_responded');
  if (isExpired(app.consent)) throw new HttpError(400, 'This reveal request has expired', 'request_expired');
  app.set('consent.status', decision === 'grant' ? 'granted' : 'declined');
  app.set('consent.respondedAt', new Date());
  await app.save();
  return { status: app.consent?.status };
}
```

Note: `Employer`, `Drive`, `HttpError`, and `Types` are already imported at the top of `seekerPortal.service.ts` — do not re-import them.

- [ ] **Step 5: Add the controllers**

In `server/src/modules/seekerPortal/seekerPortal.controller.ts`, replace the file with:

```ts
import type { Request, Response } from 'express';
import { getPortal, listRevealRequests, respondReveal } from './seekerPortal.service.js';
import { respondSchema } from './seekerPortal.schemas.js';

export async function portalController(req: Request, res: Response) {
  res.json(await getPortal(req.userId as string));
}

export async function revealRequestsController(req: Request, res: Response) {
  res.json(await listRevealRequests(req.userId as string));
}

export async function respondRevealController(req: Request, res: Response) {
  const { decision } = respondSchema.parse(req.body);
  res.json(await respondReveal(req.userId as string, req.params.applicationId, decision));
}
```

- [ ] **Step 6: Register the routes**

In `server/src/modules/seekerPortal/seekerPortal.routes.ts`, update the controller import and add two routes:

```ts
import { portalController, revealRequestsController, respondRevealController } from './seekerPortal.controller.js';
```

After the existing `.get('/portal', ...)` line, add:

```ts
seekerPortalRoutes.get('/portal/reveal-requests', asyncHandler(revealRequestsController));
seekerPortalRoutes.post('/portal/reveal-requests/:applicationId/respond', asyncHandler(respondRevealController));
```

- [ ] **Step 7: Run the new tests + the full server suite + type-check**

Run: `npm test -w server -- --run test/seeker-reveal.route.test.ts && npm test -w server && npx -w server tsc --noEmit`
Expected: the new file PASSES; the full suite is all-green (5a's 256 + this slice's new tests); tsc `ok`.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/seekerPortal/ server/test/seeker-reveal.route.test.ts
git commit -m "feat(server): jobseeker reveal-request list + grant/deny endpoints"
```

---

## Task 4: Client — types + reveal mutations + `EmployerConsent` page + route + gated CTA

**Files:**
- Modify: `client/src/types/employer.ts`, `client/src/pages/EmployerPortal/hooks/useEmployerCandidates.ts`, `client/src/pages/EmployerPortal/EmployerCandidates.tsx`, `client/src/App.tsx`
- Create: `client/src/pages/EmployerPortal/EmployerConsent.tsx`, `client/src/test/EmployerConsent.test.tsx`

**Interfaces:**
- Consumes: `useEmployerCandidates(driveId, { decision: 'Shortlisted' })` and `useEmployerDrive(driveId)` (5a); `apiFetch`, `useAuth`.
- Produces: `CandidateConsent`, `RevealedIdentity` types; `EmployerCandidate.consent`/`.revealed`; `useRevealMutations(driveId)` → `{ requestReveal, remindReveal, withdrawReveal }` (each `.mutate(jobseekerId: string)`); `EmployerConsent` page at `/employer/drives/:id/consent`.

- [ ] **Step 1: Extend the types**

In `client/src/types/employer.ts`, add above `EmployerCandidate`:

```ts
export interface CandidateConsent {
  status: 'requested' | 'granted' | 'declined' | null;
  expired: boolean;
  requestedAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
}
export interface RevealedIdentity { name: string; email: string; institute: string; city: string; }
```

And add these two fields to the `EmployerCandidate` interface (after `noteCount`):

```ts
  consent: CandidateConsent | null;
  revealed: RevealedIdentity | null;
```

(`CandidatePassport extends EmployerCandidate`, so it inherits them.)

- [ ] **Step 2: Add the reveal mutations hook**

In `client/src/pages/EmployerPortal/hooks/useEmployerCandidates.ts`, append:

```ts
// Reveal-consent mutations (Slice 5b). Each takes a jobseekerId and returns the updated passport.
export function useRevealMutations(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = (jobseekerId: string) => {
    qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
    qc.invalidateQueries({ queryKey: ['candidate-passport', driveId, jobseekerId] });
    qc.invalidateQueries({ queryKey: ['employer-portal'] });
  };
  const base = (jobseekerId: string) => `/me/employer/drives/${driveId}/candidates/${jobseekerId}/reveal-request`;
  const requestReveal = useMutation({
    mutationFn: (jobseekerId: string) => apiFetch<CandidatePassport>(base(jobseekerId), { method: 'POST', token }),
    onSuccess: (_d, jobseekerId) => invalidate(jobseekerId),
  });
  const remindReveal = useMutation({
    mutationFn: (jobseekerId: string) => apiFetch<CandidatePassport>(`${base(jobseekerId)}/remind`, { method: 'POST', token }),
    onSuccess: (_d, jobseekerId) => invalidate(jobseekerId),
  });
  const withdrawReveal = useMutation({
    mutationFn: (jobseekerId: string) => apiFetch<CandidatePassport>(base(jobseekerId), { method: 'DELETE', token }),
    onSuccess: (_d, jobseekerId) => invalidate(jobseekerId),
  });
  return { requestReveal, remindReveal, withdrawReveal };
}
```

- [ ] **Step 3: Write the failing `EmployerConsent` page test**

Create `client/src/test/EmployerConsent.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerConsent } from '../pages/EmployerPortal/EmployerConsent.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const base = {
  branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1',
  evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady', matchScore: 82, evalPill: 'Strong',
  decision: 'Shortlisted', noteCount: 0,
};
const WAITING = { ...base, jobseekerId: 'j1', code: 'C-AAA111', consent: { status: 'requested', expired: false, requestedAt: '2026-07-20T00:00:00.000Z', expiresAt: '2026-07-22T00:00:00.000Z', respondedAt: null }, revealed: null };
const GRANTED = { ...base, jobseekerId: 'j2', code: 'C-BBB222', consent: { status: 'granted', expired: false, requestedAt: '2026-07-19T00:00:00.000Z', expiresAt: '2026-07-21T00:00:00.000Z', respondedAt: '2026-07-20T00:00:00.000Z' }, revealed: { name: 'Ananya Sharma', email: 'ananya@x.test', institute: 'CBIT', city: 'Hyd' } };
const FRESH = { ...base, jobseekerId: 'j3', code: 'C-CCC333', consent: null, revealed: null };

function mockFetch(items: unknown[]) {
  const post = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.includes('/reveal-request') && method === 'POST') { post(url); return { ok: true, status: 200, json: async () => ({}) }; }
    if (url.includes('/candidates')) return { ok: true, status: 200, json: async () => ({ items }) };
    if (url.match(/\/drives\/[^/]+$/)) return { ok: true, status: 200, json: async () => ({ id: 'd1', name: 'Aug Drive' }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { post };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/consent']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/consent" element={<EmployerConsent />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerConsent', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('shows a granted row with the revealed identity and a masked waiting row', async () => {
    seedAuth(); mockFetch([WAITING, GRANTED]); renderPage();
    await waitFor(() => expect(screen.getByText('Ananya Sharma')).toBeInTheDocument()); // granted → revealed
    expect(screen.getByText('C-AAA111')).toBeInTheDocument(); // waiting → still masked
    expect(screen.getByText(/Interested/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting/i)).toBeInTheDocument();
  });

  it('fires a reveal request for a Shortlisted-not-yet-requested candidate', async () => {
    seedAuth(); const { post } = mockFetch([FRESH]); renderPage();
    await waitFor(() => expect(screen.getByText('C-CCC333')).toBeInTheDocument());
    const row = screen.getByText('C-CCC333').closest('.cand-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Request reveal/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toMatch(/\/candidates\/j3\/reveal-request$/);
  });

  it('shows the empty state when no candidates are shortlisted', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/shortlist candidates/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Run it — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerConsent.test.tsx`
Expected: FAIL — `EmployerConsent` module does not exist.

- [ ] **Step 5: Build the `EmployerConsent` page**

Create `client/src/pages/EmployerPortal/EmployerConsent.tsx`:

```tsx
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerCandidates, useRevealMutations } from './hooks/useEmployerCandidates.js';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import type { EmployerCandidate } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported from the prototype's Screen 16 "Candidate consent status" (#page-consent). Renders
// inside EmployerShell's ".page active" area (no ".employer-app" re-wrap), same convention as
// EmployerCandidates.tsx. Reuses the ported .reveal/.status-pill/.cand-* CSS.

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

function derivedStatus(c: EmployerCandidate): 'none' | 'waiting' | 'interested' | 'declined' | 'expired' {
  const s = c.consent?.status;
  if (!s) return 'none';
  if (s === 'requested') return c.consent?.expired ? 'expired' : 'waiting';
  if (s === 'granted') return 'interested';
  return 'declined';
}
const STATUS_META: Record<string, { label: string; cls: string }> = {
  none: { label: 'Not requested', cls: 'st-draft' },
  waiting: { label: 'Waiting consent', cls: 'st-inprog' },
  interested: { label: 'Interested', cls: 'st-approved' },
  declined: { label: 'Declined', cls: 'st-cancelled' },
  expired: { label: 'Expired', cls: 'st-draft' },
};

export function EmployerConsent() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const drive = useEmployerDrive(driveId);
  const candidates = useEmployerCandidates(driveId, { decision: 'Shortlisted' });
  const { requestReveal, remindReveal, withdrawReveal } = useRevealMutations(driveId);
  const items = candidates.data?.items ?? [];

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to candidates
      </button>
      <div className="card">
        <h2>Candidate consent — {drive.data?.name ?? '…'}</h2>
        <p className="cand-privacy hint">Identities are revealed only after a candidate consents. Request a reveal for your shortlisted candidates; requests expire in 48h if unanswered.</p>
      </div>

      <div className="card">
        {candidates.isLoading ? <p className="hint">Loading…</p>
          : candidates.isError ? <p className="hint">{errMsg(candidates.error)}</p>
          : items.length === 0 ? <p className="cand-empty hint">No shortlisted candidates yet — shortlist candidates to request their consent.</p>
          : (
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((c) => {
                const st = derivedStatus(c);
                const meta = STATUS_META[st];
                const busy = requestReveal.isPending || remindReveal.isPending || withdrawReveal.isPending;
                return (
                  <div className="cand-row" key={c.jobseekerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span className="match-ring" title="Match score">{c.matchScore}</span>
                      <div className="fact">
                        {c.revealed
                          ? <div className="reveal"><div className="rn">{c.revealed.name}</div><div className="re">{c.revealed.email} · {c.revealed.institute}</div></div>
                          : <div className="fv">{c.code}</div>}
                        <div className="fl">
                          <span className={`status-pill ${meta.cls}`}>{meta.label}</span>
                          {st === 'waiting' && c.consent?.expiresAt ? ` · expires ${new Date(c.consent.expiresAt).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {st === 'none' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => requestReveal.mutate(c.jobseekerId)}>Request reveal</button>}
                      {(st === 'waiting' || st === 'expired') && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => remindReveal.mutate(c.jobseekerId)}>Send reminder</button>}
                      {(st === 'waiting' || st === 'expired') && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => withdrawReveal.mutate(c.jobseekerId)}>Withdraw</button>}
                      <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/candidates/${c.jobseekerId}`)}>Passport</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- --run src/test/EmployerConsent.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Add the route + gated CTA**

(a) In `client/src/App.tsx`, add the import (alphabetically near the other employer imports):

```tsx
import { EmployerConsent } from './pages/EmployerPortal/EmployerConsent.js';
```

And add the route immediately after the `.../candidates/:jobseekerId` route line:

```tsx
        <Route path="/employer/drives/:id/consent" element={<RoleRoute role="employer"><EmployerShell><EmployerConsent /></EmployerShell></RoleRoute>} />
```

(b) In `client/src/pages/EmployerPortal/EmployerCandidates.tsx`, add a gated CTA. Inside the first `<div className="card">` (the header card with the privacy hint), after the `<p className="cand-privacy ...">` line, add:

```tsx
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-ghost" disabled={!items.some((c) => c.decision === 'Shortlisted')}
            onClick={() => navigate(`/employer/drives/${driveId}/consent`)}>Consent status</button>
        </div>
```

(`items` and `navigate` are already in scope in that component.)

- [ ] **Step 8: Full client suite + type-check + commit**

Run: `npm test -w client && npx -w client tsc --noEmit`
Expected: all-green (existing 5a client tests still pass — the CTA is additive and the `consent`/`revealed` fields are optional in their mocks); tsc `ok`.

```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal/hooks/useEmployerCandidates.ts client/src/pages/EmployerPortal/EmployerConsent.tsx client/src/pages/EmployerPortal/EmployerCandidates.tsx client/src/App.tsx client/src/test/EmployerConsent.test.tsx
git commit -m "feat(client): employer consent-status page + reveal mutations + gated CTA"
```

---

## Task 5: Client — passport consent/reveal block

**Files:**
- Modify: `client/src/pages/EmployerPortal/EmployerCandidatePassport.tsx`, `client/src/test/EmployerCandidatePassport.test.tsx`

**Interfaces:**
- Consumes: `useRevealMutations(driveId)` (Task 4); `CandidatePassport.consent`/`.revealed` (Task 4).

- [ ] **Step 1: Write the failing reveal-block test (append to `client/src/test/EmployerCandidatePassport.test.tsx`)**

First, extend the mock so a granted passport can be returned. Add a second render helper + a describe. Append this block at the end of the file (it re-stubs fetch per test, matching the existing pattern):

```tsx
const GRANTED_PASSPORT = {
  ...PASSPORT, decision: 'Shortlisted',
  consent: { status: 'granted', expired: false, requestedAt: '2026-07-19T00:00:00.000Z', expiresAt: '2026-07-21T00:00:00.000Z', respondedAt: '2026-07-20T00:00:00.000Z' },
  revealed: { name: 'Ananya Sharma', email: 'ananya@x.test', institute: 'CBIT', city: 'Hyd' },
};
const SHORTLISTED_PASSPORT = { ...PASSPORT, decision: 'Shortlisted', consent: null, revealed: null };

function mockPassport(passport: unknown) {
  const post = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.includes('/reveal-request') && method === 'POST') { post(url); return { ok: true, status: 200, json: async () => passport }; }
    if (url.match(/\/candidates\/[^/]+$/)) return { ok: true, status: 200, json: async () => passport };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { post };
}

describe('EmployerCandidatePassport — reveal block', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('shows the revealed identity when consent is granted', async () => {
    seedAuth(); mockPassport(GRANTED_PASSPORT); renderPage();
    // the header concatenates name/email into one text node → match with a regex substring
    await waitFor(() => expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument());
    expect(screen.getByText(/ananya@x.test/)).toBeInTheDocument();
    expect(screen.queryByText(/Identity hidden/i)).toBeNull();
  });

  it('fires a reveal request for a shortlisted, un-requested candidate', async () => {
    seedAuth(); const { post } = mockPassport(SHORTLISTED_PASSPORT); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Request reveal/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Request reveal/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toMatch(/\/candidates\/j1\/reveal-request$/);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerCandidatePassport.test.tsx`
Expected: FAIL — no "Request reveal" button / revealed identity not rendered.

- [ ] **Step 3: Add the consent/reveal block to the passport**

In `client/src/pages/EmployerPortal/EmployerCandidatePassport.tsx`:

(a) Update the hooks line to also pull the reveal mutations:

```tsx
  const { setDecision, addNote } = useCandidateMutations(driveId);
  const { requestReveal, remindReveal, withdrawReveal } = useRevealMutations(driveId);
```

And update the import on line 3:

```tsx
import { useCandidatePassport, useCandidateMutations, useRevealMutations } from './hooks/useEmployerCandidates.js';
```

(b) In the header block, make the "Identity hidden" line conditional on no reveal, and show the revealed name/email when granted. Replace the `<div className="ps-anon">…</div>` element with:

```tsx
          {p.revealed
            ? <div className="ps-anon" style={{ color: 'var(--green, #067647)' }}>
                <svg className="ic" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path d="M5 12l5 5L20 7" /></svg>
                {p.revealed.name} · {p.revealed.email} · {p.revealed.institute}, {p.revealed.city}
              </div>
            : <div className="ps-anon">
                <svg className="ic" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                Identity hidden — redacted passport. Match score {p.matchScore}.
              </div>}
```

(c) Add a Consent card immediately AFTER the Decision card (before the Internal notes card). Insert:

```tsx
      <div className="card">
        <div className="card-head"><h3>Identity reveal</h3></div>
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          {(() => {
            const c = p.consent;
            const st = !c ? 'none' : c.status === 'requested' ? (c.expired ? 'expired' : 'waiting') : c.status === 'granted' ? 'interested' : 'declined';
            const busy = requestReveal.isPending || remindReveal.isPending || withdrawReveal.isPending;
            const label = { none: 'Not requested', waiting: 'Waiting for the candidate to consent', expired: 'Request expired', interested: 'Consent granted — identity revealed', declined: 'Candidate declined' }[st];
            return (
              <>
                <p className="hint">{label}{st === 'waiting' && c?.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ''}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {st === 'none' && <button type="button" className="btn btn-primary" disabled={busy || p.decision !== 'Shortlisted'} onClick={() => requestReveal.mutate(jsId)}>Request reveal</button>}
                  {(st === 'waiting' || st === 'expired') && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => remindReveal.mutate(jsId)}>Send reminder</button>}
                  {(st === 'waiting' || st === 'expired') && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => withdrawReveal.mutate(jsId)}>Withdraw</button>}
                </div>
                {st === 'none' && p.decision !== 'Shortlisted' && <p className="hint">Shortlist this candidate to request a reveal.</p>}
              </>
            );
          })()}
        </div>
      </div>
```

- [ ] **Step 4: Run the passport tests — verify they pass**

Run: `npm test -w client -- --run src/test/EmployerCandidatePassport.test.tsx`
Expected: PASS (the original 3 + the 2 new reveal-block tests). The original "renders the redacted passport" test still passes because `PASSPORT.revealed` is undefined → falsy → "Identity hidden" still shows.

- [ ] **Step 5: Full client suite + type-check + build + commit**

Run: `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`
Expected: all-green; tsc `ok`; build succeeds.

```bash
git add client/src/pages/EmployerPortal/EmployerCandidatePassport.tsx client/src/test/EmployerCandidatePassport.test.tsx
git commit -m "feat(client): passport identity-reveal block (request/remind/withdraw + revealed identity)"
```

---

## Task 6: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` (all green) && `npm test -w client` (all green). Report counts.

- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build` — all clean/succeed.

- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer5b_smoke`)** — mirror the 5a smoke harness. Seed the DB (`MONGODB_URI=mongodb://localhost:27017/matchday_employer5b_smoke npm run seed -w server`), start the server against it on an isolated port (`MONGODB_URI=… PORT=4099 npx tsx src/index.ts &`), then run a throwaway `tsx` script (using `fetch` + the models, then deleted) that asserts, with an employer demo token (`employer.demo@acme.test`/`Employer123!`), an admin token, and a jobseeker token:
  - Pick an Active drive with a non-empty eligible∩Match-Ready pool; register the employer + admin-approve (reuse the 5a smoke's `ensureApproved` flow).
  - Shortlist a pool candidate (`PUT .../decision {decision:'Shortlisted'}`), then `POST .../reveal-request` → 200, `consent.status==='requested'`, `revealed===null` (grep the payload: the seeded real name is ABSENT).
  - As that candidate's jobseeker token (log in a seeded jobseeker whose `_id` is the shortlisted candidate — resolve via the DB), `GET /api/me/portal/reveal-requests` → the request appears with the employer's company name; `POST .../:applicationId/respond {decision:'grant'}` → `{status:'granted'}`.
  - Re-fetch the employer passport → `consent.status==='granted'` and `revealed` now carries the real name/email/institute/city (grep: name PRESENT after, ABSENT before).
  - A second candidate: request → jobseeker `deny` → employer passport stays masked (`revealed===null`, `consent.status==='declined'`).
  - Expiry: create/patch an Application's `consent.expiresAt` into the past via the model; jobseeker `respond` → `400 request_expired`.
  - Isolation: employer B (approved for the same drive) sees `consent===null`/`revealed===null` for the granted candidate.
  - Role guards: admin token on a reveal route → 403; employer token on `/portal/reveal-requests` → 403.

- [ ] **Step 4: Teardown** — stop the server; drop `matchday_employer5b_smoke`; confirm the shared `matchday` DB was never written to and remains intact. No commit.

---

## Notes for the executor

- The worktree is stacked on 5a; the base already contains all 5a code (Application, redacted projection, `hasApprovedRegistration`, `requirePoolMember`, `codeFor`). Do not re-implement them.
- Mongoose sub-doc mutation: `app.set('consent', {...})` to create/replace, `app.set('consent.field', v)` to update a field, `app.set('consent', undefined)` to clear — then `await app.save()`. Direct `.lean()` reads expose `consent` as a plain object.
- `Date.now()`/`new Date()` are fine in server code (the no-`Date.now` rule applies only to Workflow scripts).
- `expired` is derived everywhere via `isExpired`/`consentBlock` — never write an `'expired'` status to the DB.
- Reveal identity is loaded from the DB ONLY for `granted` candidates (Task 1 steps 8d/8e). Do not loosen the 5a `.select` projections for non-granted candidates.
- Known stubs (from the spec): no email/push (portal-API only); reminder/expiry are timestamp-only; `declined`/`granted` terminal; reveal set is name/email/institute+city; no jobseeker client UI in this slice.
