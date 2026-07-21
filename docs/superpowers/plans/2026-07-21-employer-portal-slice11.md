# Employer Portal — Slice 11: Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A derived, in-app employer notification feed (bell + badge + notification center) of the async events an employer must react to — no new entity, no write-path hooks, no PII.

**Architecture:** One derivation service computes the feed on read from existing state (registration `activity[]`, `Application.consent`, `SlotBooking` on the employer's slots), each item carrying its real event timestamp. The only persisted state is a per-employer `notificationsReadAt` cursor. Two endpoints (feed + mark-read) on the existing `/employer` gate, plus `notificationsUnread`/`notifications` added to the `/api/me/employer` aggregate. Client: a topbar bell, a notification-center page, and a restored dashboard "recent" card.

**Tech Stack:** Node/Express + Mongoose (ESM, `.js` imports), Zod; React + React Query + React Router; Vitest + Supertest (server), Vitest + Testing Library (client).

## Global Constraints
- Base: `feat/employer-portal-slice11`, **stacked on `feat/employer-portal-slice10`** (worktree `~/code/matchday-employer11`). Do not rebase onto main.
- **Read-only derivation** — the only write is the employer's own `notificationsReadAt` cursor. **No producing service (`employerConsent`/`employerInterviews`/`employerOffers`/admin) is modified.**
- **No PII** — notification bodies use candidate **codes** (`codeFor`), drive names, and dates only. Never jobseeker name/email.
- **Employer-scoped** — every query keyed by `employerId` from `req.userId` (JWT `sub`); employer B's data never appears.
- **Three categories only:** `registration`, `candidate`, `slot`. Offer/decision/stage events are excluded (no per-event timestamp). No preferences/channels UI.
- Error envelope `{ error: { message, code } }`. ESM `.js` import specifiers.

## Prerequisites
`cd ~/code/matchday-employer11 && npm install`. Verify: `npm test -w server -- --run test/employer-reports.route.test.ts` passes (slice-10 baseline).

## File Structure
**Server — create:** `server/src/modules/employerPortal/employerNotifications.service.ts`, `employerNotifications.controller.ts`; `server/test/employer-notifications.route.test.ts`.
**Server — modify:** `server/src/models/Employer.ts` (+1 field), `employerPortal.routes.ts` (+2 routes), `employerPortal.service.ts` (aggregate +2 fields).
**Client — create:** `client/src/pages/EmployerPortal/hooks/useEmployerNotifications.ts`, `EmployerNotifications.tsx`; `client/src/test/EmployerNotifications.test.tsx`, `client/src/test/EmployerShellBell.test.tsx`.
**Client — modify:** `client/src/types/employer.ts`, `EmployerShell.tsx` (bell), `EmployerDashboard.tsx` (recent card), `App.tsx` (route).

---

## Task 1: Server — notifications derivation + endpoints + aggregate

**Files:** Create `employerNotifications.service.ts`, `employerNotifications.controller.ts`, `server/test/employer-notifications.route.test.ts`; Modify `Employer.ts`, `employerPortal.routes.ts`, `employerPortal.service.ts`.

**Interfaces:**
- Consumes: models `Employer`/`RegistrationRequest`/`Application`/`Slot`/`SlotBooking`/`Drive`; `codeFor` (`../jobseekers/jobseekers.service.js`); `asyncHandler`.
- Produces: `buildNotifications(employerId) → { items, unreadCount, lastReadAt }`, `notificationsSummary(employerId) → { unreadCount, recent }`, `markNotificationsRead(employerId) → { lastReadAt, unreadCount }`; routes `GET /employer/notifications`, `POST /employer/notifications/read`; aggregate `notifications`/`notificationsUnread`.

- [ ] **Step 1: Add the read cursor to the Employer model**

In `server/src/models/Employer.ts`, add one field to `employerSchema` (after `gstNumber`, before the closing `});`):

```ts
  notificationsReadAt: { type: Date, default: undefined },
```

(The existing `toJSON`/`toObject` transforms only strip `passwordHash`; this additive field is the employer's own cursor and is safe to serialize.)

- [ ] **Step 2: Write the failing route test**

Create `server/test/employer-notifications.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Institute } from '../src/models/Institute.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { Application } from '../src/models/Application.js';
import { Slot } from '../src/models/Slot.js';
import { SlotBooking } from '../src/models/SlotBooking.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane', ...over });
}
function tokenFor(e: { _id: unknown }) { return signToken({ sub: String(e._id), role: 'employer' }); }
async function drive(name = 'Data Drive') {
  return Drive.create({
    name, domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
    eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' },
  });
}
async function seeker(email: string, name: string) {
  const inst = await Institute.create({ name: 'Smoke College', city: 'Hyderabad', type: 'Tier-1' });
  return Jobseeker.create({ name, email, instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', evaluationStatus: 'completed', stage: 'MatchReady' });
}

describe('GET /api/me/employer/notifications', () => {
  it('derives the feed (3 categories, newest-first, PII-free) + unread flags', async () => {
    const emp = await employer(); const d = await drive();
    const t0 = new Date('2026-07-01T10:00:00Z'), t1 = new Date('2026-07-02T10:00:00Z'), t2 = new Date('2026-07-03T10:00:00Z'), t3 = new Date('2026-07-04T10:00:00Z');
    // registration events (Submitted excluded; Approved + Rejected included)
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: d.name, role: 'SDE', status: 'Approved', activity: [{ action: 'Approved', by: 'admin', at: t2 }, { action: 'Submitted', by: 'Jane', at: t0 }] });
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: d.name, role: 'DA', status: 'Rejected', activity: [{ action: 'Rejected — off cycle', by: 'admin', at: t1 }] });
    // consent events
    const sG = await seeker('grant@x.test', 'Grant Name');
    const sD = await seeker('deny@x.test', 'Deny Name');
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: sG._id, decision: 'Shortlisted', consent: { status: 'granted', requestedAt: t0, expiresAt: t3, respondedAt: t3 } });
    await Application.create({ employerId: emp._id, driveId: d._id, jobseekerId: sD._id, decision: 'Shortlisted', consent: { status: 'declined', requestedAt: t0, expiresAt: t3, respondedAt: t1 } });
    // slot booking
    const sB = await seeker('book@x.test', 'Book Name');
    const slot = await Slot.create({ driveId: d._id, employerId: emp._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00', capacity: 10, status: 'Scheduled' });
    await SlotBooking.create({ slotId: slot._id, jobseekerId: sB._id, status: 'Booked', createdAt: t2 });

    const res = await request(createApp()).get('/api/me/employer/notifications').set('Authorization', `Bearer ${tokenFor(emp)}`);
    expect(res.status).toBe(200);
    const items = res.body.items as { category: string; at: string; read: boolean; body: string }[];
    expect(items).toHaveLength(5); // Approved, Rejected, granted, declined, booking (Submitted excluded)
    expect(items.filter((i) => i.category === 'registration')).toHaveLength(2);
    expect(items.filter((i) => i.category === 'candidate')).toHaveLength(2);
    expect(items.filter((i) => i.category === 'slot')).toHaveLength(1);
    // newest-first
    const times = items.map((i) => i.at);
    expect(times).toEqual([...times].sort().reverse());
    // unread: cursor unset → all unread
    expect(res.body.unreadCount).toBe(5);
    expect(items.every((i) => i.read === false)).toBe(true);
    expect(res.body.lastReadAt).toBeNull();
    // NO PII
    const raw = JSON.stringify(res.body);
    for (const n of ['Grant Name', 'Deny Name', 'Book Name', 'grant@x.test', 'deny@x.test', 'book@x.test']) expect(raw).not.toContain(n);
    // codes present
    expect(raw).toContain('C-');
  });

  it('mark-read sets the cursor: unread→0, items read, persisted', async () => {
    const emp = await employer(); const d = await drive();
    await RegistrationRequest.create({ company: 'Acme', industry: 'Tech', submittedBy: 'Jane', employerId: emp._id, driveId: d._id, driveName: d.name, role: 'SDE', status: 'Approved', activity: [{ action: 'Approved', by: 'admin', at: new Date('2026-07-02T10:00:00Z') }] });
    const app = createApp(); const auth = { Authorization: `Bearer ${tokenFor(emp)}` };
    expect((await request(app).get('/api/me/employer/notifications').set(auth)).body.unreadCount).toBe(1);
    const marked = await request(app).post('/api/me/employer/notifications/read').set(auth);
    expect(marked.status).toBe(200);
    expect(marked.body.unreadCount).toBe(0);
    expect(typeof marked.body.lastReadAt).toBe('string');
    const after = await request(app).get('/api/me/employer/notifications').set(auth);
    expect(after.body.unreadCount).toBe(0);
    expect((after.body.items as { read: boolean }[]).every((i) => i.read)).toBe(true);
    expect(after.body.lastReadAt).not.toBeNull();
  });

  it('is employer-scoped; aggregate exposes counts; 401/403', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const d = await drive();
    await RegistrationRequest.create({ company: 'Beta', industry: 'Tech', submittedBy: 'Bob', employerId: b._id, driveId: d._id, driveName: d.name, role: 'SDE', status: 'Approved', activity: [{ action: 'Approved', by: 'admin', at: new Date() }] });
    const app = createApp();
    // A sees none of B's
    expect((await request(app).get('/api/me/employer/notifications').set('Authorization', `Bearer ${tokenFor(a)}`)).body.items).toHaveLength(0);
    // aggregate for B includes the count + recent
    const agg = await request(app).get('/api/me/employer').set('Authorization', `Bearer ${tokenFor(b)}`);
    expect(agg.body.dashboard.notificationsUnread).toBe(1);
    expect(agg.body.dashboard.notifications).toHaveLength(1);
    // 401 / 403
    expect((await request(app).get('/api/me/employer/notifications')).status).toBe(401);
    expect((await request(app).post('/api/me/employer/notifications/read').set('Authorization', `Bearer ${signToken({ sub: String(a._id), role: 'admin' })}`)).status).toBe(403);
  });
});
```

- [ ] **Step 3: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-notifications.route.test.ts`
Expected: FAIL — service/routes missing.

- [ ] **Step 4: Create the derivation service**

Create `server/src/modules/employerPortal/employerNotifications.service.ts`:

```ts
import { Types } from 'mongoose';
import { Employer } from '../../models/Employer.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import { Application } from '../../models/Application.js';
import { Slot } from '../../models/Slot.js';
import { SlotBooking } from '../../models/SlotBooking.js';
import { Drive } from '../../models/Drive.js';
import { codeFor } from '../jobseekers/jobseekers.service.js';

export type NotificationCategory = 'registration' | 'candidate' | 'slot';
export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  at: string;   // ISO
  link: string;
  read: boolean;
}
type RawItem = Omit<NotificationItem, 'read'>;

const REG_PREFIXES = ['Approved', 'Rejected', 'Changes requested'];

interface RegLean { _id: Types.ObjectId; driveName?: string; role?: string; activity?: { action: string; at: Date }[] }
interface AppLean { _id: Types.ObjectId; driveId: Types.ObjectId; jobseekerId: Types.ObjectId; consent?: { status?: string; respondedAt?: Date; requestedAt?: Date } }
interface SlotLean { _id: Types.ObjectId; driveId: Types.ObjectId; date: Date; start: string }
interface BookingLean { _id: Types.ObjectId; slotId: Types.ObjectId; jobseekerId: Types.ObjectId; createdAt: Date }

async function rawItems(employerId: string): Promise<RawItem[]> {
  const items: RawItem[] = [];

  // 1) registration status changes (from activity[])
  const regs = await RegistrationRequest.find({ employerId }).select('driveName role activity').lean<RegLean[]>();
  for (const r of regs) {
    (r.activity ?? []).forEach((a, idx) => {
      const prefix = REG_PREFIXES.find((p) => a.action.startsWith(p));
      if (!prefix) return;
      items.push({
        id: `reg:${r._id}:${idx}`,
        category: 'registration',
        title: `Registration ${prefix.toLowerCase()}`,
        body: `Your registration for "${r.driveName ?? '—'}" (${r.role ?? '—'}) — ${a.action}.`,
        at: new Date(a.at).toISOString(),
        link: '/employer/registrations',
      });
    });
  }

  // 2) consent responses
  const apps = await Application.find({ employerId, 'consent.status': { $in: ['granted', 'declined'] } })
    .select('driveId jobseekerId consent').lean<AppLean[]>();

  // 3) slot bookings on this employer's slots
  const slots = await Slot.find({ employerId }).select('_id driveId date start').lean<SlotLean[]>();
  const slotById = new Map(slots.map((s) => [String(s._id), s]));
  const bookings = slots.length
    ? await SlotBooking.find({ slotId: { $in: slots.map((s) => s._id) } }).select('slotId jobseekerId createdAt').lean<BookingLean[]>()
    : [];

  // batch drive names for consent + slot bodies
  const driveIds = new Set<string>();
  apps.forEach((a) => driveIds.add(String(a.driveId)));
  slots.forEach((s) => driveIds.add(String(s.driveId)));
  const drives = await Drive.find({ _id: { $in: [...driveIds] } }).select('name').lean<{ _id: Types.ObjectId; name?: string }[]>();
  const dname = new Map(drives.map((d) => [String(d._id), d.name ?? '—']));

  for (const a of apps) {
    const status = a.consent?.status;
    const at = a.consent?.respondedAt ?? a.consent?.requestedAt;
    if (!status || !at) continue;
    items.push({
      id: `consent:${a._id}`,
      category: 'candidate',
      title: `Identity reveal ${status}`,
      body: `Candidate ${codeFor(a.jobseekerId)} ${status} your reveal request for "${dname.get(String(a.driveId)) ?? '—'}".`,
      at: new Date(at).toISOString(),
      link: `/employer/drives/${a.driveId}/consent`,
    });
  }

  for (const b of bookings) {
    const slot = slotById.get(String(b.slotId));
    if (!slot) continue;
    items.push({
      id: `booking:${b._id}`,
      category: 'slot',
      title: 'New slot booking',
      body: `Candidate ${codeFor(b.jobseekerId)} booked a slot on ${new Date(slot.date).toISOString().slice(0, 10)} at ${slot.start} for "${dname.get(String(slot.driveId)) ?? '—'}".`,
      at: new Date(b.createdAt).toISOString(),
      link: `/employer/drives/${slot.driveId}/slots`,
    });
  }

  return items;
}

export async function buildNotifications(employerId: string): Promise<{ items: NotificationItem[]; unreadCount: number; lastReadAt: string | null }> {
  const emp = await Employer.findById(employerId).select('notificationsReadAt').lean<{ notificationsReadAt?: Date }>();
  const cursor = emp?.notificationsReadAt ? new Date(emp.notificationsReadAt).getTime() : 0;
  const raw = await rawItems(employerId);
  raw.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)); // ISO desc == chronological desc
  const items = raw.map((it) => ({ ...it, read: new Date(it.at).getTime() <= cursor }));
  return {
    items,
    unreadCount: items.filter((i) => !i.read).length,
    lastReadAt: emp?.notificationsReadAt ? new Date(emp.notificationsReadAt).toISOString() : null,
  };
}

