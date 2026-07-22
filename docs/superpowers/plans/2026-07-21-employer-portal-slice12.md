# Employer Portal — Slice 12: Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A self-contained employer support surface — a static FAQ + a "raise a request" form that persists a real, employer-scoped `SupportRequest`, plus a "My requests" list.

**Architecture:** One new `SupportRequest` model + two endpoints on the existing `/employer` gate (create + list-own), and one `EmployerSupport` page reached from a new topbar Help icon. The ticket reference is derived from `_id` (never stored). In-app only — no email/notification delivery.

**Tech Stack:** Node/Express + Mongoose (ESM, `.js` imports), Zod; React + React Query + React Router; Vitest + Supertest / Testing Library.

## Global Constraints
- Base: `feat/employer-portal-slice12`, **stacked on `feat/employer-portal-slice11`** (worktree `~/code/matchday-employer12`). Do not rebase onto main.
- `employerId` from `req.userId` (JWT `sub`); the create schema must NOT accept `employerId`/`status`. Employer-scoped list (never another employer's).
- Derived ticket `ref = SUP-<last 6 of _id, uppercased>` — never a stored counter.
- Error envelope `{ error:{message,code} }`; ESM `.js` specifiers. Reuse ported CSS only (no new CSS).

## Prerequisites
`cd ~/code/matchday-employer12 && npm install`. Verify baseline: `npm test -w server -- --run test/employer-notifications.route.test.ts` passes.

## File Structure
**Server — create:** `server/src/models/SupportRequest.ts`; `server/src/modules/employerPortal/employerSupport.schemas.ts`, `employerSupport.service.ts`, `employerSupport.controller.ts`; `server/test/employer-support.route.test.ts`.
**Server — modify:** `employerPortal.routes.ts` (+2 routes).
**Client — create:** `client/src/pages/EmployerPortal/hooks/useEmployerSupport.ts`, `EmployerSupport.tsx`; `client/src/test/EmployerSupport.test.tsx`.
**Client — modify:** `client/src/types/employer.ts`, `EmployerShell.tsx` (Help icon), `App.tsx` (route).

---

## Task 1: Server — SupportRequest model + create/list endpoints

**Files:** Create `SupportRequest.ts`, `employerSupport.schemas.ts`, `employerSupport.service.ts`, `employerSupport.controller.ts`, `server/test/employer-support.route.test.ts`; Modify `employerPortal.routes.ts`.

**Interfaces:**
- Produces: `createSupportRequest(employerId, input)`, `listSupportRequests(employerId) → { items }`; routes `GET`/`POST /employer/support`; model `SupportRequest` + `SUPPORT_CATEGORIES`/`SUPPORT_PRIORITIES`/`SUPPORT_STATUSES`.

- [ ] **Step 1: Create the model**

Create `server/src/models/SupportRequest.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

export const SUPPORT_CATEGORIES = [
  'More candidates', 'Slot change', 'Candidate replacement', 'No-show',
  'Profile/data issue', 'Resume access', 'Commercial/billing', 'Other',
] as const;
export const SUPPORT_PRIORITIES = ['Low', 'Normal', 'High'] as const;
export const SUPPORT_STATUSES = ['Open', 'In progress', 'Resolved'] as const;

const supportRequestSchema = new Schema({
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true, index: true },
  category: { type: String, enum: SUPPORT_CATEGORIES, required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  priority: { type: String, enum: SUPPORT_PRIORITIES, default: 'Normal' },
  status: { type: String, enum: SUPPORT_STATUSES, default: 'Open' },
  createdAt: { type: Date, default: Date.now },
});

export type SupportRequestDoc = InferSchemaType<typeof supportRequestSchema>;
export const SupportRequest = model('SupportRequest', supportRequestSchema);
```

- [ ] **Step 2: Create the zod schema**

Create `server/src/modules/employerPortal/employerSupport.schemas.ts`:

```ts
import { z } from 'zod';
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES } from '../../models/SupportRequest.js';

export const createSupportSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(4000),
  priority: z.enum(SUPPORT_PRIORITIES).default('Normal'),
});
export type CreateSupportInput = z.infer<typeof createSupportSchema>;
```

(If tsc rejects `z.enum` on the `as const` readonly array, change to `z.enum([...SUPPORT_CATEGORIES] as [string, ...string[]])` / same for priorities.)

- [ ] **Step 3: Write the failing route test**

Create `server/test/employer-support.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { SupportRequest } from '../src/models/SupportRequest.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane', ...over });
}
function tokenFor(e: { _id: unknown }) { return signToken({ sub: String(e._id), role: 'employer' }); }

describe('employer support', () => {
  it('POST creates an Open request (employerId server-set, derived ref, spoofed fields ignored)', async () => {
    const emp = await employer();
    const res = await request(createApp()).post('/api/me/employer/support')
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send({ category: 'No-show', subject: 'Candidate absent', message: 'The 10am candidate did not show.', priority: 'High', employerId: '000000000000000000000000', status: 'Resolved' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Open');           // spoofed status ignored
    expect(res.body.category).toBe('No-show');
    expect(res.body.priority).toBe('High');
    expect(res.body.ref).toBe(`SUP-${String(res.body.id).slice(-6).toUpperCase()}`);
    // persisted under the caller's employerId, not the spoofed one
    const doc = await SupportRequest.findById(res.body.id).lean();
    expect(String(doc!.employerId)).toBe(String(emp._id));
  });

  it('POST rejects a bad category / empty subject', async () => {
    const emp = await employer(); const auth = { Authorization: `Bearer ${tokenFor(emp)}` };
    expect((await request(createApp()).post('/api/me/employer/support').set(auth).send({ category: 'Nope', subject: 'x', message: 'y' })).status).toBe(400);
    expect((await request(createApp()).post('/api/me/employer/support').set(auth).send({ category: 'Other', subject: '  ', message: 'y' })).status).toBe(400);
  });

  it('GET lists only the caller\'s own requests, newest-first', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const app = createApp();
    await request(app).post('/api/me/employer/support').set('Authorization', `Bearer ${tokenFor(a)}`).send({ category: 'Other', subject: 'first', message: 'm' });
    await request(app).post('/api/me/employer/support').set('Authorization', `Bearer ${tokenFor(a)}`).send({ category: 'Other', subject: 'second', message: 'm' });
    await request(app).post('/api/me/employer/support').set('Authorization', `Bearer ${tokenFor(b)}`).send({ category: 'Other', subject: 'bee', message: 'm' });
    const listA = await request(app).get('/api/me/employer/support').set('Authorization', `Bearer ${tokenFor(a)}`);
    expect(listA.status).toBe(200);
    expect(listA.body.items).toHaveLength(2);
    expect(listA.body.items.map((i: { subject: string }) => i.subject)).not.toContain('bee');
    expect(listA.body.items[0].subject).toBe('second'); // newest first
  });

  it('401 no token / 403 admin token', async () => {
    const a = await employer();
    expect((await request(createApp()).get('/api/me/employer/support')).status).toBe(401);
    expect((await request(createApp()).get('/api/me/employer/support').set('Authorization', `Bearer ${signToken({ sub: String(a._id), role: 'admin' })}`)).status).toBe(403);
  });
});
```

- [ ] **Step 4: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-support.route.test.ts` → FAIL (route missing).

- [ ] **Step 5: Create the service**

Create `server/src/modules/employerPortal/employerSupport.service.ts`:

```ts
import type { Types } from 'mongoose';
import { SupportRequest } from '../../models/SupportRequest.js';
import type { CreateSupportInput } from './employerSupport.schemas.js';

function ref(id: Types.ObjectId | string): string { return `SUP-${String(id).slice(-6).toUpperCase()}`; }

interface SupportLean { _id: Types.ObjectId; category: string; subject: string; message: string; priority: string; status: string; createdAt: Date }
function project(r: SupportLean) {
  return { id: String(r._id), ref: ref(r._id), category: r.category, subject: r.subject, message: r.message, priority: r.priority, status: r.status, createdAt: new Date(r.createdAt).toISOString() };
}

export async function createSupportRequest(employerId: string, input: CreateSupportInput) {
  const doc = await SupportRequest.create({
    employerId, category: input.category, subject: input.subject, message: input.message, priority: input.priority, status: 'Open',
  });
  return project(doc.toObject() as unknown as SupportLean);
}

export async function listSupportRequests(employerId: string) {
  const rows = await SupportRequest.find({ employerId }).sort({ createdAt: -1 }).lean<SupportLean[]>();
  return { items: rows.map(project) };
}
```

- [ ] **Step 6: Create the controller + register routes**

Create `server/src/modules/employerPortal/employerSupport.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { createSupportSchema } from './employerSupport.schemas.js';
import { createSupportRequest, listSupportRequests } from './employerSupport.service.js';

export async function createSupportController(req: Request, res: Response) {
  const input = createSupportSchema.parse(req.body);
  res.status(201).json(await createSupportRequest(req.userId as string, input));
}
export async function supportListController(req: Request, res: Response) {
  res.json(await listSupportRequests(req.userId as string));
}
```

In `employerPortal.routes.ts`, add the import (after the notifications-controller import) and the two routes (after the notifications routes, **before** the final `.get('/employer', ...)`):

```ts
import { createSupportController, supportListController } from './employerSupport.controller.js';
```
```ts
employerPortalRoutes.get('/employer/support', asyncHandler(supportListController));
employerPortalRoutes.post('/employer/support', asyncHandler(createSupportController));
```

- [ ] **Step 7: Run tests + full server suite + type-check**

Run: `npm test -w server -- --run test/employer-support.route.test.ts && npm test -w server && npx -w server tsc --noEmit`
Expected: file PASSES (4 tests); full suite green (known flaky `test/eval-configs.service.test.ts` may flake — ignore only that); tsc `ok`.

- [ ] **Step 8: Commit**

```bash
git add server/src/models/SupportRequest.ts server/src/modules/employerPortal/employerSupport.schemas.ts server/src/modules/employerPortal/employerSupport.service.ts server/src/modules/employerPortal/employerSupport.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/test/employer-support.route.test.ts
git commit -m "feat(server): employer support requests (SupportRequest model + create/list, derived ref)"
```

---

## Task 2: Client — support page + Help icon + route

**Files:** Modify `types/employer.ts`, `EmployerShell.tsx`, `App.tsx`; Create `hooks/useEmployerSupport.ts`, `EmployerSupport.tsx`, `client/src/test/EmployerSupport.test.tsx`.

**Interfaces:**
- Consumes: `apiFetch`/`useAuth`; the Task 1 endpoints; `formatRelativeTime` (`./hooks/useEmployerNotifications.js`).
- Produces: `SupportRequestItem`/`SupportListResponse` types + `SUPPORT_CATEGORIES`; `useEmployerSupport`/`useCreateSupportRequest`; `EmployerSupport` at `/employer/support`; a topbar Help icon.

- [ ] **Step 1: Add types**

In `client/src/types/employer.ts`, append:

```ts
export const SUPPORT_CATEGORIES = [
  'More candidates', 'Slot change', 'Candidate replacement', 'No-show',
  'Profile/data issue', 'Resume access', 'Commercial/billing', 'Other',
] as const;
export type SupportCategory = typeof SUPPORT_CATEGORIES[number];
export interface SupportRequestItem {
  id: string; ref: string; category: SupportCategory; subject: string; message: string;
  priority: 'Low' | 'Normal' | 'High'; status: 'Open' | 'In progress' | 'Resolved'; createdAt: string;
}
export interface SupportListResponse { items: SupportRequestItem[]; }
```

- [ ] **Step 2: Add the hook**

Create `client/src/pages/EmployerPortal/hooks/useEmployerSupport.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { SupportListResponse, SupportRequestItem } from '../../../types/employer.js';

export function useEmployerSupport() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-support'],
    queryFn: () => apiFetch<SupportListResponse>('/me/employer/support', { token }),
    enabled: !!token,
  });
}

