# Jobseeker Login & Self-Tracking Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a jobseeker log in with email + password and see a read-only portal that tracks their hiring journey and the drives they qualify for.

**Architecture:** Reuse the existing JWT/bcrypt auth — `/api/auth/login` tries the admin `User` collection, then falls back to `Jobseeker` (issuing a `role: 'jobseeker'` token). A new `requireRole` middleware gates all existing admin routers to `admin` and a new `GET /api/me/portal` endpoint to `jobseeker`. The portal endpoint derives everything (profile, journey, eligible drives) from existing data — no new "application" entity. The React app routes by role: admins keep the console, jobseekers get a minimal seeker-only shell at `/portal`.

**Tech Stack:** Server — Express 4, Mongoose 8, Zod, jsonwebtoken, bcryptjs, Vitest + supertest + mongodb-memory-server. Client — React 18, react-router-dom 6, @tanstack/react-query 5, Vitest + @testing-library/react.

## Global Constraints

- **Node ≥ 20, native ESM.** Every relative import in TS source uses a `.js` specifier (e.g. `'./foo.js'`), even for `.ts` files. Match this in every new file.
- **Error contract:** all API errors are `{ error: { message, code } }`, produced by `throw new HttpError(status, message, code)` from `server/src/middleware/errorHandler.js`. Zod parse failures auto-map to `400 { code: 'validation' }`.
- **Reuse existing helpers — do not reimplement:**
  - `hashPassword`, `verifyPassword`, `signToken` from `server/src/modules/auth/auth.service.js`.
  - `matchReadinessPct`, `offerStatus`, `evaluationLabel`, `codeFor` from `server/src/modules/jobseekers/jobseekers.service.js` (all already exported).
  - Client data fetching via `apiFetch<T>(path, { token })` from `client/src/api/client.js`; auth via `useAuth()` from `client/src/auth/AuthContext.js`.
- **JWT payload shape is `{ sub, role }`.** `requireAuth` sets `req.userId = payload.sub` and `req.userRole = payload.role`.
- **Tests:** server tests use the `setupTestDb` / `clearDb` / `teardownTestDb` helpers in `server/test/helpers/db.js` and `signToken(...)` to mint tokens directly. Client tests stub `global.fetch` and wrap in `QueryClientProvider` + `MemoryRouter` + `AuthProvider`. Run with `npm run test -w server` / `npm run test -w client`.
- **Commits:** one per task, Conventional-Commits style (`feat(server): …`, `feat(client): …`, `test(server): …`). End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **No admin page component changes.** The nine existing modules are untouched except for the one-line role guard added to their routers (Task 2).

## File Structure

**Server (create)**
- `server/src/middleware/requireRole.ts` — role-check middleware.
- `server/src/modules/seekerPortal/seekerPortal.service.ts` — `getPortal`, `isEligible`, `statusTag`, `JOURNEY_STAGES`.
- `server/src/modules/seekerPortal/seekerPortal.controller.ts` — thin controller.
- `server/src/modules/seekerPortal/seekerPortal.routes.ts` — `/portal` router (auth + jobseeker role).
- `server/test/seeker-auth.route.test.ts`, `server/test/role-guard.route.test.ts`, `server/test/seeker-portal.service.test.ts`, `server/test/seeker-portal.route.test.ts`.

**Server (modify)**
- `server/src/models/Jobseeker.ts` — add `passwordHash`.
- `server/src/modules/auth/auth.service.ts` — unified `login`.
- 12 admin router files — add `requireRole('admin')`.
- `server/src/app.ts` — mount `/api/me`.
- `server/src/seed/seed.ts` — demo passwords + 2 demo accounts + printed creds.

**Client (create)**
- `client/src/types/portal.ts` — response types.
- `client/src/hooks/usePortal.ts` — react-query hook.
- `client/src/auth/RoleRoute.tsx` — role-gated route wrapper.
- `client/src/pages/Portal/{index,PortalShell,JourneyPipeline,StatusCards,DrivesList}.tsx` + `portal.css`.
- `client/src/test/RoleRoute.test.tsx`, `client/src/test/Portal.test.tsx`.

**Client (modify)**
- `client/src/auth/AuthContext.tsx` — `login()` returns the user; export `User`.
- `client/src/auth/LoginPage.tsx` — role-based post-login nav + role-neutral copy.
- `client/src/App.tsx` — role-gate routes + `/portal`.
- `client/src/test/LoginPage.test.tsx` — add a success-nav test.

---

## Task 1: Jobseeker `passwordHash` + unified login

**Files:**
- Modify: `server/src/models/Jobseeker.ts`
- Modify: `server/src/modules/auth/auth.service.ts`
- Test: `server/test/seeker-auth.route.test.ts` (create)

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `signToken`, `HttpError`, `User`, `Jobseeker`.
- Produces: `login(email, password): Promise<{ token: string; user: { id; name; email; role } }>` — now returns `role: 'jobseeker'` for seeker accounts. JWT `sub` = the jobseeker `_id` for seeker tokens.

- [ ] **Step 1: Write the failing test** — create `server/test/seeker-auth.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { Jobseeker, Types } from '../src/models/Jobseeker.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(async () => {
  await clearDb();
  await Jobseeker.create({
    name: 'Seeker One', instituteId: new Types.ObjectId(), branch: 'CSE', gradYear: 2026, cgpa: 8,
    source: 'Institutes', email: 'seeker@matchday.dev', passwordHash: await hashPassword('Seeker123!'),
  });
});

describe('POST /api/auth/login (jobseeker)', () => {
  it('logs in a jobseeker and returns a jobseeker-role token', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'seeker@matchday.dev', password: 'Seeker123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'seeker@matchday.dev', role: 'jobseeker' });
  });

  it('401s on the wrong seeker password', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'seeker@matchday.dev', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('auth');
  });

  it('401s for a jobseeker without a passwordHash', async () => {
    await Jobseeker.create({
      name: 'No Pass', instituteId: new Types.ObjectId(), branch: 'IT', gradYear: 2026, cgpa: 7,
      source: 'Campus', email: 'nopass@matchday.dev',
    });
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'nopass@matchday.dev', password: 'whatever' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w server -- seeker-auth.route`
Expected: FAIL — login returns 401 for the seeker (auth.service only checks `User`), so the first test's `expect(200)` fails.