export async function notificationsSummary(employerId: string): Promise<{ unreadCount: number; recent: NotificationItem[] }> {
  const { items, unreadCount } = await buildNotifications(employerId);
  return { unreadCount, recent: items.slice(0, 5) };
}

export async function markNotificationsRead(employerId: string): Promise<{ lastReadAt: string; unreadCount: number }> {
  const now = new Date();
  await Employer.updateOne({ _id: employerId }, { $set: { notificationsReadAt: now } });
  return { lastReadAt: now.toISOString(), unreadCount: 0 };
}
```

- [ ] **Step 5: Create the controller + register routes**

Create `server/src/modules/employerPortal/employerNotifications.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { buildNotifications, markNotificationsRead } from './employerNotifications.service.js';

export async function notificationsController(req: Request, res: Response) {
  res.json(await buildNotifications(req.userId as string));
}
export async function markNotificationsReadController(req: Request, res: Response) {
  res.json(await markNotificationsRead(req.userId as string));
}
```

In `employerPortal.routes.ts`, add the import (after the reports controller import) and the two routes (after the reports route, **before** the final `.get('/employer', ...)`):

```ts
import { notificationsController, markNotificationsReadController } from './employerNotifications.controller.js';
```
```ts
employerPortalRoutes.get('/employer/notifications', asyncHandler(notificationsController));
employerPortalRoutes.post('/employer/notifications/read', asyncHandler(markNotificationsReadController));
```

- [ ] **Step 6: Extend the dashboard aggregate**

In `employerPortal.service.ts`: add the import near the top —

```ts
import { notificationsSummary } from './employerNotifications.service.js';
```

In `getEmployerPortal`, after `const upcomingInterviews = ...`, add:

```ts
  const { unreadCount, recent } = await notificationsSummary(employerId);
