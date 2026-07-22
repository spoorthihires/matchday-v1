# Employer Portal — Slice 10: Reports & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only analytics page — a monotonic hiring funnel + headline KPIs, per-drive or aggregated — derived entirely from existing data.

**Architecture:** One derived `GET /api/me/employer/reports` endpoint (no new entity, no writes, no PII) + an `EmployerReports` page. Funnel is flow-index-based (monotonic); KPIs are real cumulative counts. Stacked on 5a–9.

**Tech Stack:** Node/Express + Mongoose (ESM, `.js` imports), Zod, Vitest + Supertest (server); React + React Query + React Router, Vitest + Testing Library (client).

## Global Constraints
- Base: `feat/employer-portal-slice10`, **stacked on `feat/employer-portal-slice9`**. Do not rebase onto `main`.
- **Read-only, derived, no PII** — the report is pure aggregate counts; never load or emit `name`/`email`. `employerId` from `req.userId`.
- **Funnel is monotonic** (flow-index thresholds on the effective stage); **KPIs are real cumulative counts** (`offersSent` includes declined).
- Scope: `driveId=<id>` gated by `hasApprovedRegistration` (else `400 registration_not_approved`; invalid/unknown → `404`); `driveId=all`/omitted → the employer's Approved-registration drives, summed (empty → zeroed 200).
- Error envelope `{ error:{message,code} }`. ESM `.js` imports.

## Prerequisites (one-time)
`cd ~/code/matchday-employer10 && npm install`. Verify: `npm test -w server -- --run test/seeker-portal.route.test.ts` passes.

## File Structure
**Server — create:** `server/src/modules/employerPortal/employerReports.schemas.ts`, `employerReports.service.ts`, `employerReports.controller.ts`; `server/test/employer-reports.route.test.ts`.
**Server — modify:** `server/src/modules/employerPortal/employerPortal.routes.ts` (1 route).
**Client — create:** `client/src/pages/EmployerPortal/hooks/useEmployerReports.ts`; `EmployerReports.tsx`; `client/src/test/EmployerReports.test.tsx`.
**Client — modify:** `client/src/types/employer.ts`; `EmployerShell.tsx` (repoint the Reports nav path); `client/src/App.tsx` (route).

---

## Task 1: Server — reports endpoint

**Files:** Create `employerReports.schemas.ts`, `employerReports.service.ts`, `employerReports.controller.ts`, `server/test/employer-reports.route.test.ts`; Modify `employerPortal.routes.ts`.

**Interfaces:**
- Consumes: `poolSeekers`, `candidateScore` (`employerCandidates.service.js`), `hasApprovedRegistration` (`employerPortal.service.js`), `KANBAN_ORDER`/`deriveStage` (`constants/kanban.js`), models `Drive`/`Application`/`Interview`/`RegistrationRequest`.
- Produces: `getReport(employerId, driveId?) → { scope, drives, funnel, kpis }`; route `GET /employer/reports`.

- [ ] **Step 1: Write the schema**

Create `server/src/modules/employerPortal/employerReports.schemas.ts`:

```ts
import { z } from 'zod';
export const reportsQuerySchema = z.object({ driveId: z.string().optional() });
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
```

- [ ] **Step 2: Write the failing route test**

Create `server/test/employer-reports.route.test.ts`:

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
function fstage(funnel: any[], stage: string) { return funnel.find((f) => f.stage === stage); }