- [ ] **Step 3a: Add `passwordHash` to the Jobseeker model**

In `server/src/models/Jobseeker.ts`, add one field to `jobseekerSchema` immediately after the `email` line:

```ts
  email: { type: String, default: '' },
  passwordHash: { type: String, default: undefined },   // present ⇒ this seeker can log in
```

- [ ] **Step 3b: Rewrite `login` in `server/src/modules/auth/auth.service.ts`**

Add the import at the top (next to the `User` import):

```ts
import { Jobseeker } from '../../models/Jobseeker.js';
```

Replace the existing `export async function login(...)` with:

```ts
export async function login(email: string, password: string) {
  const normalized = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalized });
  if (user) {
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid credentials', 'auth');
    const token = signToken({ sub: String(user._id), role: user.role });
    return { token, user: { id: String(user._id), name: user.name, email: user.email, role: user.role } };
  }

  const seeker = await Jobseeker.findOne({ email: normalized });
  if (seeker && seeker.passwordHash) {
    const ok = await verifyPassword(password, seeker.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid credentials', 'auth');
    const token = signToken({ sub: String(seeker._id), role: 'jobseeker' });
    return { token, user: { id: String(seeker._id), name: seeker.name, email: seeker.email ?? '', role: 'jobseeker' } };
  }

  throw new HttpError(401, 'Invalid credentials', 'auth');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w server -- seeker-auth.route auth`
Expected: PASS — both the new seeker-login file and the existing `auth.test.ts` (admin login unchanged) are green.

- [ ] **Step 5: Commit**

```bash
git add server/src/models/Jobseeker.ts server/src/modules/auth/auth.service.ts server/test/seeker-auth.route.test.ts
git commit -m "feat(server): jobseeker email+password login via unified /auth/login

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `requireRole` middleware + guard admin routers

**Files:**
- Create: `server/src/middleware/requireRole.ts`
- Modify: 12 router files (listed below)
- Test: `server/test/role-guard.route.test.ts` (create)

**Interfaces:**
- Consumes: `HttpError`, `req.userRole` (set by `requireAuth`).
- Produces: `requireRole(...roles: string[]): RequestHandler` — responds `403 { code: 'forbidden' }` when `req.userRole` is absent or not in `roles`.

- [ ] **Step 1: Write the failing test** — create `server/test/role-guard.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const adminAuth = `Bearer ${signToken({ sub: 'a1', role: 'admin' })}`;
const seekerAuth = `Bearer ${signToken({ sub: 's1', role: 'jobseeker' })}`;

