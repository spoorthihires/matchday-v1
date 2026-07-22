# Employer Portal — Slice 9: Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employer record and track offers (status/response/CTC/location/mode/join-date) for consent-granted candidates, with the offer status feeding the kanban's offer columns.

**Architecture:** An `Application.offer` sub-doc (employer-tracked). Slice 8's `deriveStage` gains an optional trailing `offerStatus` (checked first) so the board's Offer Sent/Accepted/Joined columns derive from the offer. Two endpoints on the existing `/employer` gate: an offer PUT (upsert, consent-gated, registration-defaulted) and an offers list (+ KPI counts). Client: an `EmployerOffers` dashboard. Stacked on 5a/5b/6/7/8.

**Tech Stack:** Node/Express + Mongoose (ESM, NodeNext, `.js` import specifiers), Zod, Vitest + Supertest (server); React + React Query + React Router, Vitest + Testing Library (client).

## Global Constraints
- Base: this branch (`feat/employer-portal-slice9`) is **stacked on `feat/employer-portal-slice8`**. Do not rebase onto `main`.
- **Offer requires consent granted** (`offer_requires_consent` else) — the offered set is always identity-revealed. `employerId` from `req.userId`, never body.
- **Offer status derives the kanban stage** (extends Slice 8's `deriveStage`, offer checked first; a manual `app.stage` pin still overrides). The offer NEVER mutates `decision`/`consent`/`interview`/`stage`.
- First-create defaults `ctc`/`location`/`mode` from the employer's Approved `RegistrationRequest` for the drive; updates change only provided fields.
- Out-of-pool/bad id → `404 not_found`; bad enum/negative ctc → `400 validation`. Error envelope `{ error:{message,code} }`. ESM `.js` imports.

## Prerequisites (one-time)
`cd ~/code/matchday-employer9 && npm install`. Verify: `npm test -w server -- --run test/seeker-portal.route.test.ts` passes.

## File Structure
**Server — create:** `server/src/modules/employerPortal/employerOffers.schemas.ts`, `employerOffers.service.ts`, `employerOffers.controller.ts`; `server/test/employer-offers.route.test.ts`.
**Server — modify:** `server/src/models/Application.ts` (+`offer`); `server/src/constants/kanban.ts` (+`offerStatus` arg); `server/src/modules/employerPortal/employerBoard.service.ts` (pass `app.offer?.status`); `server/src/modules/employerPortal/employerPortal.routes.ts` (2 routes).
**Client — create:** `client/src/pages/EmployerPortal/hooks/useEmployerOffers.ts`; `EmployerOffers.tsx`; `client/src/test/EmployerOffers.test.tsx`.
**Client — modify:** `client/src/types/employer.ts`; `EmployerKanban.tsx` + `EmployerCandidates.tsx` (CTAs); `client/src/App.tsx` (route).

---

## Task 1: Server — `Application.offer` + kanban derivation + offer PUT

**Files:** Create `employerOffers.schemas.ts`, `employerOffers.service.ts`, `employerOffers.controller.ts`, `server/test/employer-offers.route.test.ts`; Modify `Application.ts`, `constants/kanban.ts`, `employerBoard.service.ts`, `employerPortal.routes.ts`.

**Interfaces:**
- Consumes: `requirePoolMember`, `candidateScore` (`employerCandidates.service.js`), `hasApprovedRegistration` (`employerPortal.service.js`), `codeFor` (`jobseekers.service.js`), models `Drive`/`Jobseeker`/`Application`/`RegistrationRequest`.
- Produces: `Application.offer`; `deriveStage(..., offerStatus?)`; `upsertOffer(employerId, driveId, jobseekerId, input) → OfferRow`; `offerRow(...)` pure projector (reused by Task 2). `OfferRow = { jobseekerId, code, matchScore, revealed:{name,email}, status, response, ctc, location, mode, joinDate:string|null, declineReason }`. Route `PUT /employer/drives/:id/candidates/:jobseekerId/offer`.

- [ ] **Step 1: Add the `offer` sub-doc to the model**

In `server/src/models/Application.ts`, add an `offerSchema` (near `consentSchema`) and an `offer` field (after `stage`):

```ts
const offerSchema = new Schema({
  status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Declined', 'Joined'], required: true },
  response: { type: String, enum: ['Pending', 'Negotiating', 'Accepted', 'Declined'], default: 'Pending' },
  ctc: { type: Number, default: 0 },
  location: { type: String, default: '' },
  mode: { type: String, enum: ['On-site', 'Hybrid', 'Remote'], default: 'Hybrid' },
  joinDate: { type: Date, default: null },
  declineReason: { type: String, default: '' },
}, { _id: false });
```
```ts
  offer: { type: offerSchema, default: undefined },
```

- [ ] **Step 2: Extend `deriveStage` (kanban) with `offerStatus`**

In `server/src/constants/kanban.ts`, change `deriveStage` to accept an optional trailing `offerStatus`, checked first:

```ts
export function deriveStage(
  decision: string | null | undefined,
  consentStatus: string | null | undefined,
  hasInterview: boolean,
  offerStatus?: string | null | undefined,
): KanbanStage {
  if (offerStatus === 'Joined') return 'Joined';
  if (offerStatus === 'Accepted') return 'Offer Accepted';
  if (offerStatus === 'Sent') return 'Offer Sent';
  if (offerStatus === 'Declined') return 'Withdrawn';
  if (consentStatus === 'granted') return hasInterview ? 'Scheduled' : 'Candidate Confirmed';
  if (consentStatus === 'declined') return 'Withdrawn';
  if (decision === 'Shortlisted') return 'Shortlisted';
  if (decision === 'Rejected') return 'Rejected';
  return 'Recommended';
}
```
(A `Draft` offer intentionally has no branch → falls through.)

- [ ] **Step 3: Pass `offer.status` into the board derivation**

In `server/src/modules/employerPortal/employerBoard.service.ts`, `boardCard` computes `stage`. Update the `AppLean` interface to include `offer?: { status?: string } | null`, and change the derivation call to pass the offer status:

```ts
  const stage = (app?.stage as KanbanStage | null | undefined) ?? deriveStage(app?.decision, app?.consent?.status, hasInterview, app?.offer?.status);
```
(No other board changes — a pinned `app.stage` still wins; non-offer apps pass `undefined` and behave exactly as before.)

- [ ] **Step 4: Write the schema**

Create `server/src/modules/employerPortal/employerOffers.schemas.ts`:

```ts
import { z } from 'zod';

export const upsertOfferSchema = z.object({
  status: z.enum(['Draft', 'Sent', 'Accepted', 'Declined', 'Joined']),
  response: z.enum(['Pending', 'Negotiating', 'Accepted', 'Declined']).optional(),
  ctc: z.number().nonnegative().optional(),
  location: z.string().optional(),
  mode: z.enum(['On-site', 'Hybrid', 'Remote']).optional(),
  joinDate: z.string().optional(),           // ISO date string; '' clears
  declineReason: z.string().optional(),
});
export type UpsertOfferPayload = z.infer<typeof upsertOfferSchema>;
```

- [ ] **Step 5: Write the failing offer-PUT test**

Create `server/test/employer-offers.route.test.ts`:

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
async function approve(e: { _id: unknown }, d: { _id: unknown }, details: Record<string, unknown> = {}) {
  return RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: e._id, driveId: d._id, driveName: 'D', role: 'R', status: 'Approved', activity: [], details });
}
async function seeker(instId: unknown, over: Record<string, unknown> = {}) {
  return Jobseeker.create({ name: 'Real Name', email: 'real@x.test', instituteId: instId, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', evaluationStatus: 'completed', stage: 'MatchReady', ...over });
}
async function granted(emp: { _id: unknown }, d: { _id: unknown }, jsId: unknown, over: Record<string, unknown> = {}) {
  const now = new Date();
  return Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: jsId, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now }, ...over });
}
const offerUrl = (d: { _id: unknown }, jsId: unknown) => `/api/me/employer/drives/${d._id}/candidates/${jsId}/offer`;

