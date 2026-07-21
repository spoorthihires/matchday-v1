# Employer Portal — Slice 7: Interviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employer schedule interviews for consent-granted candidates into their Slots, then confirm / reschedule / cancel / complete them — a net-new `Interview` entity.

**Architecture:** An `Interview` doc references an existing `Slot` (Slice 4) + a consent-granted candidate (5a/5b). Two read/create endpoints + one discriminated-action PATCH on the existing `/employer` gate; the meeting link derives from the slot. Client: an `EmployerInterviews` page — a schedule form (granted candidates × the employer's slots × a time) + an agenda grouped by slot date. Stacked on 5a+5b+6.

**Tech Stack:** Node/Express + Mongoose (ESM, NodeNext, `.js` import specifiers), Zod, Vitest + Supertest (server); React + React Query + React Router, Vitest + Testing Library (client).

## Global Constraints

- Base: this branch (`feat/employer-portal-slice7`) is **stacked on `feat/employer-portal-slice6`**. Do not rebase onto `main`.
- **Consent = granted required to schedule** — the candidate's Application `(employerId, driveId, jobseekerId)` must have `consent.status === 'granted'`. `employerId` from `req.userId` (JWT), never the body.
- **Interview attaches to a Slot** — it inherits the slot's date/window/link; the meeting link is `slot.link` (never stored on the interview).
- **One interview per candidate per drive** — unique `(employerId, driveId, jobseekerId)`.
- Statuses `Scheduled/Confirmed/Cancelled/Completed`; **reschedule resets status → Scheduled**. Interviewers are free-text strings.
- **Guards** (distinct 400 codes): `consent_required`, `slot_invalid`, `time_out_of_window`, `slot_time_taken`, `already_scheduled`; out-of-pool/bad id → `404 not_found` (no oracle); foreign/unknown interview id → `404`.
- `time`/`slot.start`/`slot.end` are zero-padded `HH:MM` (regex-validated); window check is a lexical compare `start ≤ time < end`.
- Error envelope `{ error: { message, code } }`. ESM: every relative import ends in `.js`.

## Prerequisites (one-time)

The worktree `~/code/matchday-employer7` has no dependencies yet. From the repo root once, before Task 1:

```bash
cd ~/code/matchday-employer7 && npm install
```

Verify: `npm test -w server -- --run test/seeker-portal.route.test.ts` passes (confirms the mongodb-memory-server toolchain works).

## File Structure

**Server — create:**
- `server/src/models/Interview.ts` — the `Interview` model.
- `server/src/modules/employerPortal/employerInterviews.schemas.ts` — `scheduleInterviewSchema`, `interviewActionSchema`.
- `server/src/modules/employerPortal/employerInterviews.service.ts` — `listInterviews`, `scheduleInterview`, `interviewAction` (+ helpers).
- `server/src/modules/employerPortal/employerInterviews.controller.ts` — 3 controllers.
- `server/test/employer-interviews.route.test.ts` — all endpoints.

**Server — modify:**
- `server/src/modules/employerPortal/employerPortal.routes.ts` — 3 routes.

**Client — create:**
- `client/src/pages/EmployerPortal/hooks/useEmployerInterviews.ts` — hooks.
- `client/src/pages/EmployerPortal/EmployerInterviews.tsx` — the page.
- `client/src/test/EmployerInterviews.test.tsx` — its tests.

**Client — modify:**
- `client/src/types/employer.ts` — interview types.
- `client/src/pages/EmployerPortal/EmployerCandidates.tsx` — an "Interviews" CTA.
- `client/src/App.tsx` — the `/employer/drives/:id/interviews` route.

---

## Task 1: Server — `Interview` model + schedule (POST) + list (GET)

**Files:**
- Create: `server/src/models/Interview.ts`, `server/src/modules/employerPortal/employerInterviews.schemas.ts`, `employerInterviews.service.ts`, `employerInterviews.controller.ts`, `server/test/employer-interviews.route.test.ts`
- Modify: `server/src/modules/employerPortal/employerPortal.routes.ts`

**Interfaces:**
- Consumes: `hasApprovedRegistration` (`employerPortal.service.js`), `requirePoolMember` (`employerCandidates.service.js`), `codeFor` (`jobseekers.service.js`), models `Drive`/`Slot`/`Jobseeker`/`Application`.
- Produces: `Interview` model; `listInterviews(employerId, driveId) → { items }`; `scheduleInterview(employerId, driveId, { jobseekerId, slotId, time, interviewers? }) → <projection>`; a `validateSlot` helper reused by Task 2. Projection shape: `{ id, jobseekerId, code, name, email, time, status, interviewers, slot: { id, date, start, end, link } | null }`. Routes: `GET`/`POST /employer/drives/:id/interviews`.

- [ ] **Step 1: Write the `Interview` model**

Create `server/src/models/Interview.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

// Employer-scheduled interview for a consent-granted candidate, attached to one of the
// employer's Slots (Slice 4). Distinct from SlotBooking (the candidate-side reservation).
// The meeting link is NOT stored — it derives from the slot's `link` on read.
const interviewSchema = new Schema({
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true },
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  jobseekerId: { type: Schema.Types.ObjectId, ref: 'Jobseeker', required: true },
  slotId: { type: Schema.Types.ObjectId, ref: 'Slot', required: true },
  time: { type: String, required: true },                 // 'HH:MM' within the slot window
  interviewers: { type: [String], default: [] },          // free-text (no team entity yet)
  status: { type: String, enum: ['Scheduled', 'Confirmed', 'Cancelled', 'Completed'], default: 'Scheduled' },
}, { timestamps: true });

interviewSchema.index({ employerId: 1, driveId: 1, jobseekerId: 1 }, { unique: true });

export type InterviewDoc = InferSchemaType<typeof interviewSchema>;
export const Interview = model('Interview', interviewSchema);
```

- [ ] **Step 2: Write the schemas**

Create `server/src/modules/employerPortal/employerInterviews.schemas.ts`:

```ts
import { z } from 'zod';

const timeStr = z.string().regex(/^\d{2}:\d{2}$/);

export const scheduleInterviewSchema = z.object({
  jobseekerId: z.string().min(1),
  slotId: z.string().min(1),
  time: timeStr,
  interviewers: z.array(z.string().trim().min(1)).max(20).optional(),
});
export type ScheduleInterviewPayload = z.infer<typeof scheduleInterviewSchema>;

export const interviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('complete') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('reschedule'), slotId: z.string().min(1), time: timeStr }),
  z.object({ action: z.literal('set-interviewers'), interviewers: z.array(z.string().trim().min(1)).max(20) }),
]);
export type InterviewActionPayload = z.infer<typeof interviewActionSchema>;
```

- [ ] **Step 3: Write the failing route test (list + schedule)**

Create `server/test/employer-interviews.route.test.ts`:

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
async function slot(e: { _id: unknown }, d: { _id: unknown }, over: Record<string, unknown> = {}) {
  return Slot.create({ driveId: d._id, employerId: e._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00', capacity: 10, status: 'Scheduled', link: 'https://meet.test/x', ...over });
}
async function granted(emp: { _id: unknown }, d: { _id: unknown }, jsId: unknown) {
  const now = new Date();
  return Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: jsId, decision: 'Shortlisted',
    consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
}

describe('POST .../interviews (schedule)', () => {
  it('schedules an interview for a consent-granted candidate and returns the revealed name + slot link', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id); const sl = await slot(emp, d);
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/interviews`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '10:30', interviewers: ['Priya M'] });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Real Name');           // revealed (consent granted)
    expect(res.body.status).toBe('Scheduled');
    expect(res.body.slot.link).toBe('https://meet.test/x');
    expect(res.body.time).toBe('10:30');
    expect(res.body.interviewers).toEqual(['Priya M']);
  });

  it('rejects a candidate who has not consented (consent_required)', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id);
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted' }); // no consent
    const sl = await slot(emp, d);
    const res = await request(createApp()).post(`/api/me/employer/drives/${d._id}/interviews`)
      .set('Authorization', `Bearer ${tokenFor(emp)}`).send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '10:30' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('consent_required');
  });

  it('enforces slot_invalid / time_out_of_window / slot_time_taken / already_scheduled', async () => {
    const emp = await employer(); const other = await employer({ email: 'o@o.test' });
    const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id);
    const s2 = await seeker(inst._id, { email: 's2@x.test' }); await granted(emp, d, s2._id);
    const sl = await slot(emp, d);
    const app = createApp(); const tok = tokenFor(emp);
    const foreignSlot = await slot(other, d);
    // slot_invalid (another employer's slot)
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s._id), slotId: String(foreignSlot._id), time: '10:30' })).body.error.code).toBe('slot_invalid');
    // time_out_of_window (before start)
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '09:00' })).body.error.code).toBe('time_out_of_window');
    // schedule s at 10:30
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '10:30' })).status).toBe(201);
    // slot_time_taken (s2 at the same slot+time)
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s2._id), slotId: String(sl._id), time: '10:30' })).body.error.code).toBe('slot_time_taken');
    // already_scheduled (s again)
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tok}`)
      .send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '11:00' })).body.error.code).toBe('already_scheduled');
  });

  it('404 for an out-of-pool candidate; 400 without an approved registration; 401/403', async () => {
    const emp = await employer(); const d = await drive(); const inst = await institute();
    const s = await seeker(inst._id);
    const app = createApp();
    // no registration → 400
    const noReg = await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send({ jobseekerId: String(s._id), slotId: String(new Types.ObjectId()), time: '10:30' });
    expect(noReg.status).toBe(400);
    expect(noReg.body.error.code).toBe('registration_not_approved');
    await approve(emp, d);
    // out-of-pool jobseeker (Applied stage) → 404
    const applied = await seeker(inst._id, { email: 'ap@x.test', stage: 'Applied' });
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send({ jobseekerId: String(applied._id), slotId: String(new Types.ObjectId()), time: '10:30' })).status).toBe(404);
    // 401 / 403
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`).send({ jobseekerId: String(s._id), slotId: 'x', time: '10:30' })).status).toBe(401);
    expect((await request(app).post(`/api/me/employer/drives/${d._id}/interviews`)
      .set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`).send({ jobseekerId: String(s._id), slotId: 'x', time: '10:30' })).status).toBe(403);
  });
});