```

and extend the returned `dashboard` object with two fields (after `shortlist: [] as unknown[],`):

```ts
      notifications: recent,
      notificationsUnread: unreadCount,
```

- [ ] **Step 7: Run tests + full server suite + type-check**

Run: `npm test -w server -- --run test/employer-notifications.route.test.ts && npm test -w server && npx -w server tsc --noEmit`
Expected: file PASSES (3 tests); full suite green (known pre-existing flaky `test/eval-configs.service.test.ts` timestamp-tie may flake — ignore only that one); tsc `ok`. Report counts.

- [ ] **Step 8: Commit**

```bash
git add server/src/models/Employer.ts server/src/modules/employerPortal/employerNotifications.service.ts server/src/modules/employerPortal/employerNotifications.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/src/modules/employerPortal/employerPortal.service.ts server/test/employer-notifications.route.test.ts
git commit -m "feat(server): employer notifications feed (derived, read cursor, no PII) + aggregate counts"
```

---

## Task 2: Client — bell + notification center + dashboard card

**Files:** Modify `types/employer.ts`, `EmployerShell.tsx`, `EmployerDashboard.tsx`, `App.tsx`; Create `hooks/useEmployerNotifications.ts`, `EmployerNotifications.tsx`, `client/src/test/EmployerNotifications.test.tsx`, `client/src/test/EmployerShellBell.test.tsx`.

**Interfaces:**
- Consumes: `apiFetch`/`useAuth`; the Task 1 endpoints + aggregate fields.
- Produces: `EmployerNotification`/`EmployerNotificationsResponse` types; `useEmployerNotifications`/`useMarkNotificationsRead`/`formatRelativeTime`; `EmployerNotifications` at `/employer/notifications`; a topbar bell; a dashboard card.

- [ ] **Step 1: Add types**

In `client/src/types/employer.ts`, append:

```ts
export type EmployerNotificationCategory = 'registration' | 'candidate' | 'slot';
export interface EmployerNotification {
  id: string;
  category: EmployerNotificationCategory;
  title: string;
  body: string;
  at: string;
  link: string;
  read: boolean;
}
export interface EmployerNotificationsResponse {
  items: EmployerNotification[];
  unreadCount: number;
  lastReadAt: string | null;
}
```

And extend the existing `EmployerDashboard` interface (add the two fields after `shortlist: unknown[];`):

```ts
  notifications: EmployerNotification[];
  notificationsUnread: number;