describe('GET /api/me/employer/reports', () => {
  it('derives the monotonic funnel + KPIs for a drive', async () => {
    const emp = await employer(); const d = await drive(); await approve(emp, d); const inst = await institute();
    const now = new Date();
    const plain = await seeker(inst._id, { email: 'p@x.test' });                     // pool only → Recommended
    const short = await seeker(inst._id, { email: 's@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: short._id, decision: 'Shortlisted' });   // Shortlisted
    const confirmed = await seeker(inst._id, { email: 'c@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: confirmed._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });   // Confirmed
    const interviewed = await seeker(inst._id, { email: 'i@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: interviewed._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now } });
    const sl = await Slot.create({ driveId: d._id, employerId: emp._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00', capacity: 10, status: 'Scheduled', link: 'x' });
    await Interview.create({ employerId: emp._id, driveId: d._id, jobseekerId: interviewed._id, slotId: sl._id, time: '10:30', status: 'Scheduled' });   // Interviewed
    const joined = await seeker(inst._id, { email: 'j@x.test' });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: joined._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: now, expiresAt: now, respondedAt: now }, offer: { status: 'Joined', response: 'Accepted', ctc: 10, mode: 'Hybrid' } });   // Offered+Accepted+Joined

    const res = await request(createApp()).get(`/api/me/employer/drives`).set('Authorization', `Bearer ${tokenFor(emp)}`); // warm (unrelated) — ignore
    const rep = await request(createApp()).get(`/api/me/employer/reports?driveId=${d._id}`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(rep.status).toBe(200);
    const f = rep.body.funnel;
    expect(fstage(f, 'Recommended').count).toBe(5);
    expect(fstage(f, 'Shortlisted').count).toBe(4);   // short, confirmed, interviewed, joined
    expect(fstage(f, 'Confirmed').count).toBe(3);      // confirmed, interviewed, joined (consent granted)
    expect(fstage(f, 'Interviewed').count).toBe(2);    // interviewed (flowIdx>=Scheduled) + joined (Joined>=Scheduled)
    expect(fstage(f, 'Offered').count).toBe(1);        // joined (Joined>=Offer Sent)
    expect(fstage(f, 'Joined').count).toBe(1);
    // monotonic + conversion
    expect(fstage(f, 'Recommended').conversionPct).toBe(100);
    expect(fstage(f, 'Shortlisted').conversionPct).toBe(80);   // 4/5
    expect(rep.body.kpis).toMatchObject({ recommended: 5, shortlisted: 4, interviewsScheduled: 1, offersSent: 1, offersAccepted: 1 });
    expect(rep.body.kpis.avgMatchScore).toBeGreaterThan(0);
    // no PII
    const raw = JSON.stringify(rep.body);
    expect(raw).not.toContain('Real Name');
    expect(raw).not.toContain('real@x.test');
    // drives list for the selector
    expect(rep.body.drives.some((x: { id: string }) => x.id === String(d._id))).toBe(true);
  });

  it('driveId=all aggregates across the employer\'s approved drives', async () => {
    const emp = await employer(); const inst = await institute();
    const d1 = await drive(); const d2 = await drive({ name: 'D2' });
    await approve(emp, d1); await approve(emp, d2);
    const s1 = await seeker(inst._id, { email: 'a1@x.test' }); await Application.create({ employerId: emp._id, driveId: d1._id, jobseekerId: s1._id, decision: 'Shortlisted' });
    const s2 = await seeker(inst._id, { email: 'a2@x.test' }); await Application.create({ employerId: emp._id, driveId: d2._id, jobseekerId: s2._id, decision: 'Shortlisted' });
    const rep = await request(createApp()).get(`/api/me/employer/reports?driveId=all`).set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(rep.status).toBe(200);
    expect(rep.body.scope).toBe('all');
    // both drives share the same pool (same eligibility), so recommended = 2 × pool; shortlisted sums to 2
    expect(fstage(rep.body.funnel, 'Shortlisted').count).toBe(2);
    expect(rep.body.drives).toHaveLength(2);
  });

  it('gates: non-approved drive → 400; unknown/invalid → 404; employer-scoped; 401/403', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive(); const inst = await institute();
    const s = await seeker(inst._id); await Application.create({ employerId: b._id, driveId: d._id, jobseekerId: s._id, decision: 'Shortlisted' }); // B's data
    const app = createApp();
    // A has no registration for d → 400
    expect((await request(app).get(`/api/me/employer/reports?driveId=${d._id}`).set('Authorization', `Bearer ${tokenFor(a)}`)).body.error.code).toBe('registration_not_approved');
    await approve(a, d);
    // A's report over d counts none of B's applications
    const repA = await request(app).get(`/api/me/employer/reports?driveId=${d._id}`).set('Authorization', `Bearer ${tokenFor(a)}`);
    expect(fstage(repA.body.funnel, 'Shortlisted').count).toBe(0);
    // unknown id → 404
    expect((await request(app).get(`/api/me/employer/reports?driveId=${new Types.ObjectId()}`).set('Authorization', `Bearer ${tokenFor(a)}`)).status).toBe(404);
    // 401 / 403
    expect((await request(app).get(`/api/me/employer/reports?driveId=all`)).status).toBe(401);
    expect((await request(app).get(`/api/me/employer/reports?driveId=all`).set('Authorization', `Bearer ${signToken({ sub: String(a._id), role: 'admin' })}`)).status).toBe(403);
  });
});
```

- [ ] **Step 3: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-reports.route.test.ts`
Expected: FAIL — route 404 / service missing.

- [ ] **Step 4: Create the service**

Create `server/src/modules/employerPortal/employerReports.service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Application } from '../../models/Application.js';
import { Interview } from '../../models/Interview.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import { hasApprovedRegistration } from './employerPortal.service.js';
import { poolSeekers, candidateScore } from './employerCandidates.service.js';
import { KANBAN_ORDER, deriveStage, type KanbanStage } from '../../constants/kanban.js';

const FUNNEL: { stage: string; threshold: KanbanStage | null }[] = [
  { stage: 'Recommended', threshold: null },
  { stage: 'Shortlisted', threshold: 'Shortlisted' },
  { stage: 'Confirmed', threshold: 'Candidate Confirmed' },
  { stage: 'Interviewed', threshold: 'Scheduled' },
  { stage: 'Offered', threshold: 'Offer Sent' },
  { stage: 'Accepted', threshold: 'Offer Accepted' },
  { stage: 'Joined', threshold: 'Joined' },
];
const OFFER_SENT = ['Sent', 'Accepted', 'Declined', 'Joined'];
const OFFER_ACCEPTED = ['Accepted', 'Joined'];

interface DriveLean { _id: Types.ObjectId; eligibility?: unknown }
interface SeekerLean { _id: Types.ObjectId; cgpa: number; evaluationStatus: string; stage: string }
interface AppLean { jobseekerId: Types.ObjectId; decision?: string | null; consent?: { status?: string } | null; stage?: string | null; offer?: { status?: string } | null }

interface Acc { recommended: number; reached: number[]; interviewsScheduled: number; offersSent: number; offersAccepted: number; scoreSum: number }

async function approvedDrives(employerId: string): Promise<{ id: string; name: string }[]> {
  const regs = await RegistrationRequest.find({ employerId, status: 'Approved' }).select('driveId').lean();
  const ids = [...new Set(regs.map((r) => String(r.driveId)))];
  const ds = await Drive.find({ _id: { $in: ids } }).select('name').lean<{ _id: Types.ObjectId; name?: string }[]>();
  return ds.map((d) => ({ id: String(d._id), name: d.name ?? '—' }));
}

async function accumulate(employerId: string, driveId: string, acc: Acc): Promise<void> {
  const drive = await Drive.findById(driveId).lean<DriveLean>();
  if (!drive) return;
  const pool = await poolSeekers(drive) as unknown as SeekerLean[];
  const apps = await Application.find({ employerId, driveId, jobseekerId: { $in: pool.map((s) => s._id) } }).lean<AppLean[]>();
  const appByJs = new Map(apps.map((a) => [String(a.jobseekerId), a]));
  const interviewed = new Set(
    (await Interview.find({ employerId, driveId, status: { $ne: 'Cancelled' } }).select('jobseekerId').lean<{ jobseekerId: Types.ObjectId }[]>())
      .map((i) => String(i.jobseekerId)),
  );
  acc.recommended += pool.length;
  acc.interviewsScheduled += interviewed.size;
  for (const s of pool) {
    const app = appByJs.get(String(s._id));
    const stage = (app?.stage as KanbanStage | null | undefined) ?? deriveStage(app?.decision, app?.consent?.status, interviewed.has(String(s._id)), app?.offer?.status);
    const flowIdx = KANBAN_ORDER.indexOf(stage);
    FUNNEL.forEach((f, i) => {
      if (f.threshold === null || (flowIdx >= 0 && flowIdx >= KANBAN_ORDER.indexOf(f.threshold))) acc.reached[i] += 1;
    });
    acc.scoreSum += candidateScore(s.cgpa, s.evaluationStatus, s.stage).matchScore;
    const os = app?.offer?.status;
    if (os && OFFER_SENT.includes(os)) acc.offersSent += 1;
    if (os && OFFER_ACCEPTED.includes(os)) acc.offersAccepted += 1;
  }
}

export async function getReport(employerId: string, driveIdParam?: string) {
  const drives = await approvedDrives(employerId);
  const scope = driveIdParam && driveIdParam !== 'all' ? driveIdParam : 'all';
  let targets: string[];
  if (scope === 'all') {
    targets = drives.map((d) => d.id);
  } else {
    if (!Types.ObjectId.isValid(scope)) throw new HttpError(404, 'Drive not found', 'not_found');
    if (!(await hasApprovedRegistration(employerId, scope))) throw new HttpError(400, 'You need an approved registration for this drive', 'registration_not_approved');
    if (!(await Drive.findById(scope).lean())) throw new HttpError(404, 'Drive not found', 'not_found');
    targets = [scope];
  }
  const acc: Acc = { recommended: 0, reached: FUNNEL.map(() => 0), interviewsScheduled: 0, offersSent: 0, offersAccepted: 0, scoreSum: 0 };
  for (const t of targets) await accumulate(employerId, t, acc);
  const funnel = FUNNEL.map((f, i) => ({
    stage: f.stage,
    count: acc.reached[i],
    conversionPct: i === 0 ? 100 : (acc.reached[i - 1] > 0 ? Math.round((acc.reached[i] / acc.reached[i - 1]) * 100) : 0),
  }));
  const shortlisted = acc.reached[1];
  const kpis = {
    recommended: acc.recommended,
    shortlisted,
    interviewsScheduled: acc.interviewsScheduled,
    offersSent: acc.offersSent,
    offersAccepted: acc.offersAccepted,
    dropOffPct: shortlisted > 0 ? Math.round(((shortlisted - acc.offersAccepted) / shortlisted) * 100) : 0,
    avgMatchScore: acc.recommended > 0 ? Math.round(acc.scoreSum / acc.recommended) : 0,
  };
  return { scope, drives, funnel, kpis };
}
```

- [ ] **Step 5: Create the controller + register the route**

Create `server/src/modules/employerPortal/employerReports.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { reportsQuerySchema } from './employerReports.schemas.js';
import { getReport } from './employerReports.service.js';

export async function reportsController(req: Request, res: Response) {
  const { driveId } = reportsQuerySchema.parse(req.query);
  res.json(await getReport(req.userId as string, driveId));
}
```

In `server/src/modules/employerPortal/employerPortal.routes.ts`, add the import (after the offers controller import) and the route (after the offers routes, **before** the final `.get('/employer', ...)`):

```ts
import { reportsController } from './employerReports.controller.js';
```
```ts
employerPortalRoutes.get('/employer/reports', asyncHandler(reportsController));
```

- [ ] **Step 6: Run tests + full server suite + type-check**

Run: `npm test -w server -- --run test/employer-reports.route.test.ts && npm test -w server && npx -w server tsc --noEmit`
Expected: file PASSES; full suite all-green; tsc `ok`. Report counts.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/employerPortal/employerReports.schemas.ts server/src/modules/employerPortal/employerReports.service.ts server/src/modules/employerPortal/employerReports.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-reports.route.test.ts
git commit -m "feat(server): employer reports endpoint (derived funnel + KPIs, no PII)"
```

---

## Task 2: Client — reports page + hook + route + nav

**Files:** Modify `client/src/types/employer.ts`, `EmployerShell.tsx`, `App.tsx`; Create `hooks/useEmployerReports.ts`, `EmployerReports.tsx`, `client/src/test/EmployerReports.test.tsx`.

**Interfaces:**
- Consumes: `apiFetch`/`useAuth`; the Task 1 endpoint.
- Produces: `ReportFunnelStage`/`EmployerReport` types; `useEmployerReports(driveId)`; `EmployerReports` at `/employer/reports`.

- [ ] **Step 1: Add the types**

In `client/src/types/employer.ts`, append:

```ts
export interface ReportFunnelStage { stage: string; count: number; conversionPct: number; }
export interface EmployerReport {
  scope: string;
  drives: { id: string; name: string }[];
  funnel: ReportFunnelStage[];
  kpis: {
    recommended: number; shortlisted: number; interviewsScheduled: number;
    offersSent: number; offersAccepted: number; dropOffPct: number; avgMatchScore: number;
  };
}
```

- [ ] **Step 2: Add the hook**

Create `client/src/pages/EmployerPortal/hooks/useEmployerReports.ts`:

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerReport } from '../../../types/employer.js';

export function useEmployerReports(driveId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-reports', driveId],
    queryFn: () => apiFetch<EmployerReport>(`/me/employer/reports?driveId=${driveId}`, { token }),
    enabled: !!token,
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 3: Write the failing page test**

Create `client/src/test/EmployerReports.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerReports } from '../pages/EmployerPortal/EmployerReports.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const REPORT = {
  scope: 'all',
  drives: [{ id: 'd1', name: 'Aug Drive' }, { id: 'd2', name: 'Sep Drive' }],
  funnel: [
    { stage: 'Recommended', count: 10, conversionPct: 100 }, { stage: 'Shortlisted', count: 6, conversionPct: 60 },
    { stage: 'Confirmed', count: 4, conversionPct: 67 }, { stage: 'Interviewed', count: 3, conversionPct: 75 },
    { stage: 'Offered', count: 2, conversionPct: 67 }, { stage: 'Accepted', count: 1, conversionPct: 50 },
    { stage: 'Joined', count: 1, conversionPct: 100 },
  ],
  kpis: { recommended: 10, shortlisted: 6, interviewsScheduled: 3, offersSent: 2, offersAccepted: 1, dropOffPct: 83, avgMatchScore: 74 },
};
function mockFetch() {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ ...REPORT, scope: url.includes('driveId=d1') ? 'd1' : 'all' }) }; });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/reports']}>
        <AuthProvider><Routes><Route path="/employer/reports" element={<EmployerReports />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerReports', () => {
  beforeEach(() => { localStorage.clear(); (URL as unknown as { createObjectURL?: unknown }).createObjectURL = vi.fn(() => 'blob:x'); (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL = vi.fn(); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('renders the KPI grid + funnel from the report', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Recommended')).toBeInTheDocument());
    expect(screen.getByText(/Drop-off/i)).toBeInTheDocument();
    expect(screen.getByText('Joined')).toBeInTheDocument();
    expect(screen.getByText(/60% of prev/)).toBeInTheDocument(); // Shortlisted conversion
  });

  it('switches drive via the selector (fires a scoped fetch)', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Recommended')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Drive/i), { target: { value: 'd1' } });
    await waitFor(() => expect(calls.some((u) => u.includes('driveId=d1'))).toBe(true));
  });

  it('exports the report CSV', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Recommended')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Export/i }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerReports.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 5: Build the `EmployerReports` page**

Create `client/src/pages/EmployerPortal/EmployerReports.tsx`:

```tsx
import { useState } from 'react';
import { useEmployerReports } from './hooks/useEmployerReports.js';
import type { ReportFunnelStage } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }
const GREEN_STAGES = new Set(['Offered', 'Accepted', 'Joined']);
const KPI_DEFS: { key: string; label: string; suffix?: string; warn?: (v: number) => boolean }[] = [
  { key: 'recommended', label: 'Candidates recommended' },
  { key: 'shortlisted', label: 'Candidates shortlisted' },
  { key: 'interviewsScheduled', label: 'Interviews scheduled' },
  { key: 'offersSent', label: 'Offers sent' },
  { key: 'offersAccepted', label: 'Offers accepted' },
  { key: 'dropOffPct', label: 'Drop-off rate', suffix: '%', warn: (v) => v >= 50 },
  { key: 'avgMatchScore', label: 'Avg match score', suffix: '/100' },
];

export function EmployerReports() {
  const [driveId, setDriveId] = useState('all');
  const report = useEmployerReports(driveId);
  const data = report.data;

  const exportCsv = () => {
    if (!data) return;
    const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [
      `MatchDay Report — ${driveId === 'all' ? 'All drives' : (data.drives.find((d) => d.id === driveId)?.name ?? driveId)}`,
      'Metric,Value',
      ...KPI_DEFS.map((k) => `${esc(k.label)},${(data.kpis as Record<string, number>)[k.key]}${k.suffix ?? ''}`),
      '',
      'Funnel stage,Count,% of prev',
      ...data.funnel.map((f) => `${esc(f.stage)},${f.count},${f.conversionPct}%`),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `matchday-report-${driveId}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const maxCount = data ? Math.max(1, data.funnel[0]?.count ?? 1) : 1;

  return (
    <div className="page-wrap">
      <div className="card"><h2>Reports &amp; analytics</h2><p className="hint">Post-MatchDay funnel and conversion across your drives.</p></div>

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <select className="select" aria-label="Drive" value={driveId} onChange={(e) => setDriveId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="all">All drives</option>
          {(data?.drives ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button type="button" className="btn btn-ghost" disabled={!data} onClick={exportCsv}>Export report</button>
      </div>

      {report.isLoading ? <p className="hint">Loading…</p>
        : report.isError ? <p className="hint">{errMsg(report.error)}</p>
        : !data ? null
        : (
          <>
            <div className="kpi-grid" style={{ marginBottom: 18 }}>
              {KPI_DEFS.map((k) => {
                const v = (data.kpis as Record<string, number>)[k.key];
                return (
                  <div className="kpi" key={k.key}>
                    <div className="klabel">{k.label}</div>
                    <div className="kn" style={k.warn?.(v) ? { color: 'var(--amber)' } : undefined}>{v}{k.suffix ?? ''}</div>
                  </div>
                );
              })}
            </div>

            <div className="card">
              <div className="card-head"><h3>Hiring funnel</h3></div>
              <div className="card-body">
                <div className="rep-funnel">
                  {data.funnel.map((f: ReportFunnelStage, i: number) => (
                    <div className="rf-row" key={f.stage}>
                      <div className="rf-l">{f.stage}</div>
                      <div className="rf-track"><i className={GREEN_STAGES.has(f.stage) ? 'green' : ''} style={{ width: `${Math.max(3, (f.count / maxCount) * 100)}%` }} /></div>
                      <div className="rf-right"><div className="rf-v">{f.count}</div><div className="rf-conv">{i > 0 ? `${f.conversionPct}% of prev` : ' '}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
```

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- --run src/test/EmployerReports.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Add the route + repoint the nav**

(a) `client/src/App.tsx`: import `EmployerReports` near the other employer imports; add the route (a top-level employer route, e.g. after `/employer/registrations`):

```tsx
        <Route path="/employer/reports" element={<RoleRoute role="employer"><EmployerShell><EmployerReports /></EmployerShell></RoleRoute>} />
```

(b) `client/src/pages/EmployerPortal/EmployerShell.tsx`: repoint the existing Reports nav item's `path` from `'/employer/coming-soon/reports'` to `'/employer/reports'` (the item at the "Insights" section, `slug: 'reports'`).

- [ ] **Step 8: Full client suite + type-check + build + commit**

Run: `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`
Expected: all-green (existing tests unaffected — the nav repoint doesn't change any tested selector); tsc `ok`; build succeeds.

```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal/hooks/useEmployerReports.ts client/src/pages/EmployerPortal/EmployerReports.tsx client/src/pages/EmployerPortal/EmployerShell.tsx client/src/App.tsx client/src/test/EmployerReports.test.tsx
git commit -m "feat(client): reports & analytics page (funnel + KPIs + CSV export) + nav repoint"
```

---

## Task 3: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` && `npm test -w client`. Report counts.
- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer10_smoke`)** — kill any stale :4099 listener first, seed, start the server on `PORT=4099`, confirm no `EADDRINUSE`. Mint tokens via `signToken`; create an Approved registration directly; seed a spread of Applications (a shortlisted-only, a granted, one with an Interview, one with an offer status Joined) for pool candidates. Then:
  - `GET /api/me/employer/reports?driveId=<id>` → the funnel counts descend monotonically (Recommended ≥ Shortlisted ≥ … ≥ Joined) and match the seed; KPIs (`recommended`/`shortlisted`/`interviewsScheduled`/`offersSent`/`offersAccepted`/`dropOffPct`/`avgMatchScore`) are correct; the payload contains **no** seeded name/email.
  - `GET ?driveId=all` → `scope:'all'`, sums across the employer's approved drives; `drives` lists them.
  - A non-approved drive → `registration_not_approved`; an unknown id → 404; employer B's data is not counted; admin → 403.
- [ ] **Step 4: Teardown** — kill the server by listener PID; drop `matchday_employer10_smoke`; confirm shared `matchday` untouched. No commit.

---

## Notes for the executor
- Stacked on 9; the base has all of 5a–9. Do not re-implement `poolSeekers`/`candidateScore`/`deriveStage`/`KANBAN_ORDER`.
- **Read-only + no PII**: the report loads pool seekers for `candidateScore` (cgpa/evalStatus/stage — non-identity, via `poolSeekers`' existing `.select`) but never `name`/`email`; a server test greps the payload for their absence.
- The funnel is monotonic (flow-index thresholds); KPIs are real cumulative counts (`offersSent` includes declined) — see the spec's KPI-vs-funnel note.
- `/employer/reports` is a **top-level** employer route (not under `/drives/:id`); it sits on the same `.use('/employer', requireAuth, requireRole('employer'))` gate, registered before the final `.get('/employer')`.
- KPI tiles use ported `.kpi`/`.klabel`/`.kn`; the funnel uses ported `.rep-funnel`/`.rf-row`/`.rf-l`/`.rf-track`(+`i.green`)/`.rf-right`/`.rf-v`/`.rf-conv`.
- `Date.now()`/`new Date()` fine.
- Known stubs: no Top-skills / attendance metrics (no backing data); recomputed on read (no caching).