describe('admin role guard', () => {
  it('blocks a jobseeker token from a router-level admin route', async () => {
    const res = await request(createApp()).get('/api/jobseekers').set('Authorization', seekerAuth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('blocks a jobseeker token from the per-route dashboard guard', async () => {
    const res = await request(createApp()).get('/api/dashboard/overview').set('Authorization', seekerAuth);
    expect(res.status).toBe(403);
  });

  it('allows an admin token through the admin route', async () => {
    const res = await request(createApp()).get('/api/jobseekers').set('Authorization', adminAuth);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w server -- role-guard.route`
Expected: FAIL — the jobseeker token currently gets `200` on `/api/jobseekers` (no role guard yet).

- [ ] **Step 3a: Create `server/src/middleware/requireRole.ts`**

```ts
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errorHandler.js';

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return next(new HttpError(403, 'Forbidden', 'forbidden'));
    }
    return next();
  };
}
```

- [ ] **Step 3b: Guard the 11 router-level admin routers**

In each file below, (a) add the import `import { requireRole } from '../../middleware/requireRole.js';` beside the existing `requireAuth` import, and (b) add a `requireRole('admin')` line immediately **after** the existing `<router>.use(requireAuth);` line:

| File | Router variable — add after `<var>.use(requireAuth);` |
|---|---|
| `server/src/modules/drives/drives.routes.ts` | `driveRoutes.use(requireRole('admin'));` |
| `server/src/modules/institutes/institutes.routes.ts` | `instituteRoutes.use(requireRole('admin'));` |
| `server/src/modules/jobseekers/jobseekers.routes.ts` | `jobseekerRoutes.use(requireRole('admin'));` |
| `server/src/modules/employers/employers.routes.ts` | `employerRoutes.use(requireRole('admin'));` |
| `server/src/modules/registrations/registrations.routes.ts` | `registrationRoutes.use(requireRole('admin'));` |
| `server/src/modules/slots/slots.routes.ts` | `slotRoutes.use(requireRole('admin'));` |
| `server/src/modules/templates/templates.routes.ts` | `templateRoutes.use(requireRole('admin'));` |
| `server/src/modules/evalConfigs/routes.ts` | `evalConfigRoutes.use(requireRole('admin'));` |
| `server/src/modules/evalMonitor/routes.ts` | `evalMonitorRoutes.use(requireRole('admin'));` |
| `server/src/modules/streams/routes.ts` | `streamRoutes.use(requireRole('admin'));` |
| `server/src/modules/streamRules/routes.ts` | `streamRulesRoutes.use(requireRole('admin'));` |

Example — `jobseekers.routes.ts` after editing:

```ts
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
// …
export const jobseekerRoutes = Router();
jobseekerRoutes.use(requireAuth);
jobseekerRoutes.use(requireRole('admin'));
jobseekerRoutes.get('/', asyncHandler(listController));
// … rest unchanged
```

- [ ] **Step 3c: Guard the per-route dashboard router**

`server/src/modules/dashboard/dashboard.routes.ts` uses `requireAuth` inline (not `router.use`). Add the import and insert `requireRole('admin')` into the handler chain:

```ts
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
// …
export const dashboardRoutes = Router();
dashboardRoutes.get('/overview', requireAuth, requireRole('admin'), asyncHandler(overviewController));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w server -- role-guard.route`
Expected: PASS — all three assertions green.

- [ ] **Step 5: Run the full server suite for regressions**

Run: `npm run test -w server`
Expected: PASS — every existing route test still uses an `admin`-role token (`signToken({ role: 'admin' })`), so none regress.

- [ ] **Step 6: Commit**

```bash
git add server/src/middleware/requireRole.ts server/src/modules/*/routes.ts server/src/modules/*/*.routes.ts server/test/role-guard.route.test.ts
git commit -m "feat(server): requireRole middleware; gate all admin routers to admin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Portal derivation service

**Files:**
- Create: `server/src/modules/seekerPortal/seekerPortal.service.ts`
- Test: `server/test/seeker-portal.service.test.ts` (create)

**Interfaces:**
- Consumes: `Jobseeker`, `Drive`, `Employer`, `Institute`, `Slot`, `HttpError`; `matchReadinessPct`, `offerStatus`, `evaluationLabel`, `codeFor` from `jobseekers.service.js`.
- Produces:
  - `JOURNEY_STAGES: readonly string[]` — the 7 positive pipeline stages (excludes `DroppedOff`).
  - `statusTag(stage: string): 'Selected' | 'In progress' | 'Closed'`.
  - `isEligible(eligibility: { branches?: string[]; gradYears?: number[]; sources?: string[] } | undefined, seeker: { branch: string; gradYear: number; source: string }): boolean`.
  - `getPortal(jobseekerId: string): Promise<PortalData>` where `PortalData` is `{ profile, journey, drives }` (shape defined in the code below; the client mirrors it in Task 6).

- [ ] **Step 1: Write the failing test** — create `server/test/seeker-portal.service.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Drive } from '../src/models/Drive.js';
import { Employer } from '../src/models/Employer.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Slot } from '../src/models/Slot.js';
import { getPortal, isEligible, statusTag } from '../src/modules/seekerPortal/seekerPortal.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('statusTag', () => {
  it('maps stages to Selected / In progress / Closed', () => {
    expect(statusTag('Applied')).toBe('In progress');
    expect(statusTag('MatchReady')).toBe('In progress');
    expect(statusTag('Shortlisted')).toBe('Selected');
    expect(statusTag('Joined')).toBe('Selected');
    expect(statusTag('DroppedOff')).toBe('Closed');
  });
});

describe('isEligible', () => {
  const seeker = { branch: 'CSE', gradYear: 2026, source: 'Campus' };
  it('treats empty constraints as no constraint', () => {
    expect(isEligible({ branches: [], gradYears: [], sources: [] }, seeker)).toBe(true);
    expect(isEligible(undefined, seeker)).toBe(true);
  });
  it('rejects on any mismatched non-empty constraint', () => {
    expect(isEligible({ branches: ['IT'] }, seeker)).toBe(false);
    expect(isEligible({ gradYears: [2025] }, seeker)).toBe(false);
    expect(isEligible({ sources: ['Institutes'] }, seeker)).toBe(false);
  });
  it('accepts when all non-empty constraints match', () => {
    expect(isEligible({ branches: ['CSE'], gradYears: [2026], sources: ['Campus'] }, seeker)).toBe(true);
  });
});

describe('getPortal', () => {
  it('returns profile, journey, and eligible drives with employers + status tag', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College' });
    const emp = await Employer.create({ name: 'Acme Corp', industry: 'Tech' });
    const drive = await Drive.create({
      name: 'CSE Drive', domain: 'Backend', status: 'Active',
      eventDates: [new Date('2026-08-05T04:30:00.000Z')],
      eligibility: { sources: [], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    });
    await Slot.create({ driveId: drive._id, employerId: emp._id, date: new Date('2026-08-05'), start: '10:00', end: '12:00' });
    await Drive.create({
      name: 'ECE only', domain: 'Hardware', status: 'Active',
      eligibility: { sources: [], branches: ['ECE'], gradYears: [2026], expType: '' },
    });
    await Drive.create({ name: 'Draft drive', status: 'Draft', eligibility: { branches: ['CSE'], gradYears: [2026], sources: [] } });
    const seeker = await Jobseeker.create({
      name: 'Aarav K', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8,
      source: 'Campus', email: 's@x.edu', stage: 'Offer', evaluationStatus: 'completed',
    });

    const res = await getPortal(String(seeker._id));
    expect(res.profile).toMatchObject({ name: 'Aarav K', institute: 'CBIT', branch: 'CSE', gradYear: 2026 });
    expect(res.profile.code).toMatch(/^C-/);
    expect(res.journey.stage).toBe('Offer');
    expect(res.journey.stages).toContain('MatchReady');
    expect(res.journey.stages).not.toContain('DroppedOff');
    expect(res.journey.offerStatus).toBe('Offer sent');
    expect(res.drives).toHaveLength(1);                        // ECE-only excluded, Draft excluded
    expect(res.drives[0]).toMatchObject({ name: 'CSE Drive', statusTag: 'Selected', employers: ['Acme Corp'] });
    expect(res.drives[0].eventDates[0]).toContain('2026-08-05');
  });

  it('404s for an unknown or malformed id', async () => {
    await expect(getPortal('64b000000000000000000000')).rejects.toThrow();
    await expect(getPortal('not-an-id')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w server -- seeker-portal.service`
Expected: FAIL — `Cannot find module '.../seekerPortal.service.js'`.

- [ ] **Step 3: Create `server/src/modules/seekerPortal/seekerPortal.service.ts`**

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Drive } from '../../models/Drive.js';
import { Employer } from '../../models/Employer.js';
import { Institute } from '../../models/Institute.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Slot } from '../../models/Slot.js';
import { codeFor, evaluationLabel, matchReadinessPct, offerStatus } from '../jobseekers/jobseekers.service.js';

// The positive pipeline shown to the seeker (DroppedOff is a separate terminal state).
export const JOURNEY_STAGES = ['Applied', 'Screened', 'Evaluated', 'MatchReady', 'Shortlisted', 'Offer', 'Joined'] as const;

const SELECTED_STAGES = new Set(['Shortlisted', 'Offer', 'Joined']);

export function statusTag(stage: string): 'Selected' | 'In progress' | 'Closed' {
  if (stage === 'DroppedOff') return 'Closed';
  if (SELECTED_STAGES.has(stage)) return 'Selected';
  return 'In progress';
}

interface EligibilityLike { branches?: string[]; gradYears?: number[]; sources?: string[] }

export function isEligible(
  eligibility: EligibilityLike | undefined,
  seeker: { branch: string; gradYear: number; source: string },
): boolean {
  const branches = eligibility?.branches ?? [];
  const gradYears = eligibility?.gradYears ?? [];
  const sources = eligibility?.sources ?? [];
  if (branches.length && !branches.includes(seeker.branch)) return false;
  if (gradYears.length && !gradYears.includes(seeker.gradYear)) return false;
  if (sources.length && !sources.includes(seeker.source)) return false;
  return true;
}

export interface PortalDrive {
  id: string; name: string; domain: string;
  employers: string[]; eventDates: string[];
  statusTag: 'Selected' | 'In progress' | 'Closed';
}

export async function getPortal(jobseekerId: string) {
  if (!Types.ObjectId.isValid(jobseekerId)) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  const seeker = await Jobseeker.findById(jobseekerId).lean();
  if (!seeker) throw new HttpError(404, 'Jobseeker not found', 'not_found');

  const inst = await Institute.findById(seeker.instituteId).select('name').lean();

  const drives = await Drive.find({ status: { $in: ['Active', 'Published'] } }).lean();
  const eligible = drives.filter((d) => isEligible(d.eligibility, {
    branch: seeker.branch, gradYear: seeker.gradYear, source: seeker.source,
  }));
  const driveIds = eligible.map((d) => d._id);

  // employer name(s) per drive, via slots
  const slots = await Slot.find({ driveId: { $in: driveIds }, employerId: { $ne: null } })
    .select('driveId employerId').lean();
  const emps = await Employer.find({ _id: { $in: [...new Set(slots.map((s) => String(s.employerId)))] } })
    .select('name').lean();
  const empName = new Map(emps.map((e) => [String(e._id), e.name as string]));
  const byDrive = new Map<string, Set<string>>();
  for (const s of slots) {
    const name = empName.get(String(s.employerId));
    if (!name) continue;
    const key = String(s.driveId);
    if (!byDrive.has(key)) byDrive.set(key, new Set());
    byDrive.get(key)!.add(name);
  }

  const tag = statusTag(seeker.stage);
  const driveItems: PortalDrive[] = eligible.map((d) => ({
    id: String(d._id),
    name: d.name || 'Untitled drive',
    domain: d.domain || '',
    employers: [...(byDrive.get(String(d._id)) ?? [])],
    eventDates: (d.eventDates ?? []).map((dt) => new Date(dt).toISOString()),
    statusTag: tag,
  }));

  return {
    profile: {
      id: String(seeker._id),
      code: codeFor(seeker._id),
      name: seeker.name,
      email: seeker.email ?? '',
      institute: inst?.name ?? '—',
      branch: seeker.branch,
      gradYear: seeker.gradYear,
      cgpa: seeker.cgpa,
    },
    journey: {
      stage: seeker.stage,
      stages: [...JOURNEY_STAGES],
      matchReadinessPct: matchReadinessPct(seeker.stage),
      evaluationLabel: evaluationLabel(seeker.evaluationStatus),
      offerStatus: offerStatus(seeker.stage),
    },
    drives: driveItems,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w server -- seeker-portal.service`
Expected: PASS — all `statusTag`, `isEligible`, and `getPortal` assertions green.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/seekerPortal/seekerPortal.service.ts server/test/seeker-portal.service.test.ts
git commit -m "feat(server): portal derivation service (journey + eligible drives)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Portal endpoint (controller + routes + mount)

**Files:**
- Create: `server/src/modules/seekerPortal/seekerPortal.controller.ts`
- Create: `server/src/modules/seekerPortal/seekerPortal.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/seeker-portal.route.test.ts` (create)

**Interfaces:**
- Consumes: `getPortal`, `requireAuth`, `requireRole`, `asyncHandler`, `req.userId`.
- Produces: `GET /api/me/portal` → `200` `PortalData` for a `jobseeker` token; `403` for other roles; `401` without a token.

- [ ] **Step 1: Write the failing test** — create `server/test/seeker-portal.route.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function makeSeeker() {
  const inst = await Institute.create({ name: 'CBIT', city: 'Hyd', type: 'Engineering College' });
  return Jobseeker.create({
    name: 'Aarav', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8,
    source: 'Campus', stage: 'Applied',
  });
}

describe('GET /api/me/portal', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/me/portal')).status).toBe(401);
  });

  it('403s for an admin token', async () => {
    const res = await request(createApp()).get('/api/me/portal')
      .set('Authorization', `Bearer ${signToken({ sub: 'admin1', role: 'admin' })}`);
    expect(res.status).toBe(403);
  });

  it('returns the portal for a jobseeker token', async () => {
    const seeker = await makeSeeker();
    const res = await request(createApp()).get('/api/me/portal')
      .set('Authorization', `Bearer ${signToken({ sub: String(seeker._id), role: 'jobseeker' })}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ name: 'Aarav', branch: 'CSE' });
    expect(res.body.journey.stage).toBe('Applied');
    expect(Array.isArray(res.body.drives)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w server -- seeker-portal.route`
Expected: FAIL — `/api/me/portal` is unmounted, so every request is `404`.

- [ ] **Step 3a: Create `server/src/modules/seekerPortal/seekerPortal.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { getPortal } from './seekerPortal.service.js';

export async function portalController(req: Request, res: Response) {
  res.json(await getPortal(req.userId as string));
}
```

- [ ] **Step 3b: Create `server/src/modules/seekerPortal/seekerPortal.routes.ts`**

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { portalController } from './seekerPortal.controller.js';

export const seekerPortalRoutes = Router();
seekerPortalRoutes.use(requireAuth);
seekerPortalRoutes.use(requireRole('jobseeker'));
seekerPortalRoutes.get('/portal', asyncHandler(portalController));
```

- [ ] **Step 3c: Mount in `server/src/app.ts`**

Add the import beside the other module route imports:

```ts
import { seekerPortalRoutes } from './modules/seekerPortal/seekerPortal.routes.js';
```

Add the mount line next to the other `app.use('/api/...')` lines (e.g. after `app.use('/api/auth', authRoutes);`):

```ts
  app.use('/api/me', seekerPortalRoutes);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w server -- seeker-portal.route`
Expected: PASS — 401 / 403 / 200 all green.

- [ ] **Step 5: Run the full server suite**

Run: `npm run test -w server`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/seekerPortal/seekerPortal.controller.ts server/src/modules/seekerPortal/seekerPortal.routes.ts server/src/app.ts server/test/seeker-portal.route.test.ts
git commit -m "feat(server): GET /api/me/portal endpoint (jobseeker-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Seed demo passwords + demo accounts

**Files:**
- Modify: `server/src/seed/seed.ts`

**Interfaces:**
- Consumes: `hashPassword` (already imported at the top of `seed.ts`), the existing `institutes` array, `spread()` helper.
- Produces: every seeded jobseeker gets `passwordHash` (password `Seeker123!`); two fixed demo logins exist; their credentials print at the end of the seed.

> **Context:** all 12 seeded drives share `eligibility { branches: ['CSE','IT','ECE'], gradYears: [2025,2026], sources: ['Institutes'] }`. The demo accounts below use `branch: 'CSE'`, `gradYear: 2026`, `source: 'Institutes'` so they match every Active drive. Regular seeded seekers use `source` ∈ {Campus, Referral, Portal, Walk-in} and will (correctly, by the derivation rule) see zero drives — the demo accounts are the intended login path.

- [ ] **Step 1: Add a shared demo password hash before the jobseeker loop**

Find the line `const jobseekerDocs = [];` (~line 231) and insert immediately above it:

```ts
  const seekerPasswordHash = await hashPassword('Seeker123!');
  const jobseekerDocs = [];
```

- [ ] **Step 2: Give every generated seeker the shared hash**

In the `jobseekerDocs.push({ ... })` object inside the loop, add one line (after `consent: consentPick(),`):

```ts
        consent: consentPick(),
        passwordHash: seekerPasswordHash,
      });
```

- [ ] **Step 3: Append the two demo accounts before insert**

Immediately before `await Jobseeker.insertMany(jobseekerDocs);` (~line 246), insert:

```ts
  const demoInst = institutes[0];
  jobseekerDocs.push({
    name: 'Selected Seeker', instituteId: demoInst._id, branch: 'CSE', gradYear: 2026, cgpa: 8.5,
    source: 'Institutes', profileCompleted: true, evaluationStatus: 'completed', stage: 'Offer',
    createdAt: spread(), email: 'seeker.selected@matchday.dev', consent: 'Granted', passwordHash: seekerPasswordHash,
  });
  jobseekerDocs.push({
    name: 'Applied Seeker', instituteId: demoInst._id, branch: 'CSE', gradYear: 2026, cgpa: 7.2,
    source: 'Institutes', profileCompleted: false, evaluationStatus: 'na', stage: 'Applied',
    createdAt: spread(), email: 'seeker.applied@matchday.dev', consent: 'Granted', passwordHash: seekerPasswordHash,
  });
```

- [ ] **Step 4: Print the demo credentials**

Find the existing line `console.log(\`Admin login →  email: admin@matchday.dev   password: ${adminPassword}\`);` (~line 411) and add below it:

```ts
  console.log(`Seeker login →  email: seeker.selected@matchday.dev   password: Seeker123!   (stage: Offer)`);
  console.log(`Seeker login →  email: seeker.applied@matchday.dev    password: Seeker123!   (stage: Applied)`);
```

- [ ] **Step 5: Typecheck the seed (hard gate)**

Run: `npm run build -w server`
Expected: PASS — `tsc` compiles `seed.ts` with the new fields, no type errors. (`passwordHash` is a valid optional field after Task 1.)

- [ ] **Step 6: Manual smoke test (if a local MongoDB is available)**

Run: `npm run seed -w server`
Expected: the console prints the admin line plus the two `Seeker login →` lines. If Mongo is running, optionally start the API (`npm run dev -w server`) and confirm:

```bash
curl -s localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"seeker.selected@matchday.dev","password":"Seeker123!"}'
```
Expected: JSON with `"role":"jobseeker"` and a `token`. (Skip this step if no local Mongo — Step 5 is the gate.)

- [ ] **Step 7: Commit**

```bash
git add server/src/seed/seed.ts
git commit -m "feat(server): seed jobseeker demo passwords and two demo login accounts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Client portal types + hook

**Files:**
- Create: `client/src/types/portal.ts`
- Create: `client/src/hooks/usePortal.ts`

**Interfaces:**
- Consumes: `apiFetch`, `useAuth`.
- Produces:
  - `PortalData`, `PortalProfile`, `PortalJourney`, `PortalDrive` types (mirror the server response from Task 3).
  - `usePortal()` → react-query result of `PortalData`, enabled only when a token exists.

- [ ] **Step 1: Create `client/src/types/portal.ts`**

```ts
export interface PortalProfile {
  id: string; code: string; name: string; email: string;
  institute: string; branch: string; gradYear: number; cgpa: number;
}
export interface PortalJourney {
  stage: string; stages: string[];
  matchReadinessPct: number; evaluationLabel: string; offerStatus: string;
}
export interface PortalDrive {
  id: string; name: string; domain: string;
  employers: string[]; eventDates: string[];
  statusTag: 'Selected' | 'In progress' | 'Closed';
}
export interface PortalData {
  profile: PortalProfile; journey: PortalJourney; drives: PortalDrive[];
}
```

- [ ] **Step 2: Create `client/src/hooks/usePortal.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { PortalData } from '../types/portal.js';

export function usePortal() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['portal'],
    queryFn: () => apiFetch<PortalData>('/me/portal', { token }),
    enabled: !!token,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build -w client`
Expected: PASS — `tsc -b` compiles the new files (the hook is exported and self-consistent).

- [ ] **Step 4: Commit**

```bash
git add client/src/types/portal.ts client/src/hooks/usePortal.ts
git commit -m "feat(client): portal response types and usePortal hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `login()` returns the user

**Files:**
- Modify: `client/src/auth/AuthContext.tsx`

**Interfaces:**
- Produces: `AuthValue.login(email, password): Promise<User>` (was `Promise<void>`); `User` is now exported for reuse by `LoginPage`/`RoleRoute`.

- [ ] **Step 1: Export the `User` interface**

In `client/src/auth/AuthContext.tsx`, change:

```ts
interface User { id: string; name: string; email: string; role: string; }
```
to:
```ts
export interface User { id: string; name: string; email: string; role: string; }
```

- [ ] **Step 2: Change the `login` type in `AuthValue`**

```ts
  login: (email: string, password: string) => Promise<User>;
```

- [ ] **Step 3: Return the user from `login`**

Replace the `login` callback body's tail so it returns `res.user`:

```ts
  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: { email, password },
    });
    setToken(res.token); setUser(res.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    return res.user;
  }, []);
```

- [ ] **Step 4: Run the client suite (no regressions)**

Run: `npm run test -w client -- LoginPage`
Expected: PASS — the existing `LoginPage.test.tsx` still passes (it doesn't depend on the return value).

- [ ] **Step 5: Commit**

```bash
git add client/src/auth/AuthContext.tsx
git commit -m "feat(client): AuthContext.login resolves to the signed-in user

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `RoleRoute` wrapper

**Files:**
- Create: `client/src/auth/RoleRoute.tsx`
- Test: `client/src/test/RoleRoute.test.tsx` (create)

**Interfaces:**
- Consumes: `useAuth` (`token`, `user`).
- Produces: `RoleRoute({ role: 'admin' | 'jobseeker', children })` — no token → redirect `/login`; token with a different role → redirect (`jobseeker` → `/portal`, else `/`); matching role (or unknown user) → render children.

- [ ] **Step 1: Write the failing test** — create `client/src/test/RoleRoute.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { RoleRoute } from '../auth/RoleRoute.js';

function seedAuth(role: string) {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: '1', name: 'X', email: 'x@y.z', role },
  }));
}

function renderAt(role: 'admin' | 'jobseeker') {
  return render(
    <MemoryRouter initialEntries={['/portal']}>
      <AuthProvider>
        <Routes>
          <Route path="/portal" element={<RoleRoute role="jobseeker"><div>PORTAL</div></RoleRoute>} />
          <Route path="/" element={<div>ADMIN HOME</div>} />
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RoleRoute', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('renders children when the role matches', () => {
    seedAuth('jobseeker');
    renderAt('jobseeker');
    expect(screen.getByText('PORTAL')).toBeInTheDocument();
  });

  it('redirects a mismatched role away from the route', () => {
    seedAuth('admin');
    renderAt('jobseeker');
    expect(screen.getByText('ADMIN HOME')).toBeInTheDocument();
  });

  it('redirects to /login without a token', () => {
    renderAt('jobseeker');
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w client -- RoleRoute`
Expected: FAIL — `Cannot find module '../auth/RoleRoute.js'`.

- [ ] **Step 3: Create `client/src/auth/RoleRoute.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.js';

export function RoleRoute({ role, children }: { role: 'admin' | 'jobseeker'; children: ReactNode }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (user && user.role !== role) {
    return <Navigate to={user.role === 'jobseeker' ? '/portal' : '/'} replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w client -- RoleRoute`
Expected: PASS — all three cases green.

- [ ] **Step 5: Commit**

```bash
git add client/src/auth/RoleRoute.tsx client/src/test/RoleRoute.test.tsx
git commit -m "feat(client): RoleRoute wrapper for role-gated routes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Seeker portal page

**Files:**
- Create: `client/src/pages/Portal/PortalShell.tsx`
- Create: `client/src/pages/Portal/JourneyPipeline.tsx`
- Create: `client/src/pages/Portal/StatusCards.tsx`
- Create: `client/src/pages/Portal/DrivesList.tsx`
- Create: `client/src/pages/Portal/portal.css`
- Create: `client/src/pages/Portal/index.tsx`
- Test: `client/src/test/Portal.test.tsx` (create)

**Interfaces:**
- Consumes: `usePortal` (Task 6), `useAuth`, `PortalJourney`/`PortalDrive` types.
- Produces: `Portal` — the routed page component (used by `App.tsx` in Task 10).

- [ ] **Step 1: Write the failing test** — create `client/src/test/Portal.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { Portal } from '../pages/Portal/index.js';

const PAYLOAD = {
  profile: { id: '1', code: 'C-ABC123', name: 'Aarav Kumar', email: 'a@b.c', institute: 'CBIT', branch: 'CSE', gradYear: 2026, cgpa: 8.5 },
  journey: { stage: 'Offer', stages: ['Applied', 'Screened', 'Evaluated', 'MatchReady', 'Shortlisted', 'Offer', 'Joined'], matchReadinessPct: 92, evaluationLabel: 'Completed', offerStatus: 'Offer sent' },
  drives: [{ id: 'd1', name: 'CSE Drive', domain: 'Backend', employers: ['Acme Corp'], eventDates: ['2026-08-05T04:30:00.000Z'], statusTag: 'Selected' }],
};

function renderPortal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AuthProvider><Portal /></AuthProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Portal', () => {
  beforeEach(() => {
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: '1', name: 'Aarav Kumar', email: 'a@b.c', role: 'jobseeker' } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => PAYLOAD }));
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders the journey, status, and eligible drives', async () => {
    renderPortal();
    await waitFor(() => expect(screen.getByText('CSE Drive')).toBeInTheDocument());
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText(/My Journey/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w client -- Portal`
Expected: FAIL — `Cannot find module '../pages/Portal/index.js'`.

- [ ] **Step 3a: Create `client/src/pages/Portal/portal.css`**

```css
.portal { min-height: 100vh; background: var(--bg); }
.portal-top { display: flex; align-items: center; gap: 12px; padding: 14px 24px; background: var(--white); border-bottom: 1px solid var(--line); }
.portal-top .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; }
.portal-top .brand small { display: block; font-weight: 500; color: var(--muted); font-size: 11px; }
.portal-top .glyph { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: var(--r-sm); background: var(--ink); color: var(--white); }
.portal-top .grow { flex: 1; }
.portal-user { color: var(--muted); display: inline-flex; align-items: center; gap: 6px; margin-right: 6px; }
.portal-body { max-width: 960px; margin: 0 auto; padding: 24px; display: grid; gap: 20px; }
.portal-hero h1 { margin: 0; font-size: 22px; }
.portal-hero .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }

.pipeline { display: flex; flex-wrap: wrap; gap: 8px; }
.pip { flex: 1 1 90px; text-align: center; padding: 10px 8px; border-radius: var(--r-sm); border: 1px solid var(--line); background: var(--bg); color: var(--muted); font-size: 12px; }
.pip.done { background: var(--success-bg); color: var(--success); border-color: transparent; }
.pip.current { background: var(--ink); color: var(--white); border-color: transparent; font-weight: 700; }
.pip .n { display: block; font-size: 10px; opacity: .7; }

.stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat { padding: 16px; }
.stat .k { color: var(--muted); font-size: 12px; }
.stat .v { font-size: 18px; font-weight: 700; margin-top: 4px; }

.drive-list { display: grid; gap: 12px; }
.drive { display: flex; align-items: center; gap: 14px; padding: 16px; }
.drive .info { flex: 1; }
.drive .info b { font-size: 15px; }
.drive .meta { color: var(--muted); font-size: 12px; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 10px; }
.tag { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.tag.selected { background: var(--success-bg); color: var(--success); }
.tag.progress { background: var(--warn-bg); color: var(--warn); }
.tag.closed { background: var(--danger-bg); color: var(--danger); }
.portal-empty { text-align: center; color: var(--muted); padding: 30px; }
```

- [ ] **Step 3b: Create `client/src/pages/Portal/PortalShell.tsx`**

```tsx
import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext.js';

export function PortalShell({ name, children }: { name: string; children: ReactNode }) {
  const { logout } = useAuth();
  return (
    <div className="portal">
      <header className="portal-top">
        <div className="brand">
          <span className="glyph"><i className="ti ti-calendar-bolt" /></span>
          <div>Hiringhood <small>MatchDay</small></div>
        </div>
        <div className="grow" />
        <span className="portal-user"><i className="ti ti-user-circle" /> {name}</span>
        <button className="btn" onClick={logout}><i className="ti ti-logout" /> Sign out</button>
      </header>
      <main className="portal-body">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3c: Create `client/src/pages/Portal/JourneyPipeline.tsx`**

```tsx
import type { PortalJourney } from '../../types/portal.js';

export function JourneyPipeline({ journey }: { journey: PortalJourney }) {
  const currentIdx = journey.stages.indexOf(journey.stage);
  const dropped = journey.stage === 'DroppedOff';
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <b>My Journey</b>
        {dropped && <span className="tag closed">Closed</span>}
      </div>
      <div className="pipeline">
        {journey.stages.map((s, i) => {
          const cls = !dropped && i < currentIdx ? 'done' : !dropped && i === currentIdx ? 'current' : '';
          return (
            <div key={s} className={`pip ${cls}`}>
              <span className="n">Step {i + 1}</span>{s}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3d: Create `client/src/pages/Portal/StatusCards.tsx`**

```tsx
import type { PortalJourney } from '../../types/portal.js';

export function StatusCards({ journey }: { journey: PortalJourney }) {
  return (
    <div className="stat-row">
      <div className="card stat"><div className="k">Match readiness</div><div className="v">{journey.matchReadinessPct}%</div></div>
      <div className="card stat"><div className="k">Evaluation</div><div className="v">{journey.evaluationLabel}</div></div>
      <div className="card stat"><div className="k">Offer status</div><div className="v">{journey.offerStatus}</div></div>
    </div>
  );
}
```

- [ ] **Step 3e: Create `client/src/pages/Portal/DrivesList.tsx`**

```tsx
import type { PortalDrive } from '../../types/portal.js';

const TAG_CLASS: Record<PortalDrive['statusTag'], string> = {
  Selected: 'tag selected', 'In progress': 'tag progress', Closed: 'tag closed',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DrivesList({ drives }: { drives: PortalDrive[] }) {
  if (drives.length === 0) {
    return <div className="card portal-empty">You’re not eligible for any open drives yet. Check back soon.</div>;
  }
  return (
    <div className="drive-list">
      {drives.map((d) => (
        <div key={d.id} className="card drive">
          <div className="info">
            <b>{d.name}</b>
            <div className="meta">
              {d.domain && <span><i className="ti ti-briefcase" /> {d.domain}</span>}
              <span><i className="ti ti-building" /> {d.employers.length ? d.employers.join(', ') : '—'}</span>
              {d.eventDates.length > 0 && <span><i className="ti ti-calendar" /> {d.eventDates.map(fmtDate).join(', ')}</span>}
            </div>
          </div>
          <span className={TAG_CLASS[d.statusTag]}>{d.statusTag}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3f: Create `client/src/pages/Portal/index.tsx`**

```tsx
import { useAuth } from '../../auth/AuthContext.js';
import { usePortal } from '../../hooks/usePortal.js';
import { DrivesList } from './DrivesList.js';
import { JourneyPipeline } from './JourneyPipeline.js';
import { PortalShell } from './PortalShell.js';
import { StatusCards } from './StatusCards.js';
import './portal.css';

export function Portal() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = usePortal();
  return (
    <PortalShell name={user?.name ?? 'Jobseeker'}>
      {isLoading && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>Loading your dashboard…</div>}
      {isError && (
        <div className="card" style={{ padding: 20, color: 'var(--danger)' }}>
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}
      {data && (
        <>
          <div className="portal-hero">
            <h1>Hi, {data.profile.name.split(' ')[0]}</h1>
            <div className="sub">
              {data.profile.code} · {data.profile.branch} · {data.profile.institute} · Class of {data.profile.gradYear}
            </div>
          </div>
          <JourneyPipeline journey={data.journey} />
          <StatusCards journey={data.journey} />
          <div>
            <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>My Drives</h2>
            <DrivesList drives={data.drives} />
          </div>
        </>
      )}
    </PortalShell>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w client -- Portal`
Expected: PASS — journey, `92%`, `Acme Corp`, `Selected`, and `My Journey` all render.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Portal/
git commit -m "feat(client): seeker portal page (journey, status, eligible drives)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Wire routing + role-based login navigation

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/auth/LoginPage.tsx`
- Test: `client/src/test/LoginPage.test.tsx` (add a case)

**Interfaces:**
- Consumes: `RoleRoute` (Task 8), `Portal` (Task 9), `login()` returning `User` (Task 7).
- Produces: `/portal` route (jobseeker-only); all admin routes gated to `admin`; login navigates by role.

- [ ] **Step 1: Write the failing test** — append to `client/src/test/LoginPage.test.tsx`.

Add these imports at the top (merge with the existing import line from `react-router-dom` and add `Route`, `Routes`):

```tsx
import { MemoryRouter, Route, Routes } from 'react-router-dom';
```

Add a new test inside the existing `describe('LoginPage', ...)` block:

```tsx
  it('navigates a jobseeker to /portal after login', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ token: 't', user: { id: '1', name: 'Seeker', email: 's@x.z', role: 'jobseeker' } }),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/portal" element={<div>SEEKER PORTAL</div>} />
              <Route path="/" element={<div>ADMIN CONSOLE</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.type(screen.getByLabelText('Email'), 's@x.z');
    await userEvent.type(screen.getByLabelText('Password'), 'Seeker123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('SEEKER PORTAL')).toBeInTheDocument());
  });
```

Note: the existing file already imports `QueryClient`, `QueryClientProvider`, `render`, `screen`, `waitFor`, `userEvent`, `AuthProvider`, `LoginPage`, and `vi` — reuse them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w client -- LoginPage`
Expected: FAIL — `LoginPage` currently navigates to `/` unconditionally, so `SEEKER PORTAL` never appears (the test sees `ADMIN CONSOLE` was never mounted either because navigation goes to `/`, which shows `ADMIN CONSOLE`). The new assertion for `SEEKER PORTAL` fails.

- [ ] **Step 3a: Role-based navigation + copy in `client/src/auth/LoginPage.tsx`**

Read `user` from `useAuth` (change the destructure):

```ts
  const { token, user } = useAuth();
```

Change the default email prefill to empty:

```ts
  const [email, setEmail] = useState('');
```

Navigate by the returned user's role in `onSubmit`:

```ts
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const signedIn = await login.mutateAsync({ email, password });
      navigate(signedIn.role === 'jobseeker' ? '/portal' : '/', { replace: true });
    } catch { /* error surfaced below via login.error */ }
  }
```

Redirect an already-authenticated visitor by role (replace the existing `if (token) return <Navigate to="/" replace />;`):

```ts
  if (token) return <Navigate to={user?.role === 'jobseeker' ? '/portal' : '/'} replace />;
```

Make the copy role-neutral — change these three strings in the JSX:
- `<div className="kicker">Admin access</div>` → `<div className="kicker">Sign in</div>`
- `<p className="sub">Use your Hiringhood admin credentials to continue.</p>` → `<p className="sub">Use your MatchDay credentials to continue.</p>`
- `<div className="cardfoot">Restricted to authorized administrators</div>` → `<div className="cardfoot">Admins and jobseekers sign in here</div>`

- [ ] **Step 3b: Role-gate the routes in `client/src/App.tsx`**

Add imports:

```ts
import { RoleRoute } from './auth/RoleRoute.js';
import { Portal } from './pages/Portal/index.js';
```

Remove the now-unused `ProtectedRoute` import line:

```ts
import { ProtectedRoute } from './auth/ProtectedRoute.js';   // DELETE this line
```

Replace every `<ProtectedRoute>…</ProtectedRoute>` wrapper with `<RoleRoute role="admin">…</RoleRoute>`, and add the seeker route. The `<Routes>` block becomes:

```tsx
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa" element={<MfaStub />} />
        <Route path="/forgot" element={<ForgotStub />} />
        <Route path="/portal" element={<RoleRoute role="jobseeker"><Portal /></RoleRoute>} />
        <Route path="/coming-soon/:slug" element={<RoleRoute role="admin"><ComingSoon /></RoleRoute>} />
        <Route path="/drives" element={<RoleRoute role="admin"><DrivesPage /></RoleRoute>} />
        <Route path="/institutes" element={<RoleRoute role="admin"><InstitutesPage /></RoleRoute>} />
        <Route path="/institutes/:id" element={<RoleRoute role="admin"><InstituteDetail /></RoleRoute>} />
        <Route path="/jobseekers" element={<RoleRoute role="admin"><JobseekersPage /></RoleRoute>} />
        <Route path="/employers" element={<RoleRoute role="admin"><EmployersPage /></RoleRoute>} />
        <Route path="/employers/approvals" element={<RoleRoute role="admin"><ApprovalsPage /></RoleRoute>} />
        <Route path="/slots" element={<RoleRoute role="admin"><SlotsPage /></RoleRoute>} />
        <Route path="/streams" element={<RoleRoute role="admin"><StreamsPage /></RoleRoute>} />
        <Route path="/streams/rules" element={<RoleRoute role="admin"><StreamRulesPage /></RoleRoute>} />
        <Route path="/templates" element={<RoleRoute role="admin"><TemplatesPage /></RoleRoute>} />
        <Route path="/evaluations" element={<RoleRoute role="admin"><EvaluationsPage /></RoleRoute>} />
        <Route path="/evaluations/monitor" element={<RoleRoute role="admin"><EvalMonitorPage /></RoleRoute>} />
        <Route path="/*" element={<RoleRoute role="admin"><Dashboard /></RoleRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w client -- LoginPage`
Expected: PASS — the jobseeker-login case shows `SEEKER PORTAL`; the existing failure case still shows the error alert.

- [ ] **Step 5: Full client build + suite**

Run: `npm run build -w client && npm run test -w client`
Expected: PASS — `tsc -b` confirms no unused-import / type errors (e.g. the removed `ProtectedRoute` import), and all client tests are green.

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx client/src/auth/LoginPage.tsx client/src/test/LoginPage.test.tsx
git commit -m "feat(client): role-routed login and /portal route for jobseekers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the entire suite from the repo root**

Run: `npm test`
Expected: PASS — `npm run test -w server` then `npm run test -w client`, all green.

- [ ] **Manual end-to-end (optional, needs local MongoDB)**

1. `npm run seed` — note the printed `Seeker login →` lines.
2. `npm run dev` — open the client.
3. Sign in as `seeker.selected@matchday.dev` / `Seeker123!` → lands on `/portal`, journey highlights **Offer**, drives tagged **Selected** (drives 0–2 show employer names, others show "—").
4. Sign in as `admin@matchday.dev` / `Password123!` → lands on the admin console; manually visiting `/portal` bounces back to `/`.
5. As the seeker, visiting `/jobseekers` bounces to `/portal`; the API returns `403` for that token.

## Spec coverage check

| Spec requirement | Task |
|---|---|
| `passwordHash` on Jobseeker | 1 |
| Unified `/api/auth/login` (admin then jobseeker) | 1 |
| `requireRole` middleware | 2 |
| Admin routers gated to `admin` (incl. per-route dashboard) | 2 |
| `GET /api/me/portal` derivation (profile/journey/drives) | 3, 4 |
| Eligibility rule (branch/gradYear/source, empty = no constraint) | 3 |
| Status tag Selected / In progress / Closed | 3 |
| Employer names via slots (— when none) | 3 |
| Seed demo passwords + 2 demo accounts + printed creds | 5 |
| Client portal types + hook | 6 |
| `login()` returns user | 7 |
| `RoleRoute` role gating | 8 |
| Seeker portal page (minimal shell, no admin sidebar) | 9 |
| Role-routed login + `/portal` route + role-neutral copy | 10 |