export interface CreateSupportBody { category: string; subject: string; message: string; priority: string; }
export function useCreateSupportRequest() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSupportBody) => apiFetch<SupportRequestItem>('/me/employer/support', { method: 'POST', body, token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employer-support'] }); },
  });
}
```

(Match the exact `apiFetch` option shape used by sibling mutation hooks, e.g. `useEmployerOffers.ts` — `{ method, body, token }`.)

- [ ] **Step 3: Write the failing page test**

Create `client/src/test/EmployerSupport.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerSupport } from '../pages/EmployerPortal/EmployerSupport.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const LIST = { items: [{ id: 's1', ref: 'SUP-ABC123', category: 'No-show', subject: 'Candidate absent', message: 'The 10am candidate did not show.', priority: 'High', status: 'Open', createdAt: '2026-07-04T10:00:00.000Z' }] };
function mockFetch(list = LIST) {
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method, body: init?.body });
    if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: 's2', ref: 'SUP-XYZ999', category: 'Slot change', subject: 'x', message: 'y', priority: 'Normal', status: 'Open', createdAt: '2026-07-05T00:00:00.000Z' }) };
    return { ok: true, status: 200, json: async () => list };
  }));
  return { calls };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/support']}>
        <AuthProvider><Routes><Route path="/employer/support" element={<EmployerSupport />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerSupport', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('renders FAQ, the request form, and an existing ticket', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Candidate absent')).toBeInTheDocument());
    expect(screen.getByText('SUP-ABC123 · No-show')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit request/i })).toBeInTheDocument();
    expect(screen.getByText(/Frequently asked questions/i)).toBeInTheDocument();
  });

  it('submits a request (POST with the chosen fields)', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Submit request/i })).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Short summary/i), { target: { value: 'Need more profiles' } });
    fireEvent.change(screen.getByPlaceholderText(/Describe your request/i), { target: { value: 'Please add 5 more candidates.' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit request/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.includes('/me/employer/support') && (c.body ?? '').includes('Need more profiles'))).toBe(true));
  });

  it('shows the empty state when there are no requests', async () => {
    seedAuth(); mockFetch({ items: [] }); renderPage();
    await waitFor(() => expect(screen.getByText(/No requests yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerSupport.test.tsx` → FAIL (module missing).

- [ ] **Step 5: Build the page**

Create `client/src/pages/EmployerPortal/EmployerSupport.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useEmployerSupport, useCreateSupportRequest } from './hooks/useEmployerSupport.js';
import { formatRelativeTime } from './hooks/useEmployerNotifications.js';
import { SUPPORT_CATEGORIES, type SupportCategory } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

const FAQS: { q: string; a: string }[] = [
  { q: 'How do I register my company for a drive?', a: 'Open a drive under Available Drives and use Register to submit your requirement. Once an admin approves it you can create slots, view candidates, and schedule interviews for that drive.' },
  { q: 'Why can’t I see candidate names?', a: 'Candidate identities are masked until the candidate grants your identity-reveal request. Shortlist a candidate, request a reveal, and their name and contact appear once they consent.' },
  { q: 'How do interview slots work?', a: 'For an approved drive you create your own interview slots on the drive’s event dates. Candidates book into them, and you schedule interviews against a booked, consent-granted candidate.' },
  { q: 'How do I make an offer?', a: 'Once a candidate has granted consent, open their card and record an offer (CTC, location, mode, joining date). The offer status flows into your pipeline board automatically.' },
  { q: 'What do the bell and reports show?', a: 'The notification bell surfaces async updates (registration approvals, consent responses, slot bookings). Reports show a derived hiring funnel and KPIs across your drives.' },
  { q: 'Something isn’t working — how do I get help?', a: 'Raise a request below: pick a category, describe the issue, and the Hiringhood team will action it. You’ll see it tracked under “My requests”.' },
];
const STATUS_CLASS: Record<string, string> = { Open: 'st-cr', 'In progress': 'st-inprog', Resolved: 'st-completed' };

export function EmployerSupport() {
  const list = useEmployerSupport();
  const create = useCreateSupportRequest();
  const [category, setCategory] = useState<SupportCategory>('More candidates');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High'>('Normal');
  const [err, setErr] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!subject.trim() || !message.trim()) { setErr('Subject and details are required.'); return; }
    create.mutate({ category, subject: subject.trim(), message: message.trim(), priority }, {
      onSuccess: () => { setSubject(''); setMessage(''); setPriority('Normal'); setCategory('More candidates'); },
      onError: (e2) => setErr(e2 instanceof ApiError ? e2.message : e2 instanceof Error ? e2.message : 'Failed to submit your request'),
    });
  }

  const items = list.data?.items ?? [];
  return (
    <div className="page-wrap">
      <div className="dash-greet"><h2>Support center</h2><p>Find quick answers, or raise a request and the Hiringhood team will action it.</p></div>

      <div className="card">
        <div className="card-head"><h3>Frequently asked questions</h3></div>
        <div className="card-body">
          {FAQS.map((f) => (
            <details className="faq" key={f.q}>
              <summary>{f.q}<svg className="q-ic" viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg></summary>
              <div className="a">{f.a}</div>
            </details>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Raise a request</h3></div>
        <div className="card-body">
          <form className="sup-form-grid" onSubmit={submit}>
            <div className="sup-field">
              <label>Category</label>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
                {SUPPORT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sup-field">
              <label>Priority</label>
              <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as 'Low' | 'Normal' | 'High')}>
                <option value="Low">Low</option><option value="Normal">Normal</option><option value="High">High</option>
              </select>
            </div>
            <div className="sup-field wide">
              <label>Subject</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
            </div>
            <div className="sup-field wide">
              <label>Details</label>
              <textarea className="input" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your request" />
            </div>
            {err && <div className="sup-field wide" role="alert" style={{ color: '#b42318', fontSize: 13 }}>{err}</div>}
            <div className="sup-field wide">
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>{create.isPending ? 'Submitting…' : 'Submit request'}</button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>My requests</h3></div>
        <div className="card-body">
          {list.isLoading ? <p className="hint">Loading…</p>
            : list.isError ? <p className="hint">Failed to load your requests.</p>
            : items.length === 0 ? <p className="hint">No requests yet — raise one above and it’ll show up here.</p>
            : items.map((t) => (
              <div className="ticket-row" key={t.id}>
                <div className="ticket-main">
                  <div className="ticket-ref">{t.ref} · {t.category}</div>
                  <div className="ticket-t">{t.subject}</div>
                  <div className="ticket-s">{t.message}</div>
                </div>
                <div className="ticket-meta">
                  <span className={`status-pill ${STATUS_CLASS[t.status] ?? ''}`}>{t.status}</span>
                  <span className="ticket-time">{formatRelativeTime(t.createdAt)}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
```

(Verify `.btn.btn-primary`, `.input`, `.select` are the same control classes used by a sibling form — check `EmployerSlots.tsx` / `EmployerRegister.tsx`; if `.btn-primary` isn't present, use whatever primary-button class those forms use.)

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- --run src/test/EmployerSupport.test.tsx` → PASS (3 tests).

- [ ] **Step 7: Add the topbar Help icon + route**

(a) `EmployerShell.tsx`: inside `<div className="tb-actions">`, add a Help button immediately BEFORE the notifications bell:

```tsx
            <button type="button" className="icon-btn" aria-label="Help" onClick={() => navigate('/employer/support')}>
              <svg className="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 013.9-1.6c1.1.7 1.1 2 .1 2.8-.7.5-1.5.9-1.5 1.8" /><path d="M12 17h.01" /></svg>
            </button>
```

(b) `App.tsx`: import `EmployerSupport` near the other employer imports; add the route after `/employer/notifications`:

```tsx
        <Route path="/employer/support" element={<RoleRoute role="employer"><EmployerShell><EmployerSupport /></EmployerShell></RoleRoute>} />
```

- [ ] **Step 8: Full client suite + type-check + build + commit**

Run: `npm test -w client && npx -w client tsc --noEmit && npm run -w client build` → all green.

```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal/hooks/useEmployerSupport.ts client/src/pages/EmployerPortal/EmployerSupport.tsx client/src/pages/EmployerPortal/EmployerShell.tsx client/src/App.tsx client/src/test/EmployerSupport.test.tsx
git commit -m "feat(client): employer support center (FAQ + request form + my-requests) + topbar Help"
```

---

## Task 3: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` && `npm test -w client`. Report counts.
- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer12_smoke`)** — inspect the server's Mongo connection; kill any stale :4099 listener first (`lsof -nP -iTCP:4099 -sTCP:LISTEN -t | xargs -r kill`); seed two employers (A, B); mint tokens (A, B, admin) via `signToken`. Start the server on `PORT=4099` pointed at the smoke DB (no `EADDRINUSE`). Then:
  - `POST /api/me/employer/support` as A with a spoofed `employerId`/`status` in the body → 201, `status:'Open'`, `ref` = `SUP-`+id-last6-upper, persisted under A's id (not the spoofed one).
  - `POST` with a bad category → 400.
  - `GET /api/me/employer/support` as A → only A's requests, newest-first; B's requests excluded (create one for B and confirm A doesn't see it).
  - Admin token → 403; no token → 401.
- [ ] **Step 4: Teardown** — kill the server by listener PID; drop `matchday_employer12_smoke`; confirm shared `matchday` untouched. No commit.

---

## Notes for the executor
- Stacked on slice 11; reuse `formatRelativeTime` from `useEmployerNotifications.ts`; reuse ported CSS (`.faq`/`.q-ic`, `.sup-form-grid`/`.sup-field`, `.ticket-*`, `.status-pill`+`.st-cr`/`.st-inprog`/`.st-completed`) — no CSS changes.
- The support request is honest stored data; `ref` is derived (`SUP-<last6>`), never a stored counter. `status` is server-owned (always 'Open' on create).
- `/employer/support` is a top-level employer route on the `.use('/employer', requireAuth, requireRole('employer'))` gate, registered before the final `.get('/employer')`.
- `Date.now()`/`new Date()` fine.
- Known stubs: no admin ticket UI; no email/notification; single generic form.