```

- [ ] **Step 2: Add the hook + relative-time helper**

Create `client/src/pages/EmployerPortal/hooks/useEmployerNotifications.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerNotificationsResponse } from '../../../types/employer.js';

export function useEmployerNotifications() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-notifications'],
    queryFn: () => apiFetch<EmployerNotificationsResponse>('/me/employer/notifications', { token }),
    enabled: !!token,
  });
}

export function useMarkNotificationsRead() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ lastReadAt: string; unreadCount: number }>('/me/employer/notifications/read', { method: 'POST', token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer-notifications'] });
      qc.invalidateQueries({ queryKey: ['employer-portal'] });
    },
  });
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

(If `apiFetch`'s option shape differs, match the existing mutation hooks in the same folder, e.g. `hooks/useEmployerOffers.ts` — the POST-with-no-body call must mirror how those issue non-GET requests.)

- [ ] **Step 3: Write the failing page test**

Create `client/src/test/EmployerNotifications.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerNotifications } from '../pages/EmployerPortal/EmployerNotifications.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const FEED = {
  items: [
    { id: 'reg:1:0', category: 'registration', title: 'Registration approved', body: 'Your registration for "Data Drive" (SDE) — Approved.', at: '2026-07-04T10:00:00.000Z', link: '/employer/registrations', read: false },
    { id: 'consent:2', category: 'candidate', title: 'Identity reveal granted', body: 'Candidate C-abc123 granted your reveal request for "Data Drive".', at: '2026-07-03T10:00:00.000Z', link: '/employer/drives/d1/consent', read: true },
    { id: 'booking:3', category: 'slot', title: 'New slot booking', body: 'Candidate C-def456 booked a slot on 2026-08-05 at 10:00 for "Data Drive".', at: '2026-07-02T10:00:00.000Z', link: '/employer/drives/d1/slots', read: false },
  ],
  unreadCount: 2,
  lastReadAt: null,
};
function mockFetch() {
  const calls: { url: string; method?: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method });
    if (url.includes('/notifications/read')) return { ok: true, status: 200, json: async () => ({ lastReadAt: '2026-07-05T00:00:00.000Z', unreadCount: 0 }) };
    return { ok: true, status: 200, json: async () => FEED };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/notifications']}>
        <AuthProvider><Routes><Route path="/employer/notifications" element={<EmployerNotifications />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerNotifications', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('renders the feed rows + category chips', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Registration approved')).toBeInTheDocument());
    expect(screen.getByText('Identity reveal granted')).toBeInTheDocument();
    expect(screen.getByText('New slot booking')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrations' })).toBeInTheDocument();
  });

  it('filters by category chip', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Registration approved')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Slots' }));
    expect(screen.queryByText('Registration approved')).not.toBeInTheDocument();
    expect(screen.getByText('New slot booking')).toBeInTheDocument();
  });

  it('a View link carries the item link; mark-all-read fires POST', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Registration approved')).toBeInTheDocument());
    const viewLinks = screen.getAllByRole('link', { name: /View/ });
    expect(viewLinks[0]).toHaveAttribute('href', '/employer/registrations');
    fireEvent.click(screen.getByRole('button', { name: /Mark all as read/i }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/notifications/read') && c.method === 'POST')).toBe(true));
  });

  it('shows the empty state', async () => {
    seedAuth();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [], unreadCount: 0, lastReadAt: null }) })));
    renderPage();
    await waitFor(() => expect(screen.getByText(/No notifications/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerNotifications.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 5: Build the notification-center page**

Create `client/src/pages/EmployerPortal/EmployerNotifications.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEmployerNotifications, useMarkNotificationsRead, formatRelativeTime } from './hooks/useEmployerNotifications.js';
import type { EmployerNotificationCategory } from '../../types/employer.js';
import './employerBase.js';