describe('GET .../interviews (list)', () => {
  it('lists this employer\'s interviews (revealed identity + slot), sorted; employer-scoped', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(a, d, s._id); const sl = await slot(a, d);
    await request(createApp()).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(a)}`)
      .send({ jobseekerId: String(s._id), slotId: String(sl._id), time: '10:30' });
    const listA = await request(createApp()).get(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(a)}`);
    expect(listA.status).toBe(200);
    expect(listA.body.items).toHaveLength(1);
    expect(listA.body.items[0]).toMatchObject({ name: 'Real Name', time: '10:30', status: 'Scheduled' });
    expect(listA.body.items[0].slot.link).toBe('https://meet.test/x');
    const listB = await request(createApp()).get(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(listB.body.items).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-interviews.route.test.ts`
Expected: FAIL — routes 404 (not mounted) / `Interview` service missing.

- [ ] **Step 5: Create the service**

Create `server/src/modules/employerPortal/employerInterviews.service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Slot } from '../../models/Slot.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Application } from '../../models/Application.js';
import { Interview } from '../../models/Interview.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { requirePoolMember } from './employerCandidates.service.js';
import { codeFor } from '../jobseekers/jobseekers.service.js';
import type { ScheduleInterviewPayload, InterviewActionPayload } from './employerInterviews.schemas.js';

interface SlotShape { _id: Types.ObjectId; driveId: Types.ObjectId; employerId?: Types.ObjectId | null; date: Date; start: string; end: string; status: string; link?: string }
interface SeekerName { name: string; email?: string }
interface InterviewLean { _id: Types.ObjectId; jobseekerId: Types.ObjectId; slotId: Types.ObjectId; time: string; status: string; interviewers?: string[] }

async function gate(employerId: string, driveId: string): Promise<void> {
  if (!Types.ObjectId.isValid(driveId)) throw new HttpError(404, 'Drive not found', 'not_found');
  if (!(await hasApprovedRegistration(employerId, driveId)))
    throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
  const drive = await Drive.findById(driveId).lean();
  if (!drive) throw new HttpError(404, 'Drive not found', 'not_found');
}

function projectWith(iv: InterviewLean, seeker: SeekerName | null | undefined, slot: SlotShape | null | undefined) {
  return {
    id: String(iv._id), jobseekerId: String(iv.jobseekerId), code: codeFor(iv.jobseekerId),
    name: seeker?.name ?? '—', email: seeker?.email ?? '',
    time: iv.time, status: iv.status, interviewers: iv.interviewers ?? [],
    slot: slot ? { id: String(slot._id), date: new Date(slot.date).toISOString(), start: slot.start, end: slot.end, link: slot.link ?? '' } : null,
  };
}

async function projectOne(iv: InterviewLean) {
  const [seeker, slot] = await Promise.all([
    Jobseeker.findById(iv.jobseekerId).select('name email').lean<SeekerName>(),
    Slot.findById(iv.slotId).select('date start end link').lean<SlotShape>(),
  ]);
  return projectWith(iv, seeker, slot);
}

// Shared by schedule + reschedule. Validates the slot belongs to this employer+drive,
// is not cancelled, the time is inside the window, and no other live interview holds it.
async function validateSlot(employerId: string, driveId: string, slotId: string, time: string, excludeIvId: Types.ObjectId | null): Promise<SlotShape> {
  if (!Types.ObjectId.isValid(slotId)) throw new HttpError(400, 'That slot is not available', 'slot_invalid');
  const slot = await Slot.findById(slotId).lean<SlotShape>();
  if (!slot || String(slot.driveId) !== String(driveId) || String(slot.employerId) !== String(employerId) || slot.status === 'Cancelled')
    throw new HttpError(400, 'That slot is not available', 'slot_invalid');
  if (!(slot.start <= time && time < slot.end))
    throw new HttpError(400, 'The time is outside the slot window', 'time_out_of_window');
  const clashFilter: Record<string, unknown> = { slotId, time, status: { $ne: 'Cancelled' } };
  if (excludeIvId) clashFilter._id = { $ne: excludeIvId };
  if (await Interview.findOne(clashFilter))
    throw new HttpError(400, 'Another interview already holds that time in this slot', 'slot_time_taken');
  return slot;
}

export async function listInterviews(employerId: string, driveId: string) {
  await gate(employerId, driveId);
  const ivs = await Interview.find({ employerId, driveId }).lean<InterviewLean[]>();
  const slots = await Slot.find({ _id: { $in: ivs.map((i) => i.slotId) } }).select('date start end link driveId employerId status').lean<SlotShape[]>();
  const seekers = await Jobseeker.find({ _id: { $in: ivs.map((i) => i.jobseekerId) } }).select('name email').lean<(SeekerName & { _id: Types.ObjectId })[]>();
  const slotMap = new Map(slots.map((s) => [String(s._id), s]));
  const seekerMap = new Map(seekers.map((s) => [String(s._id), s]));
  const items = ivs.map((iv) => projectWith(iv, seekerMap.get(String(iv.jobseekerId)), slotMap.get(String(iv.slotId))));
  items.sort((a, b) => (a.slot?.date ?? '').localeCompare(b.slot?.date ?? '') || a.time.localeCompare(b.time));
  return { items };
}

export async function scheduleInterview(employerId: string, driveId: string, input: ScheduleInterviewPayload) {
  await gate(employerId, driveId);
  await requirePoolMember(employerId, driveId, input.jobseekerId);
  const app = await Application.findOne({ employerId, driveId, jobseekerId: input.jobseekerId }).lean();
  if ((app?.consent as { status?: string } | undefined)?.status !== 'granted')
    throw new HttpError(400, 'The candidate must consent to reveal their identity before an interview can be scheduled', 'consent_required');
  const slot = await validateSlot(employerId, driveId, input.slotId, input.time, null);
  if (await Interview.findOne({ employerId, driveId, jobseekerId: input.jobseekerId }))
    throw new HttpError(400, 'This candidate already has an interview for this drive', 'already_scheduled');
  const created = await Interview.create({ employerId, driveId, jobseekerId: input.jobseekerId, slotId: slot._id, time: input.time, interviewers: input.interviewers ?? [] });
  return projectOne(created.toObject() as unknown as InterviewLean);
}

export async function interviewAction(employerId: string, driveId: string, interviewId: string, payload: InterviewActionPayload) {
  await gate(employerId, driveId);
  if (!Types.ObjectId.isValid(interviewId)) throw new HttpError(404, 'Interview not found', 'not_found');
  const iv = await Interview.findOne({ _id: interviewId, employerId, driveId });
  if (!iv) throw new HttpError(404, 'Interview not found', 'not_found');
  switch (payload.action) {
    case 'confirm': iv.status = 'Confirmed'; break;
    case 'complete': iv.status = 'Completed'; break;
    case 'cancel': iv.status = 'Cancelled'; break;
    case 'reschedule': {
      const slot = await validateSlot(employerId, driveId, payload.slotId, payload.time, iv._id);
      iv.slotId = slot._id; iv.time = payload.time; iv.status = 'Scheduled'; break;
    }
    case 'set-interviewers': iv.interviewers = payload.interviewers; break;
  }
  await iv.save();
  return projectOne(iv.toObject() as unknown as InterviewLean);
}
```

- [ ] **Step 6: Create the controllers + register list/schedule routes**

Create `server/src/modules/employerPortal/employerInterviews.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { scheduleInterviewSchema, interviewActionSchema } from './employerInterviews.schemas.js';
import { listInterviews, scheduleInterview, interviewAction } from './employerInterviews.service.js';

export async function interviewsController(req: Request, res: Response) {
  res.json(await listInterviews(req.userId as string, req.params.id));
}
export async function scheduleInterviewController(req: Request, res: Response) {
  const input = scheduleInterviewSchema.parse(req.body);
  res.status(201).json(await scheduleInterview(req.userId as string, req.params.id, input));
}
export async function interviewActionController(req: Request, res: Response) {
  const payload = interviewActionSchema.parse(req.body);
  res.json(await interviewAction(req.userId as string, req.params.id, req.params.interviewId, payload));
}
```

In `server/src/modules/employerPortal/employerPortal.routes.ts`, add the import (after the `employerShortlist.controller` import):

```ts
import { interviewsController, scheduleInterviewController, interviewActionController } from './employerInterviews.controller.js';
```

And add these routes after the `shortlist/pack` route (line 38), before the final `.get('/employer', ...)`:

```ts
employerPortalRoutes.get('/employer/drives/:id/interviews', asyncHandler(interviewsController));
employerPortalRoutes.post('/employer/drives/:id/interviews', asyncHandler(scheduleInterviewController));
employerPortalRoutes.patch('/employer/drives/:id/interviews/:interviewId', asyncHandler(interviewActionController));
```

(The PATCH controller is wired now though its tests are Task 2 — registering all three routes together keeps the route block coherent.)

- [ ] **Step 7: Run tests + type-check**

Run: `npm test -w server -- --run test/employer-interviews.route.test.ts && npx -w server tsc --noEmit`
Expected: all PASS; tsc `ok`.

- [ ] **Step 8: Commit**

```bash
git add server/src/models/Interview.ts server/src/modules/employerPortal/employerInterviews.schemas.ts server/src/modules/employerPortal/employerInterviews.service.ts server/src/modules/employerPortal/employerInterviews.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-interviews.route.test.ts
git commit -m "feat(server): Interview model + schedule/list endpoints (consent-gated, slot-attached)"
```

---

## Task 2: Server — interview actions (confirm/complete/cancel/reschedule/set-interviewers)

**Files:**
- Modify: `server/test/employer-interviews.route.test.ts` (append). The `interviewAction` service + controller + route already exist from Task 1 — this task tests them (and fixes anything the tests surface).

**Interfaces:**
- Consumes: `interviewAction` (Task 1), the `PATCH .../interviews/:interviewId` route (Task 1).

- [ ] **Step 1: Write the failing action tests (append to `server/test/employer-interviews.route.test.ts`)**

Append (helpers from Task 1 are in scope; add a `schedule` helper first):

```ts
async function schedule(emp: { _id: unknown }, d: { _id: unknown }, jsId: unknown, slId: unknown, time: string) {
  return request(createApp()).post(`/api/me/employer/drives/${d._id}/interviews`).set('Authorization', `Bearer ${tokenFor(emp)}`)
    .send({ jobseekerId: String(jsId), slotId: String(slId), time });
}

describe('PATCH .../interviews/:interviewId (actions)', () => {
  it('confirm / complete / cancel transition the status', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id); const sl = await slot(emp, d);
    const id = (await schedule(emp, d, s._id, sl._id, '10:30')).body.id;
    const app = createApp(); const tok = tokenFor(emp); const url = `/api/me/employer/drives/${d._id}/interviews/${id}`;
    expect((await request(app).patch(url).set('Authorization', `Bearer ${tok}`).send({ action: 'confirm' })).body.status).toBe('Confirmed');
    expect((await request(app).patch(url).set('Authorization', `Bearer ${tok}`).send({ action: 'complete' })).body.status).toBe('Completed');
    expect((await request(app).patch(url).set('Authorization', `Bearer ${tok}`).send({ action: 'cancel' })).body.status).toBe('Cancelled');
  });

  it('reschedule re-validates and resets status to Scheduled; set-interviewers replaces', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(emp, d, s._id);
    const s2 = await seeker(inst._id, { email: 's2@x.test' }); await granted(emp, d, s2._id);
    const sl = await slot(emp, d);
    const app = createApp(); const tok = tokenFor(emp);
    const id = (await schedule(emp, d, s._id, sl._id, '10:30')).body.id;
    await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`).send({ action: 'confirm' });
    // second interview holds 11:00
    await schedule(emp, d, s2._id, sl._id, '11:00');
    // reschedule s to a taken time → slot_time_taken
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`)
      .send({ action: 'reschedule', slotId: String(sl._id), time: '11:00' })).body.error.code).toBe('slot_time_taken');
    // reschedule to a free time → status back to Scheduled at the new time
    const ok = await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`)
      .send({ action: 'reschedule', slotId: String(sl._id), time: '11:30' });
    expect(ok.body.status).toBe('Scheduled');
    expect(ok.body.time).toBe('11:30');
    // set-interviewers
    const iv = await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tok}`)
      .send({ action: 'set-interviewers', interviewers: ['A B', 'C D'] });
    expect(iv.body.interviewers).toEqual(['A B', 'C D']);
  });

  it('404 for a foreign/unknown interview id; 400 on a bad action', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test' });
    const d = await drive(); await approve(a, d); await approve(b, d); const inst = await institute();
    const s = await seeker(inst._id); await granted(a, d, s._id); const sl = await slot(a, d);
    const id = (await schedule(a, d, s._id, sl._id, '10:30')).body.id;
    const app = createApp();
    // employer B cannot act on A's interview → 404 (no oracle)
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tokenFor(b)}`).send({ action: 'confirm' })).status).toBe(404);
    // unknown id → 404
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${new Types.ObjectId()}`).set('Authorization', `Bearer ${tokenFor(a)}`).send({ action: 'confirm' })).status).toBe(404);
    // bad action → 400
    expect((await request(app).patch(`/api/me/employer/drives/${d._id}/interviews/${id}`).set('Authorization', `Bearer ${tokenFor(a)}`).send({ action: 'nope' })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — verify it passes (the impl exists from Task 1)**

Run: `npm test -w server -- --run test/employer-interviews.route.test.ts`
Expected: PASS. If any action test fails, fix `interviewAction` in `employerInterviews.service.ts` until green (this is the point of the task). Do NOT change unrelated behavior.

- [ ] **Step 3: Full server suite + type-check**

Run: `npm test -w server && npx -w server tsc --noEmit`
Expected: all-green; tsc `ok`. Report counts.

- [ ] **Step 4: Commit**

```bash
git add server/test/employer-interviews.route.test.ts server/src/modules/employerPortal/employerInterviews.service.ts
git commit -m "test(server): interview actions (confirm/complete/cancel/reschedule/set-interviewers) + no-oracle 404"
```

---

## Task 3: Client — types + hooks + `EmployerInterviews` page + route + CTA

**Files:**
- Modify: `client/src/types/employer.ts`, `client/src/pages/EmployerPortal/EmployerCandidates.tsx`, `client/src/App.tsx`
- Create: `client/src/pages/EmployerPortal/hooks/useEmployerInterviews.ts`, `client/src/pages/EmployerPortal/EmployerInterviews.tsx`, `client/src/test/EmployerInterviews.test.tsx`

**Interfaces:**
- Consumes: `useEmployerCandidates(driveId, {decision:'Shortlisted'})` (5a — items carry `consent`), `useEmployerSlots(driveId)` (Slice 4 — `{items: EmployerSlot[]}`); `apiFetch`/`useAuth`; the Task 1/2 endpoints.
- Produces: `EmployerInterview`/`InterviewSlotRef`/`ScheduleInterviewInput`/`InterviewAction` types; `useEmployerInterviews`/`useScheduleInterview`/`useInterviewAction`; the page at `/employer/drives/:id/interviews`.

- [ ] **Step 1: Add the types**

In `client/src/types/employer.ts`, append:

```ts
export interface InterviewSlotRef { id: string; date: string; start: string; end: string; link: string; }
export interface EmployerInterview {
  id: string; jobseekerId: string; code: string; name: string; email: string;
  time: string; status: 'Scheduled' | 'Confirmed' | 'Cancelled' | 'Completed'; interviewers: string[];
  slot: InterviewSlotRef | null;
}
export interface EmployerInterviewsResponse { items: EmployerInterview[]; }
export interface ScheduleInterviewInput { jobseekerId: string; slotId: string; time: string; interviewers?: string[]; }
export type InterviewAction =
  | { action: 'confirm' } | { action: 'complete' } | { action: 'cancel' }
  | { action: 'reschedule'; slotId: string; time: string }
  | { action: 'set-interviewers'; interviewers: string[] };
```

- [ ] **Step 2: Add the hooks**

Create `client/src/pages/EmployerPortal/hooks/useEmployerInterviews.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerInterview, EmployerInterviewsResponse, InterviewAction, ScheduleInterviewInput } from '../../../types/employer.js';

export function useEmployerInterviews(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-interviews', driveId],
    queryFn: () => apiFetch<EmployerInterviewsResponse>(`/me/employer/drives/${driveId}/interviews`, { token }),
    enabled: !!token && !!driveId,
  });
}

export function useScheduleInterview(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduleInterviewInput) =>
      apiFetch<EmployerInterview>(`/me/employer/drives/${driveId}/interviews`, { method: 'POST', body: input, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-interviews', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}

export function useInterviewAction(driveId: string) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ interviewId, action }: { interviewId: string; action: InterviewAction }) =>
      apiFetch<EmployerInterview>(`/me/employer/drives/${driveId}/interviews/${interviewId}`, { method: 'PATCH', body: action, token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-interviews', driveId] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}
```

- [ ] **Step 3: Write the failing page test**

Create `client/src/test/EmployerInterviews.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerInterviews } from '../pages/EmployerPortal/EmployerInterviews.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const candBase = { branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1', evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady', matchScore: 90, evalPill: 'Strong', decision: 'Shortlisted', noteCount: 0, revealed: null };
const GRANTED = { ...candBase, jobseekerId: 'j1', code: 'C-AAA111', consent: { status: 'granted', expired: false, requestedAt: null, expiresAt: null, respondedAt: null } };
const NOT_GRANTED = { ...candBase, jobseekerId: 'j2', code: 'C-BBB222', consent: { status: 'requested', expired: false, requestedAt: null, expiresAt: null, respondedAt: null } };
const SLOT = { id: 's1', date: '2026-08-05T00:00:00.000Z', start: '10:00', end: '12:00', capacity: 10, booked: 0, status: 'Scheduled', link: 'https://meet.test/x' };
const INTERVIEW = { id: 'iv1', jobseekerId: 'j1', code: 'C-AAA111', name: 'Ananya Sharma', email: 'a@x.test', time: '10:30', status: 'Scheduled', interviewers: ['Priya M'], slot: { id: 's1', date: '2026-08-05T00:00:00.000Z', start: '10:00', end: '12:00', link: 'https://meet.test/x' } };

function mockFetch(interviews: unknown[]) {
  const sched = vi.fn(); const act = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/interviews$/) && method === 'POST') { sched(JSON.parse(opts.body as string)); return { ok: true, status: 201, json: async () => INTERVIEW }; }
    if (url.match(/\/interviews\/[^/]+$/) && method === 'PATCH') { act(url, JSON.parse(opts.body as string)); return { ok: true, status: 200, json: async () => ({ ...INTERVIEW, status: 'Confirmed' }) }; }
    if (url.match(/\/interviews$/)) return { ok: true, status: 200, json: async () => ({ items: interviews }) };
    if (url.includes('/candidates')) return { ok: true, status: 200, json: async () => ({ items: [GRANTED, NOT_GRANTED] }) };
    if (url.match(/\/slots$/)) return { ok: true, status: 200, json: async () => ({ items: [SLOT] }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sched, act };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/interviews']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/interviews" element={<EmployerInterviews />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerInterviews', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders the agenda with a revealed candidate + status + slot link', async () => {
    seedAuth(); mockFetch([INTERVIEW]); renderPage();
    await waitFor(() => expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument());
    expect(screen.getByText('10:30')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Join/i })).toHaveAttribute('href', 'https://meet.test/x');
  });

  it('the schedule form lists only consent-granted candidates and fires the mutation', async () => {
    seedAuth(); const { sched } = mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Schedule interview/i })).toBeInTheDocument());
    // candidate select has the granted candidate (C-AAA111) but not the un-granted one (C-BBB222)
    expect(screen.getByRole('option', { name: /C-AAA111/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /C-BBB222/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Schedule interview/i }));
    await waitFor(() => expect(sched).toHaveBeenCalled());
    // the form defaults time to the selected slot's `start` (10:00) — no manual entry needed
    expect(sched.mock.calls[0][0]).toMatchObject({ jobseekerId: 'j1', slotId: 's1', time: '10:00' });
  });

  it('confirm fires the action mutation', async () => {
    seedAuth(); const { act } = mockFetch([INTERVIEW]); renderPage();
    await waitFor(() => expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect(act.mock.calls[0][0]).toMatch(/\/interviews\/iv1$/);
    expect(act.mock.calls[0][1]).toEqual({ action: 'confirm' });
  });

  it('shows the empty state when no interviews', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/No interviews scheduled/i)).toBeInTheDocument());
  });
});
```

The schedule-form test depends on the page's default field values (candidate = first granted candidate `j1`; slot = first slot `s1`; time = that slot's `start` = `10:00`), so a click with no manual entry sends `{ jobseekerId:'j1', slotId:'s1', time:'10:00' }`. Step 5 implements exactly those defaults.

- [ ] **Step 4: Run — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerInterviews.test.tsx`
Expected: FAIL — `EmployerInterviews` module does not exist.

- [ ] **Step 5: Build the `EmployerInterviews` page**

Create `client/src/pages/EmployerPortal/EmployerInterviews.tsx`. Default the `time` input to the selected slot's `start` (and reconcile the Step-3 test assertion to that value, e.g. `10:00`).

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerCandidates } from './hooks/useEmployerCandidates.js';
import { useEmployerSlots } from './hooks/useEmployerSlots.js';
import { useEmployerInterviews, useScheduleInterview, useInterviewAction } from './hooks/useEmployerInterviews.js';
import type { EmployerInterview } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }
const STATUS_CLS: Record<string, string> = { Scheduled: 'st-inprog', Confirmed: 'st-approved', Cancelled: 'st-cancelled', Completed: 'st-approved' };

export function EmployerInterviews() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const interviews = useEmployerInterviews(driveId);
  const candidates = useEmployerCandidates(driveId, { decision: 'Shortlisted' });
  const slots = useEmployerSlots(driveId);
  const schedule = useScheduleInterview(driveId);
  const action = useInterviewAction(driveId);

  const grantedCands = (candidates.data?.items ?? []).filter((c) => c.consent?.status === 'granted');
  const slotItems = (slots.data?.items ?? []).filter((s) => s.status !== 'Cancelled');

  const [jobseekerId, setJobseekerId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [time, setTime] = useState('');
  const [interviewers, setInterviewers] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  // default the slot + time to the first slot / its start
  useEffect(() => {
    if (!slotId && slotItems.length) { setSlotId(slotItems[0].id); setTime(slotItems[0].start); }
  }, [slotItems, slotId]);
  useEffect(() => { if (!jobseekerId && grantedCands.length) setJobseekerId(grantedCands[0].jobseekerId); }, [grantedCands, jobseekerId]);

  const submit = () => {
    if (!jobseekerId || !slotId || !/^\d{2}:\d{2}$/.test(time)) { setFormErr('Pick a candidate, a slot and a valid time.'); return; }
    setFormErr(null);
    const names = interviewers.split(',').map((s) => s.trim()).filter(Boolean);
    schedule.mutate({ jobseekerId, slotId, time, interviewers: names.length ? names : undefined }, { onSuccess: () => setInterviewers('') });
  };

  const items = useMemo(() => interviews.data?.items ?? [], [interviews.data]);

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to candidates
      </button>
      <div className="card"><h2>Interview schedule</h2><p className="hint">Schedule consented candidates into your slots — confirm, reschedule, or cancel.</p></div>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h3>Schedule an interview</h3>
        {grantedCands.length === 0
          ? <p className="hint">No consented candidates yet. A candidate must grant a reveal request (Consent status) before you can schedule an interview.</p>
          : slotItems.length === 0
          ? <p className="hint">No slots yet. Create a slot first (View slots) to schedule interviews into it.</p>
          : (
            <div className={`field${formErr ? ' show-err' : ''}`} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="select" aria-label="Candidate" value={jobseekerId} onChange={(e) => setJobseekerId(e.target.value)} style={{ maxWidth: 220 }}>
                {grantedCands.map((c) => <option key={c.jobseekerId} value={c.jobseekerId}>{c.name ?? c.code} · {c.code}</option>)}
              </select>
              <select className="select" aria-label="Slot" value={slotId} onChange={(e) => { setSlotId(e.target.value); const s = slotItems.find((x) => x.id === e.target.value); if (s) setTime(s.start); }} style={{ maxWidth: 220 }}>
                {slotItems.map((s) => <option key={s.id} value={s.id}>{new Date(s.date).toLocaleDateString()} · {s.start}–{s.end}</option>)}
              </select>
              <input className="input" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="HH:MM" style={{ maxWidth: 100 }} />
              <input className="input" aria-label="Interviewers" value={interviewers} onChange={(e) => setInterviewers(e.target.value)} placeholder="Interviewers (comma-separated)" style={{ maxWidth: 240 }} />
              <button type="button" className="btn btn-primary" disabled={schedule.isPending} onClick={submit}>Schedule interview</button>
              <div className="err-msg">{formErr}</div>
            </div>
          )}
        {schedule.isError && <p className="otp-err" role="alert">{errMsg(schedule.error)}</p>}
      </div>

      <div className="card">
        {interviews.isLoading ? <p className="hint">Loading…</p>
          : interviews.isError ? <p className="hint">{errMsg(interviews.error)}</p>
          : items.length === 0 ? <p className="cand-empty hint">No interviews scheduled yet.</p>
          : (
            <div style={{ display: 'grid', gap: 10 }}>
              {items.map((iv: EmployerInterview) => (
                <div className="cand-row" key={iv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="reveal"><div className="rn">{iv.name}</div><div className="re">{iv.code} · {iv.slot ? new Date(iv.slot.date).toLocaleDateString() : '—'}</div></div>
                    <span className="intv-time" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{iv.time}</span>
                    {iv.slot?.link && <span className="mlink"><a href={iv.slot.link} target="_blank" rel="noopener">Join</a></span>}
                    {iv.interviewers.length > 0 && <div className="intv-people">{iv.interviewers.map((n) => <span className="ip" key={n}>{n}</span>)}</div>}
                    <span className={`status-pill ${STATUS_CLS[iv.status] ?? 'st-inprog'}`}>{iv.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {iv.status !== 'Cancelled' && iv.status !== 'Completed' && <>
                      <button type="button" className="btn btn-ghost" disabled={action.isPending} onClick={() => action.mutate({ interviewId: iv.id, action: { action: 'confirm' } })}>Confirm</button>
                      <button type="button" className="btn btn-ghost" disabled={action.isPending} onClick={() => action.mutate({ interviewId: iv.id, action: { action: 'complete' } })}>Complete</button>
                      <button type="button" className="btn btn-ghost" disabled={action.isPending} onClick={() => action.mutate({ interviewId: iv.id, action: { action: 'cancel' } })}>Cancel</button>
                    </>}
                  </div>
                </div>
              ))}
            </div>
          )}
        {action.isError && <p className="otp-err" role="alert">{errMsg(action.error)}</p>}
      </div>
    </div>
  );
}
```

Note: this page ships **schedule + confirm/complete/cancel**. Reschedule + per-row set-interviewers are exercised server-side (Task 2) but left off the initial UI to keep the page focused; wire them in a follow-up. (State this in the report.)

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- --run src/test/EmployerInterviews.test.tsx`
Expected: PASS (4 tests). Adjust the time expectation as noted if needed.

- [ ] **Step 7: Add the route + CTA**

(a) In `client/src/App.tsx`, add the import near the other employer imports:

```tsx
import { EmployerInterviews } from './pages/EmployerPortal/EmployerInterviews.js';
```

And the route immediately after the `.../shortlist` route:

```tsx
        <Route path="/employer/drives/:id/interviews" element={<RoleRoute role="employer"><EmployerShell><EmployerInterviews /></EmployerShell></RoleRoute>} />
```

(b) In `client/src/pages/EmployerPortal/EmployerCandidates.tsx`, add an "Interviews" CTA in the same button `<div style={{ marginTop: 10 }}>` (after the "Consent status" button), always enabled:

```tsx
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 6 }}
            onClick={() => navigate(`/employer/drives/${driveId}/interviews`)}>Interviews</button>