describe('PUT .../offer', () => {
  it('creates an offer for a consent-granted candidate, defaulting ctc/location/mode from the registration', async () => {
    const emp = await employer(); const d = await drive();
    await approve(emp, d, { ctcMax: 18, cities: ['Bengaluru'], workMode: 'Remote' });
    const inst = await institute(); const s = await seeker(inst._id); await granted(emp, d, s._id);
    const res = await request(createApp()).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ status: 'Sent' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'Sent', response: 'Pending', ctc: 18, location: 'Bengaluru', mode: 'Remote' });
    expect(res.body.revealed).toEqual({ name: 'Real Name', email: 'real@x.test' });
    const app = await Application.findOne({ employerId: emp._id, driveId: d._id, jobseekerId: s._id }).lean();
    expect(app?.offer?.status).toBe('Sent');
  });

  it('requires consent granted (offer_requires_consent)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const inst = await institute(); const s = await seeker(inst._id);
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted' }); // no consent
    const res = await request(createApp()).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tokenFor(emp)}`).send({ status: 'Sent' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('offer_requires_consent');
  });

  it('updates only provided fields; the kanban board derives the offer stage; a pin still overrides', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d, { ctcMax: 12 });
    const inst = await institute(); const s = await seeker(inst._id); await granted(emp, d, s._id);
    const app = createApp(); const tok = tokenFor(emp);
    await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Sent', ctc: 20 });
    // board derives Offer Sent
    const board1 = await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tok}`);
    expect(board1.body.items.find((i: { jobseekerId: string }) => i.jobseekerId === String(s._id)).stage).toBe('Offer Sent');
    // update to Accepted (only status changes; ctc stays 20)
    const upd = await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Accepted' });
    expect(upd.body).toMatchObject({ status: 'Accepted', ctc: 20 });
    const board2 = await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tok}`);
    expect(board2.body.items.find((i: { jobseekerId: string }) => i.jobseekerId === String(s._id)).stage).toBe('Offer Accepted');
    // a Declined offer → Withdrawn; a Draft offer does NOT change the derived stage
    await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Declined', declineReason: 'competing offer' });
    const board3 = await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tok}`);
    expect(board3.body.items.find((i: { jobseekerId: string }) => i.jobseekerId === String(s._id)).stage).toBe('Withdrawn');
    // manual pin overrides the offer-derived stage
    await request(app).patch(`/api/me/employer/drives/${d._id}/candidates/${s._id}/stage`).set('Authorization', `Bearer ${tok}`).send({ stage: 'HR' });
    const board4 = await request(app).get(`/api/me/employer/drives/${d._id}/board`).set('Authorization', `Bearer ${tok}`);
    expect(board4.body.items.find((i: { jobseekerId: string }) => i.jobseekerId === String(s._id)).stage).toBe('HR');
  });

  it('validates enums (400); out-of-pool → 404; 401/403', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const inst = await institute(); const s = await seeker(inst._id); await granted(emp, d, s._id);
    const applied = await seeker(inst._id, { email: 'ap@x.test', stage: 'Applied' });
    const app = createApp(); const tok = tokenFor(emp);
    expect((await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Nope' })).status).toBe(400);
    expect((await request(app).put(offerUrl(d, applied._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Sent' })).status).toBe(404);
    expect((await request(app).put(offerUrl(d, s._id)).send({ status: 'Sent' })).status).toBe(401);
    expect((await request(app).put(offerUrl(d, s._id)).set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`).send({ status: 'Sent' })).status).toBe(403);
  });
});
```

- [ ] **Step 6: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-offers.route.test.ts`
Expected: FAIL — route 404 / service missing.

- [ ] **Step 7: Create the service**

Create `server/src/modules/employerPortal/employerOffers.service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Application } from '../../models/Application.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { requirePoolMember, candidateScore } from './employerCandidates.service.js';
import { codeFor } from '../jobseekers/jobseekers.service.js';
import type { UpsertOfferPayload } from './employerOffers.schemas.js';

const MODES = ['On-site', 'Hybrid', 'Remote'];
interface SeekerLean { _id: Types.ObjectId; cgpa: number; evaluationStatus: string; stage: string }
interface OfferLean { status: string; response: string; ctc: number; location: string; mode: string; joinDate?: Date | null; declineReason: string }
export interface OfferRow {
  jobseekerId: string; code: string; matchScore: number; revealed: { name: string; email: string };
  status: string; response: string; ctc: number; location: string; mode: string; joinDate: string | null; declineReason: string;
}

async function gate(employerId: string, driveId: string): Promise<void> {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
}

export function offerRow(seeker: SeekerLean, ident: { name?: string; email?: string } | null, offer: OfferLean): OfferRow {
  const { matchScore } = candidateScore(seeker.cgpa, seeker.evaluationStatus, seeker.stage);
  return {
    jobseekerId: String(seeker._id), code: codeFor(seeker._id), matchScore,
    revealed: { name: ident?.name ?? '—', email: ident?.email ?? '' },
    status: offer.status, response: offer.response, ctc: offer.ctc, location: offer.location, mode: offer.mode,
    joinDate: offer.joinDate ? new Date(offer.joinDate).toISOString() : null, declineReason: offer.declineReason,
  };
}

export async function upsertOffer(employerId: string, driveId: string, jobseekerId: string, input: UpsertOfferPayload): Promise<OfferRow> {
  const { seeker } = await requirePoolMember(employerId, driveId, jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId });
  if (app?.consent?.status !== 'granted')
    throw new HttpError(400, 'The candidate must consent to reveal their identity before an offer can be made', 'offer_requires_consent');
  const existing = app.offer as OfferLean | undefined;
  let dCtc = 0; let dLoc = ''; let dMode = 'Hybrid';
  if (!existing) {
    const reg = await RegistrationRequest.findOne({ employerId, driveId, status: 'Approved' }).lean();
    const det = (reg?.details ?? {}) as { ctcMax?: number | null; cities?: string[]; workMode?: string; officeLocation?: string };
    dCtc = det.ctcMax ?? 0;
    dLoc = (Array.isArray(det.cities) && det.cities[0]) || det.officeLocation || '';
    dMode = MODES.includes(det.workMode ?? '') ? (det.workMode as string) : 'Hybrid';
  }
  const offer = {
    status: input.status,
    response: input.response ?? existing?.response ?? 'Pending',
    ctc: input.ctc ?? existing?.ctc ?? dCtc,
    location: input.location ?? existing?.location ?? dLoc,
    mode: input.mode ?? existing?.mode ?? dMode,
    joinDate: input.joinDate ? new Date(input.joinDate) : (existing?.joinDate ?? null),
    declineReason: input.declineReason ?? existing?.declineReason ?? '',
  };
  app.set('offer', offer);
  await app.save();
  const ident = await Jobseeker.findById(jobseekerId).select('name email').lean<{ name: string; email?: string }>();
  return offerRow(seeker as unknown as SeekerLean, ident, offer as OfferLean);
}
```

- [ ] **Step 8: Create the controller + register the route**

Create `server/src/modules/employerPortal/employerOffers.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { upsertOfferSchema } from './employerOffers.schemas.js';
import { upsertOffer } from './employerOffers.service.js';

export async function upsertOfferController(req: Request, res: Response) {
  const input = upsertOfferSchema.parse(req.body);
  res.json(await upsertOffer(req.userId as string, req.params.id, req.params.jobseekerId, input));
}
```

In `server/src/modules/employerPortal/employerPortal.routes.ts`, add the import (after the board controller import) and the route (after the board/stage routes, before the final `.get('/employer', ...)`):

```ts
import { upsertOfferController } from './employerOffers.controller.js';
```
```ts
employerPortalRoutes.put('/employer/drives/:id/candidates/:jobseekerId/offer', asyncHandler(upsertOfferController));
```

- [ ] **Step 9: Run tests + type-check**

Run: `npm test -w server -- --run test/employer-offers.route.test.ts test/employer-board.route.test.ts && npx -w server tsc --noEmit`
Expected: all PASS (the board tests still pass — the `deriveStage` change is backward-compatible); tsc `ok`.

- [ ] **Step 10: Commit**

```bash
git add server/src/models/Application.ts server/src/constants/kanban.ts server/src/modules/employerPortal/employerBoard.service.ts server/src/modules/employerPortal/employerOffers.schemas.ts server/src/modules/employerPortal/employerOffers.service.ts server/src/modules/employerPortal/employerOffers.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-offers.route.test.ts
git commit -m "feat(server): Application.offer + offer PUT (consent-gated, registration-defaulted) + kanban offer-stage derivation"
```

---

## Task 2: Server — offers list (+ KPI counts)

**Files:** Modify `employerOffers.service.ts`, `employerOffers.controller.ts`, `employerPortal.routes.ts`, `server/test/employer-offers.route.test.ts` (append).

**Interfaces:**
- Consumes: `gate`/`offerRow` (Task 1), `Application`, `Jobseeker`.
- Produces: `listOffers(employerId, driveId) → { items: OfferRow[], counts: Record<status, number> }`; route `GET /employer/drives/:id/offers`.

- [ ] **Step 1: Write the failing offers-list test (append)**

```ts
describe('GET .../offers', () => {
  it('lists candidates with an offer (revealed) + KPI counts; employer-scoped', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const s1 = await seeker(inst._id); await granted(a, d, s1._id);
    const s2 = await seeker(inst._id, { email: 's2@x.test' }); await granted(a, d, s2._id);
    const noOffer = await seeker(inst._id, { email: 'n@x.test' }); await granted(a, d, noOffer._id); // granted but no offer → excluded
    const app = createApp(); const tok = tokenFor(a);
    await request(app).put(offerUrl(d, s1._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Sent' });
    await request(app).put(offerUrl(d, s2._id)).set('Authorization', `Bearer ${tok}`).send({ status: 'Accepted' });
    const res = await request(app).get(`/api/me/employer/drives/${d._id}/offers`).set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);                       // only the two with offers
    expect(res.body.counts).toMatchObject({ Sent: 1, Accepted: 1 });
    expect(res.body.items.every((i: { revealed: { name: string } }) => i.revealed.name === 'Real Name')).toBe(true);
    // employer B sees none of A's offers
    const bRes = await request(app).get(`/api/me/employer/drives/${d._id}/offers`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(bRes.body.items).toHaveLength(0);
  });

  it('401 without a token, 403 for an admin token', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d);
    const app = createApp();
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/offers`)).status).toBe(401);
    expect((await request(app).get(`/api/me/employer/drives/${d._id}/offers`).set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`)).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npm test -w server -- --run test/employer-offers.route.test.ts`
Expected: the `GET .../offers` describe FAILS (route 404).

- [ ] **Step 3: Add `listOffers` to the service**

Append to `employerOffers.service.ts`:

```ts
const OFFER_STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Joined'];

export async function listOffers(employerId: string, driveId: string) {
  await gate(employerId, driveId);
  const apps = await Application.find({ employerId, driveId, offer: { $exists: true } }).lean();
  const seekers = await Jobseeker.find({ _id: { $in: apps.map((a) => a.jobseekerId) } })
    .select('name email cgpa evaluationStatus stage').lean<(SeekerLean & { name: string; email?: string })[]>();
  const byId = new Map(seekers.map((s) => [String(s._id), s]));
  const items = apps
    .map((a) => {
      const s = byId.get(String(a.jobseekerId));
      if (!s) return null;
      return offerRow(s, { name: s.name, email: s.email }, a.offer as OfferLean);
    })
    .filter((r): r is OfferRow => r !== null)
    .sort((x, y) => y.matchScore - x.matchScore);
  const counts: Record<string, number> = Object.fromEntries(OFFER_STATUSES.map((st) => [st, 0]));
  for (const it of items) counts[it.status] = (counts[it.status] ?? 0) + 1;
  return { items, counts };
}
```

- [ ] **Step 4: Add the controller + route**

In `employerOffers.controller.ts`, extend the import + add the controller:

```ts
import { upsertOffer, listOffers } from './employerOffers.service.js';
```
```ts
export async function offersController(req: Request, res: Response) {
  res.json(await listOffers(req.userId as string, req.params.id));
}
```

In `employerPortal.routes.ts`, extend the import + add the route (before the offer PUT is fine):

```ts
import { upsertOfferController, offersController } from './employerOffers.controller.js';
```
```ts
employerPortalRoutes.get('/employer/drives/:id/offers', asyncHandler(offersController));
```

- [ ] **Step 5: Run the file + full server suite + type-check**

Run: `npm test -w server -- --run test/employer-offers.route.test.ts && npm test -w server && npx -w server tsc --noEmit`
Expected: file PASSES; full suite all-green; tsc `ok`. Report counts.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/employerPortal/employerOffers.service.ts server/src/modules/employerPortal/employerOffers.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-offers.route.test.ts
git commit -m "feat(server): offers list + KPI counts"
```

---

## Task 3: Client — offers dashboard + hooks + route + CTAs

**Files:** Modify `client/src/types/employer.ts`, `EmployerKanban.tsx`, `EmployerCandidates.tsx`, `App.tsx`; Create `hooks/useEmployerOffers.ts`, `EmployerOffers.tsx`, `client/src/test/EmployerOffers.test.tsx`.

**Interfaces:**
- Consumes: `apiFetch`/`useAuth`; `useEmployerCandidates` (for the New-offer picker); the Task 1/2 endpoints.
- Produces: `EmployerOffer`/`OfferStatus`/`OfferResponse`/`OfferMode`/`OfferInput` types; `useEmployerOffers`/`useUpsertOffer`; `EmployerOffers` at `/employer/drives/:id/offers`.

- [ ] **Step 1: Add the types**

In `client/src/types/employer.ts`, append:

```ts
export type OfferStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Joined';
export type OfferResponse = 'Pending' | 'Negotiating' | 'Accepted' | 'Declined';
export type OfferMode = 'On-site' | 'Hybrid' | 'Remote';
export interface EmployerOffer {
  jobseekerId: string; code: string; matchScore: number; revealed: { name: string; email: string };
  status: OfferStatus; response: OfferResponse; ctc: number; location: string; mode: OfferMode;
  joinDate: string | null; declineReason: string;
}
export interface EmployerOffersResponse { items: EmployerOffer[]; counts: Record<OfferStatus, number>; }
export interface OfferInput {
  status: OfferStatus; response?: OfferResponse; ctc?: number; location?: string; mode?: OfferMode; joinDate?: string; declineReason?: string;
}
```

- [ ] **Step 2: Add the hooks**

Create `client/src/pages/EmployerPortal/hooks/useEmployerOffers.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerOffer, EmployerOffersResponse, OfferInput } from '../../../types/employer.js';

export function useEmployerOffers(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-offers', driveId],
    queryFn: () => apiFetch<EmployerOffersResponse>(`/me/employer/drives/${driveId}/offers`, { token }),
    enabled: !!token && !!driveId,
  });
}

export function useUpsertOffer(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobseekerId, ...offer }: OfferInput & { jobseekerId: string }) =>
      apiFetch<EmployerOffer>(`/me/employer/drives/${driveId}/candidates/${jobseekerId}/offer`, { method: 'PUT', body: offer, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-offers', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-board', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-candidates', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}
```

- [ ] **Step 3: Write the failing page test**

Create `client/src/test/EmployerOffers.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerOffers } from '../pages/EmployerPortal/EmployerOffers.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const OFFER = { jobseekerId: 'j1', code: 'C-AAA111', matchScore: 88, revealed: { name: 'Ananya Sharma', email: 'a@x.test' }, status: 'Sent', response: 'Pending', ctc: 18, location: 'Bengaluru', mode: 'Remote', joinDate: null, declineReason: '' };
const candBase = { branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1', evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady', matchScore: 88, evalPill: 'Strong', decision: 'Shortlisted', noteCount: 0, revealed: null };
const GRANTED_NO_OFFER = { ...candBase, jobseekerId: 'j2', code: 'C-BBB222', consent: { status: 'granted', expired: false, requestedAt: null, expiresAt: null, respondedAt: null } };

function mockFetch(offers: unknown[]) {
  const put = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/offer$/) && method === 'PUT') { put(url, JSON.parse(opts.body as string)); return { ok: true, status: 200, json: async () => ({ ...OFFER, status: JSON.parse(opts.body as string).status }) }; }
    if (url.match(/\/offers$/)) return { ok: true, status: 200, json: async () => ({ items: offers, counts: { Draft: 0, Sent: offers.length, Accepted: 0, Declined: 0, Joined: 0 } }) };
    if (url.includes('/candidates')) return { ok: true, status: 200, json: async () => ({ items: [GRANTED_NO_OFFER] }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { put };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/offers']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/offers" element={<EmployerOffers />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerOffers', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders an offer row (revealed name + code + match)', async () => {
    seedAuth(); mockFetch([OFFER]); renderPage();
    await waitFor(() => expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument());
    // `Sent` is ambiguous (status pill + KPI label + a <select> option); assert unique row text instead
    expect(screen.getByText(/C-AAA111/)).toBeInTheDocument();
    expect(screen.getByText(/match 88/)).toBeInTheDocument();
  });

  it('updates an offer status via the mutation', async () => {
    seedAuth(); const { put } = mockFetch([OFFER]); renderPage();
    await waitFor(() => expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument());
    const row = screen.getByText(/Ananya Sharma/).closest('.cand-row') as HTMLElement;
    // set the status select to 'Accepted' then save
    fireEvent.change(within(row).getByLabelText(/Status/i), { target: { value: 'Accepted' } });
    fireEvent.click(within(row).getByRole('button', { name: /Update/i }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toMatch(/\/candidates\/j1\/offer$/);
    expect(put.mock.calls[0][1]).toMatchObject({ status: 'Accepted' });
  });

  it('shows the empty state when there are no offers', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/No offers yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerOffers.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 5: Build the `EmployerOffers` page**

Create `client/src/pages/EmployerPortal/EmployerOffers.tsx`. Each row carries local edit state (status/response/ctc/location/mode/joinDate/declineReason) seeded from the offer, an "Update" button that calls `useUpsertOffer`, and the KPI row + a "New offer" picker over consent-granted, un-offered candidates.

```tsx
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerOffers, useUpsertOffer } from './hooks/useEmployerOffers.js';
import { useEmployerCandidates } from './hooks/useEmployerCandidates.js';
import type { EmployerOffer, OfferInput, OfferStatus } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }
const STATUSES: OfferStatus[] = ['Draft', 'Sent', 'Accepted', 'Declined', 'Joined'];
const RESPONSES = ['Pending', 'Negotiating', 'Accepted', 'Declined'] as const;
const MODES = ['On-site', 'Hybrid', 'Remote'] as const;
const STATUS_CLS: Record<string, string> = { Draft: 'st-draft', Sent: 'st-inprog', Accepted: 'st-approved', Declined: 'st-cancelled', Joined: 'st-approved' };

function OfferRowForm({ offer, onSave, saving }: { offer: EmployerOffer; onSave: (o: OfferInput) => void; saving: boolean }) {
  const [f, setF] = useState<OfferInput>({ status: offer.status, response: offer.response, ctc: offer.ctc, location: offer.location, mode: offer.mode, joinDate: offer.joinDate?.slice(0, 10), declineReason: offer.declineReason });
  return (
    <div className="cand-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line, #eee)' }}>
      <div className="reveal" style={{ minWidth: 150 }}><div className="rn">{offer.revealed.name}</div><div className="re">{offer.code} · match {offer.matchScore}</div></div>
      <span className={`status-pill ${STATUS_CLS[offer.status] ?? 'st-inprog'}`}>{offer.status}</span>
      <select className="select" aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as OfferStatus })} style={{ maxWidth: 130 }}>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="select" aria-label="Response" value={f.response} onChange={(e) => setF({ ...f, response: e.target.value as OfferInput['response'] })} style={{ maxWidth: 130 }}>
        {RESPONSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className="input" aria-label="CTC" type="number" value={f.ctc ?? 0} onChange={(e) => setF({ ...f, ctc: Number(e.target.value) })} style={{ maxWidth: 90 }} />
      <input className="input" aria-label="Location" value={f.location ?? ''} onChange={(e) => setF({ ...f, location: e.target.value })} style={{ maxWidth: 130 }} />
      <select className="select" aria-label="Mode" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as OfferInput['mode'] })} style={{ maxWidth: 110 }}>
        {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input className="input" aria-label="Join date" type="date" value={f.joinDate ?? ''} onChange={(e) => setF({ ...f, joinDate: e.target.value })} style={{ maxWidth: 150 }} />
      {(f.status === 'Declined' || f.response === 'Declined') && (
        <input className="input" aria-label="Decline reason" placeholder="Decline reason" value={f.declineReason ?? ''} onChange={(e) => setF({ ...f, declineReason: e.target.value })} style={{ maxWidth: 200 }} />
      )}
      <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onSave(f)}>Update</button>
    </div>
  );
}

export function EmployerOffers() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const offers = useEmployerOffers(driveId);
  const candidates = useEmployerCandidates(driveId, { decision: 'Shortlisted' });
  const upsert = useUpsertOffer(driveId);
  const items = useMemo(() => offers.data?.items ?? [], [offers.data]);
  const counts = offers.data?.counts;
  const [newJs, setNewJs] = useState('');

  const offeredIds = new Set(items.map((o) => o.jobseekerId));
  const candidatesForNew = (candidates.data?.items ?? []).filter((c) => c.consent?.status === 'granted' && !offeredIds.has(c.jobseekerId));

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/board`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to pipeline
      </button>
      <div className="card"><h2>Offer management</h2><p className="hint">Track offers for consented candidates. Status changes move the candidate on the pipeline board.</p></div>

      {counts && (
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
          {STATUSES.map((s) => (
            <div className="kpi" key={s}><div className="klabel">{s}</div><div className="kn">{counts[s] ?? 0}</div></div>
          ))}
        </div>
      )}

      {upsert.isError && <p className="otp-err" role="alert">{errMsg(upsert.error)}</p>}

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>New offer:</strong>
        <select className="select" aria-label="New offer candidate" value={newJs} onChange={(e) => setNewJs(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Select a consented candidate…</option>
          {candidatesForNew.map((c) => <option key={c.jobseekerId} value={c.jobseekerId}>{c.code}</option>)}
        </select>
        <button type="button" className="btn btn-ghost" disabled={!newJs || upsert.isPending}
          onClick={() => upsert.mutate({ jobseekerId: newJs, status: 'Sent' }, { onSuccess: () => setNewJs('') })}>Send offer</button>
      </div>

      <div className="card">
        {offers.isLoading ? <p className="hint">Loading…</p>
          : offers.isError ? <p className="hint">{errMsg(offers.error)}</p>
          : items.length === 0 ? <p className="cand-empty hint">No offers yet — send an offer to a consented candidate above.</p>
          : (
            <div style={{ display: 'grid', gap: 4 }}>
              {items.map((o) => (
                <OfferRowForm key={o.jobseekerId} offer={o} saving={upsert.isPending}
                  onSave={(f) => upsert.mutate({ jobseekerId: o.jobseekerId, ...f })} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- --run src/test/EmployerOffers.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Add the route + CTAs**

(a) `client/src/App.tsx`: import `EmployerOffers` near the other employer imports; add the route after `.../board`:

```tsx
        <Route path="/employer/drives/:id/offers" element={<RoleRoute role="employer"><EmployerShell><EmployerOffers /></EmployerShell></RoleRoute>} />
```

(b) `client/src/pages/EmployerPortal/EmployerKanban.tsx`: in the header card's `<p className="hint">` (next to the existing Interviews button), add an "Offer management" button:

```tsx
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/offers`)}>Offer management</button>
```

(c) `client/src/pages/EmployerPortal/EmployerCandidates.tsx`: add an "Offers" CTA in the same button `<div style={{ marginTop: 10 }}>` (after "Pipeline board"), always enabled:

```tsx
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 6 }}
            onClick={() => navigate(`/employer/drives/${driveId}/offers`)}>Offers</button>
```

- [ ] **Step 8: Full client suite + type-check + build + commit**

Run: `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`
Expected: all-green (existing tests unaffected — CTAs are additive); tsc `ok`; build succeeds.

```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal/hooks/useEmployerOffers.ts client/src/pages/EmployerPortal/EmployerOffers.tsx client/src/pages/EmployerPortal/EmployerKanban.tsx client/src/pages/EmployerPortal/EmployerCandidates.tsx client/src/App.tsx client/src/test/EmployerOffers.test.tsx
git commit -m "feat(client): offer-management dashboard (KPIs + per-row update + new-offer picker)"
```

---

## Task 4: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` && `npm test -w client`. Report counts.
- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer9_smoke`)** — kill any stale :4099 listener first, seed, start the server on `PORT=4099`, confirm no `EADDRINUSE`. Mint tokens via `signToken`; create an Approved registration (with `details.ctcMax`/`cities`/`workMode`) directly; grant consent for a pool candidate directly. Then:
  - `PUT .../candidates/:jsId/offer { status:'Sent' }` → 200 with the revealed name + ctc/location/mode defaulted from the registration.
  - `GET .../offers` → the candidate appears with the revealed name; `counts.Sent === 1`.
  - `GET .../board` → that candidate's card is in `Offer Sent`; update offer → `Accepted` → board shows `Offer Accepted`; `Declined` → `Withdrawn`; then a manual stage PATCH to `HR` overrides.
  - A **non-granted** candidate → `PUT offer` → `400 offer_requires_consent`.
  - Invalid status → 400; out-of-pool → 404; employer B `GET offers` → none of A's; admin → 403.
- [ ] **Step 4: Teardown** — kill the server by listener PID; drop `matchday_employer9_smoke`; confirm shared `matchday` untouched. No commit.

---

## Notes for the executor
- Stacked on 8; the base has all of 5a–8. Do not re-implement `poolSeekers`/`requirePoolMember`/`candidateScore`/`codeFor`/`deriveStage`/`boardCard`.
- The `deriveStage` change is additive (optional trailing arg); Slice 8's board tests must still pass — run them in Task 1 Step 9.
- The offer NEVER writes `decision`/`consent`/`interview`/`stage`; it only adds a derivation input. A manual pin still overrides (Slice 8 behavior unchanged).
- Offer requires consent granted, so the offered set + `offers` list are always identity-revealed (load name/email for them).
- Registration default: `details.ctcMax` → ctc; `details.cities[0] || details.officeLocation` → location; `details.workMode` → mode (only if a valid enum value, else 'Hybrid').
- `Date.now()`/`new Date()` fine in client + server code.
- Known stubs (from the spec): no offer-letter upload; no jobseeker-side accept/decline; CTC is a single LPA number; the offer feeds kanban one-way (a pin can diverge).