const CATS: { key: EmployerNotificationCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'registration', label: 'Registrations' },
  { key: 'candidate', label: 'Candidates' },
  { key: 'slot', label: 'Slots' },
];
const TINT: Record<EmployerNotificationCategory, string> = { registration: 'ni-ok', candidate: 'ni-cand', slot: 'ni-warn' };
const CAT_LABEL: Record<EmployerNotificationCategory, string> = { registration: 'Registration', candidate: 'Candidate', slot: 'Slot' };

export function EmployerNotifications() {
  const [cat, setCat] = useState<EmployerNotificationCategory | 'all'>('all');
  const q = useEmployerNotifications();
  const markRead = useMarkNotificationsRead();
  const items = q.data?.items ?? [];
  const shown = cat === 'all' ? items : items.filter((n) => n.category === cat);
  const unread = q.data?.unreadCount ?? 0;

  return (
    <div className="page-wrap">
      <div className="dash-greet" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Notification center</h2>
          <p>All your MatchDay updates in one place.</p>
        </div>
        <button type="button" className="btn btn-ghost" disabled={unread === 0 || markRead.isPending} onClick={() => markRead.mutate()}>
          Mark all as read
        </button>
      </div>

      <div className="cand-summary" style={{ marginBottom: 16 }}>
        {CATS.map((c) => (
          <button type="button" key={c.key} className={`cand-sumchip${cat === c.key ? ' on' : ''}`} onClick={() => setCat(c.key)}>{c.label}</button>
        ))}
      </div>

      {q.isLoading ? <p className="hint">Loading…</p>
        : q.isError ? <p className="hint">{q.error instanceof Error ? q.error.message : 'Failed to load notifications'}</p>
        : shown.length === 0 ? <div className="notif-list"><div className="notif-empty">No notifications{cat !== 'all' ? ' in this category' : ''}.</div></div>
        : (
          <div className="notif-list">
            {shown.map((n) => (
              <div className={`nc-item${n.read ? '' : ' unread'}`} key={n.id}>
                <span className={`nc-ic ${TINT[n.category]}`}>
                  <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
                </span>
                <div className="nc-main">
                  <div className="nc-cat">{CAT_LABEL[n.category]}</div>
                  <div className="nc-title">{n.title}</div>
                  <div className="nc-body">{n.body}</div>
                  <div className="nc-meta"><span className="nc-time">{formatRelativeTime(n.at)}</span></div>
                </div>
                <div className="nc-right">
                  {!n.read && <span className="nc-unread-dot" />}
                  <Link to={n.link} className="nc-act">View →</Link>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
```

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- --run src/test/EmployerNotifications.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Add the topbar bell (with a test)**

In `EmployerShell.tsx`: the component already has `const { data } = useEmployerPortal();` and `const navigate = useNavigate();`. Add a derived unread count in the component body (near `const profile = ...`):

```tsx
  const notificationsUnread = data?.dashboard?.notificationsUnread ?? 0;
```

Then inside `<div className="tb-actions">`, add the bell as the FIRST child (before the `<div className="tb-user" …>`):

```tsx
            <button
              type="button"
              className="icon-btn"
              aria-label="Notifications"
              onClick={() => navigate('/employer/notifications')}
            >
              <svg className="ic" viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
              {notificationsUnread > 0 && <span className="ndot" />}
            </button>
```

Create `client/src/test/EmployerShellBell.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerShell } from '../pages/EmployerPortal/EmployerShell.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
function mockAggregate(notificationsUnread: number) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ profile: { id: 'e1', name: 'Acme', email: 'e@c.com', industry: 'Tech', size: '', status: 'Active', spoc: 'Jane', website: '' }, dashboard: { kpis: { activeDrives: 0, upcomingInterviews: 0, totalSlots: 0 }, calendar: [], registrations: [], shortlist: [], notifications: [], notificationsUnread } }),
  })));
}
function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/dashboard']}>
        <AuthProvider><EmployerShell><div>content</div></EmployerShell></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerShell notification bell', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('shows the bell; badge appears when unread > 0', async () => {
    seedAuth(); mockAggregate(3);
    const { container } = renderShell();
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.icon-btn .ndot')).not.toBeNull());
  });

  it('hides the badge when unread = 0', async () => {
    seedAuth(); mockAggregate(0);
    const { container } = renderShell();
    await waitFor(() => expect(screen.getByLabelText('Notifications')).toBeInTheDocument());
    expect(container.querySelector('.icon-btn .ndot')).toBeNull();
  });
});
```

- [ ] **Step 8: Restore the dashboard "Recent notifications" card**

In `EmployerDashboard.tsx`: add `import { Link } from 'react-router-dom';` and `import { formatRelativeTime } from './hooks/useEmployerNotifications.js';` at the top; add a category-tint map above the component:

```tsx
const NOTIF_TINT: Record<string, string> = { registration: 'ni-ok', candidate: 'ni-cand', slot: 'ni-warn' };
```

Then, inside the right-hand `<div className="dash-col">` (the one containing "Upcoming interviews"), add this card AFTER the Upcoming-interviews `.card`:

```tsx
              <div className="card">
                <div className="card-head">
                  <h3>
                    <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
                    Recent notifications
                  </h3>
                  <Link to="/employer/notifications" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--indigo)' }}>See all</Link>
                </div>
                <div className="card-body">
                  {data.dashboard.notifications.length === 0 ? (
                    <p className="hint">No notifications yet.</p>
                  ) : (
                    data.dashboard.notifications.map((n) => (
                      <div className="notif-row" key={n.id}>
                        <span className={`notif-ic ${NOTIF_TINT[n.category] ?? 'ni-cand'}`}>
                          <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /></svg>
                        </span>
                        <div>
                          <div className="nt">{n.title} — {n.body}</div>
                          <div className="ntime">{formatRelativeTime(n.at)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
```

- [ ] **Step 9: Add the route**

In `client/src/App.tsx`: import `EmployerNotifications` near the other employer page imports, and add the route right after `/employer/reports`:

```tsx
        <Route path="/employer/notifications" element={<RoleRoute role="employer"><EmployerShell><EmployerNotifications /></EmployerShell></RoleRoute>} />
```

- [ ] **Step 10: Full client suite + type-check + build + commit**

Run: `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`
Expected: all green (existing tests unaffected); tsc `ok`; build succeeds.

```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal/hooks/useEmployerNotifications.ts client/src/pages/EmployerPortal/EmployerNotifications.tsx client/src/pages/EmployerPortal/EmployerShell.tsx client/src/pages/EmployerPortal/EmployerDashboard.tsx client/src/App.tsx client/src/test/EmployerNotifications.test.tsx client/src/test/EmployerShellBell.test.tsx
git commit -m "feat(client): employer notification center + topbar bell + dashboard recent card"
```

---

## Task 3: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` && `npm test -w client`. Report counts.
- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer11_smoke`)** — inspect how the server connects to Mongo; kill any stale :4099 listener first (`lsof -nP -iTCP:4099 -sTCP:LISTEN -t | xargs -r kill`); seed the isolated DB with an employer + an Approved and a Rejected `RegistrationRequest` (with `activity[]`), an `Application` with `consent.status='granted'` + one `declined` (distinct jobseeker names/emails), and a `SlotBooking` on one of the employer's slots; mint an employer token (via `signToken`) + an admin token. Start the server on `PORT=4099` pointed at the smoke DB; confirm no `EADDRINUSE`. Then:
  - `GET /api/me/employer/notifications` → the three categories present, newest-first, real timestamps; the payload contains **no** seeded jobseeker name/email (candidate `C-` codes instead); `unreadCount` equals the item count and all `read:false`.
  - `POST /api/me/employer/notifications/read` → `unreadCount:0`; a re-GET shows all `read:true` and a non-null `lastReadAt` (persisted).
  - `GET /api/me/employer` → `dashboard.notificationsUnread` + `dashboard.notifications` (≤5) present and consistent.
  - A second employer's data is excluded from the first's feed; admin token → 403.
- [ ] **Step 4: Teardown** — kill the server by listener PID; drop `matchday_employer11_smoke`; confirm shared `matchday` untouched. No commit.

---

## Notes for the executor
- Stacked on slice 10; the base has all of 5a–10. Reuse `codeFor`; do not reimplement it.
- **Read-only + no PII**: the feed emits candidate codes/drive names/dates only; a server test greps the payload for the seeded names/emails' absence. The sole write is `Employer.notificationsReadAt`.
- Registration events come from `activity[]` entries whose `action` **starts with** `Approved` / `Rejected` / `Changes requested` (the `Submitted` seed entry and `Moved to drive:` / `Slot changed:` edits are excluded). The full `action` string (which carries the admin's reason) goes into the body.
- ISO-string sort is chronological — `at` desc via string compare is correct.
- All notification CSS is already ported (`.icon-btn`+`.ndot`, `.notif-row`+`.ni-*`, `.nc-item`/`.nc-*`, `.seg-tabs`, `.cand-sumchip`, `.notif-empty`, `.page-wrap`, `.dash-greet`, `.btn`/`.btn-ghost`) — no CSS changes.
- No sidebar nav item — the topbar bell is the entry (matches the prototype). `/employer/notifications` is a top-level employer route on the same `.use('/employer', requireAuth, requireRole('employer'))` gate, registered before the final `.get('/employer')`.
- `Date.now()`/`new Date()` are fine in client + server code.
- Known stubs (from the spec): offer/decision/stage events excluded (no per-event timestamp); single read cursor (no per-item read); in-app only (no delivery channels/preferences); feed recomputed on read (no caching).