```

- [ ] **Step 8: Full client suite + type-check + build + commit**

Run: `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`
Expected: all-green (existing tests unaffected — the CTA is additive); tsc `ok`; build succeeds.

```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal/hooks/useEmployerInterviews.ts client/src/pages/EmployerPortal/EmployerInterviews.tsx client/src/pages/EmployerPortal/EmployerCandidates.tsx client/src/App.tsx client/src/test/EmployerInterviews.test.tsx
git commit -m "feat(client): interviews page (schedule consented candidates into slots + confirm/complete/cancel)"
```

---

## Task 4: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` && `npm test -w client`. Report counts.
- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer7_smoke`)** — mirror the prior smokes: **kill any stale listener on 4099 first** (`lsof -nP -iTCP:4099 -sTCP:LISTEN -t | xargs -r kill`), seed, start the server against the smoke DB on `PORT=4099`, confirm no `EADDRINUSE` in the log. Mint tokens via `signToken` (employer demo `_id` role `employer`; a random `sub` role `admin`); create an Approved registration directly. Then:
  - Pick an Active drive with an eligible∩Match-Ready pool; approve the demo employer; create a `Slot` for the drive (employerId set, date one of the drive's eventDates, start `10:00` end `12:00`, link set).
  - Grant consent for a pool candidate directly (`Application` with `consent.status:'granted'`).
  - `POST .../interviews { jobseekerId, slotId, time:'10:30' }` → 201, `name` = the seeded real name (revealed), `slot.link` present.
  - `GET .../interviews` → the interview appears with the revealed name + slot link.
  - `PATCH .../interviews/:id { action:'confirm' }` → `Confirmed`; `{ action:'reschedule', slotId, time:'11:00' }` → `Scheduled` at 11:00.
  - A **non-granted** pool candidate → `POST` → `400 consent_required`.
  - A second candidate at the **same** slot+time → `400 slot_time_taken`.
  - Employer B (approved, own slot) `GET .../interviews` → sees none of A's; `PATCH` A's interview id → `404`.
  - Admin token on `GET`/`POST .../interviews` → `403`.
- [ ] **Step 4: Teardown** — kill the server **by listener PID** (`lsof -nP -iTCP:4099 -sTCP:LISTEN -t | xargs -r kill`); drop `matchday_employer7_smoke`; confirm shared `matchday` untouched. No commit.

---

## Notes for the executor

- The worktree is stacked on 6; the base has all of 4/5a/5b/6 (Slot, Application+consent, requirePoolMember, hasApprovedRegistration, codeFor). Do not re-implement.
- Consent-gate means the agenda is always identity-revealed — the projection always fills `name`/`email` (from `Jobseeker`).
- The meeting link is `slot.link` (never stored on the interview).
- Time window compare is lexical on zero-padded `HH:MM`; the zod regex enforces the format.
- `Date.now()`/`new Date()` are fine in client + server code.
- Known stubs (from the spec): interviewers are free-text (team entity is Slice 10); no per-slot capacity cap (only `slot_time_taken`); `Completed` is manual; reschedule + per-row set-interviewers are server-complete but the initial client UI ships schedule + confirm/complete/cancel (wire the rest in a follow-up).
