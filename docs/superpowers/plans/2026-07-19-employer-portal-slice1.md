# Employer Portal — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the employer role — auth (landing/signup/verify/login/mfa), the authenticated app shell, and a live-where-possible dashboard — by extending the existing multi-role auth and mirroring the `seekerPortal` pattern.

**Architecture:** Add an `Employer` branch to the unified `/api/auth/login`; add `Employer.passwordHash` + onboarding fields; a public `POST /api/auth/employer-signup` that creates a Pending employer + auto-logs-in; a `requireRole('employer')`-gated `GET /api/me/employer` aggregate (new `employerPortal` module mirroring `seekerPortal`). Client: `/employer/*` routes, a ported employer stylesheet, the auth screens (verify/MFA are stubs), the app shell, and the dashboard fed by `/api/me/employer`.

**Tech Stack:** Express 4 + Mongoose 8 + zod + bcryptjs + jsonwebtoken (server, TS strict, ESM `.js` suffixes); React 18 + Vite + react-router-dom 6 + @tanstack/react-query 5 (client); vitest + mongodb-memory-server + @testing-library/react (tests).

## Global Constraints

- TS strict; ESM `.js` import suffixes; `npx -w server tsc --noEmit` AND `npx -w client tsc --noEmit` must stay clean.
- Error contract `{ error: { message, code } }`; zod → 400; auth → 401; role → 403; not-found → 404. `HttpError(status,message,code)` from `../../middleware/errorHandler.js`.
- Reuse existing helpers: `hashPassword`/`verifyPassword`/`signToken` in `auth.service.ts`; `requireAuth` + `requireRole` middleware; the `seekerPortal` module as the shape template.
- **Do not change** the admin or jobseeker experiences (auth `User`/`Jobseeker` branches, their routes/pages) beyond the additive role widening.
- Verify + MFA are **UI stubs** — no email/TOTP infra; the client screens accept any 6-digit code.
- Employer signup creates an `Employer(status:'Pending', passwordHash, …)`. Signup ≠ `RegistrationRequest`.
- Derived-never-stored for the dashboard aggregate.
- The employer client area lives under `client/src/pages/EmployerPortal/`; the employer stylesheet is `client/src/styles/employer.css`, scoped under an `.employer-app` root class so it can't collide with the admin `theme.css` / jobseeker styles.
- **Port visual markup/CSS from the committed prototype** `Matchday_Employer.html` (in the branch root). Section line ranges: landing 1869–2223, signup 2224–2417, verify 2418–2466, login 2467–2576, mfa 2577–2629, app-shell 2630–2704, dashboard 2705–~2790. The `<style>` block is near the top of the file.
- Commit messages end with exactly:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work exclusively in the worktree `/Users/srinivasarao.kandula/code/matchday-employer1`. Never run `npm run seed` against the shared DB — the seed RUN happens only in Task 9 against an isolated DB.

---

### Task 1: Server — Employer account fields + login branch + signup service/route (+ tests)

**Files:**
- Modify: `server/src/models/Employer.ts`, `server/src/modules/auth/auth.service.ts`, `server/src/modules/auth/auth.controller.ts`, `server/src/modules/auth/auth.routes.ts`
- Test: `server/test/auth.test.ts` (extend) or `server/test/employer-auth.test.ts` (new)

**Interfaces:**
- Produces: `Employer` with `passwordHash` + onboarding fields; `login` resolves employers → `role:'employer'`; `employerSignup(input)` service; `POST /api/auth/employer-signup`.

- [ ] **Step 1: Employer model** — in `server/src/models/Employer.ts`, add:
```ts
  passwordHash: { type: String, default: undefined },
  website: { type: String, default: '' },
  hiringType: { type: String, default: '' },
  workLocations: { type: [String], default: [] },
  designation: { type: String, default: '' },
  phone: { type: String, default: '' },
  billingContact: { type: String, default: '' },
  gstNumber: { type: String, default: '' },
```
(keep existing fields; `status` already enumerates `'Pending'`.)

- [ ] **Step 2: Write the failing auth test** — new `server/test/employer-auth.test.ts` (use the existing auth test harness — read `server/test/auth.test.ts` for `createApp`/`request`/db-helper conventions):
```ts
// setup: createApp(), db helpers
import { Employer } from '../src/models/Employer.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';

it('an employer with a valid passwordHash logs in as role=employer', async () => {
  await Employer.create({ name: 'Acme', industry: 'Tech', email: 'hire@acme.test', status: 'Active', passwordHash: await hashPassword('Employer123!') });
  const res = await request(app).post('/api/auth/login').send({ email: 'hire@acme.test', password: 'Employer123!' });
  expect(res.status).toBe(200);
  expect(res.body.user.role).toBe('employer');
});
it('wrong employer password → 401', async () => {
  await Employer.create({ name: 'Acme', industry: 'Tech', email: 'hire@acme.test', status: 'Active', passwordHash: await hashPassword('Employer123!') });
  const res = await request(app).post('/api/auth/login').send({ email: 'hire@acme.test', password: 'nope' });
  expect(res.status).toBe(401);
});
it('employer-signup creates a Pending employer with a hashed password + returns a token', async () => {
  const body = { name: 'NewCo', website: 'newco.com', industry: 'Tech', size: '51–200', hiringType: 'Full-time', workLocations: ['Hyderabad'], spoc: 'Asha', designation: 'TA', email: 'ta@newco.test', phone: '9', billingContact: 'fin@newco.test', gstNumber: '22ABCDE1234F1Z5', acceptTerms: true, acceptPrivacy: true, password: 'Secret123!' };
  const res = await request(app).post('/api/auth/employer-signup').send(body);
  expect(res.status).toBe(201);
  expect(res.body.user.role).toBe('employer');
  const emp = await Employer.findOne({ email: 'ta@newco.test' });
  expect(emp!.status).toBe('Pending');
  expect(emp!.passwordHash).toBeTruthy();
  expect(emp!.passwordHash).not.toBe('Secret123!'); // hashed
});
it('duplicate email signup → 400', async () => {
  await Employer.create({ name: 'X', industry: 'Tech', email: 'dup@x.test', status: 'Active' });
  const res = await request(app).post('/api/auth/employer-signup').send({ name: 'Y', industry: 'Tech', size: '51–200', spoc: 'A', email: 'dup@x.test', acceptTerms: true, acceptPrivacy: true, password: 'Secret123!' });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 3: Run — expect FAIL** — `npm test -w server -- employer-auth`.

- [ ] **Step 4: Add the employer login branch** — in `auth.service.ts`, import `Employer`, and after the `Jobseeker` branch (before the final throw):
```ts
  const employer = await Employer.findOne({ email: normalized });
  if (employer && employer.passwordHash) {
    const ok = await verifyPassword(password, employer.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid credentials', 'auth');
    const token = signToken({ sub: String(employer._id), role: 'employer' });
    return { token, user: { id: String(employer._id), name: employer.name, email: employer.email ?? '', role: 'employer' } };
  }
```

- [ ] **Step 5: employerSignup service** — in `auth.service.ts` add:
```ts
export async function employerSignup(input: {
  name: string; website?: string; industry: string; size?: string; hiringType?: string; workLocations?: string[];
  spoc: string; designation?: string; email: string; phone?: string; billingContact?: string; gstNumber?: string; password: string;
}) {
  const email = input.email.toLowerCase().trim();
  if (await Employer.findOne({ email })) throw new HttpError(400, 'An account with this email already exists', 'validation');
  const passwordHash = await hashPassword(input.password);
  const emp = await Employer.create({
    name: input.name, website: input.website ?? '', industry: input.industry, size: input.size ?? '51–200',
    hiringType: input.hiringType ?? '', workLocations: input.workLocations ?? [], spoc: input.spoc,
    designation: input.designation ?? '', email, phone: input.phone ?? '', billingContact: input.billingContact ?? '',
    gstNumber: input.gstNumber ?? '', status: 'Pending', passwordHash,
  });
  const token = signToken({ sub: String(emp._id), role: 'employer' });
  return { token, user: { id: String(emp._id), name: emp.name, email, role: 'employer' as const } };
}
```

- [ ] **Step 6: signup controller + route** — in `auth.controller.ts` add a zod schema + controller:
```ts
import { employerSignup } from './auth.service.js';
const employerSignupSchema = z.object({
  name: z.string().trim().min(1), website: z.string().trim().optional(),
  industry: z.string().trim().min(1), size: z.string().optional(), hiringType: z.string().optional(),
  workLocations: z.array(z.string()).optional(), spoc: z.string().trim().min(1), designation: z.string().optional(),
  email: z.string().email(), phone: z.string().optional(), billingContact: z.string().optional(),
  gstNumber: z.string().optional(), acceptTerms: z.literal(true), acceptPrivacy: z.literal(true),
  password: z.string().min(6),
});
export async function employerSignupController(req: Request, res: Response) {
  const parsed = employerSignupSchema.parse(req.body);
  res.status(201).json(await employerSignup(parsed));
}
```
In `auth.routes.ts`: `authRoutes.post('/employer-signup', asyncHandler(employerSignupController));`

- [ ] **Step 7: GREEN + tsc + full suite** — `npm test -w server -- employer-auth`; `npx -w server tsc --noEmit`; `npm test -w server`. Commit.
```bash
git add server/src/models/Employer.ts server/src/modules/auth/ server/test/employer-auth.test.ts
git commit -m "feat(server): employer login branch + employer-signup (Pending account)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server — `employerPortal` aggregate (`GET /api/me/employer`) (+ test)

**Files:**
- Create: `server/src/modules/employerPortal/employerPortal.service.ts`, `.controller.ts`, `.routes.ts`
- Modify: `server/src/app.ts` (mount)
- Test: `server/test/employer-portal.route.test.ts`

**Interfaces:**
- Consumes: JWT `sub` = Employer `_id`; `Employer`, `Drive`, `Slot`, `SlotBooking`.
- Produces: `GET /api/me/employer` → `{ profile, dashboard }`.

- [ ] **Step 1: Read the template** — read `server/src/modules/seekerPortal/{service,controller,routes}.ts` (structure) and how `req` carries the auth payload (`requireAuth` sets `req.user`/`req.auth` — match the seeker controller's access to the JWT `sub`).

- [ ] **Step 2: Write the failing route test** — `server/test/employer-portal.route.test.ts` (copy the route-test harness from `seekerPortal`/`eval-monitor` route tests — `createApp` + `signToken`):
```ts
it('401 without a token; 403 for a non-employer token', async () => {
  const s = await Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x' });
  const noTok = await request(app).get('/api/me/employer');
  expect(noTok.status).toBe(401);
  const adminTok = signToken({ sub: 'u1', role: 'admin' });
  const asAdmin = await request(app).get('/api/me/employer').set('Authorization', `Bearer ${adminTok}`);
  expect(asAdmin.status).toBe(403);
});
it('returns the employer profile + dashboard shape', async () => {
  const emp = await Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Pending', passwordHash: 'x' });
  const tok = signToken({ sub: String(emp._id), role: 'employer' });
  const res = await request(app).get('/api/me/employer').set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
  expect(res.body.profile).toMatchObject({ name: 'Acme', status: 'Pending' });
  expect(res.body.profile).not.toHaveProperty('passwordHash');
  expect(res.body.dashboard).toHaveProperty('registrations'); // placeholder shape present
});
```

- [ ] **Step 3: Service** — `employerPortal.service.ts`:
```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { Employer } from '../../models/Employer.js';
import { Slot } from '../../models/Slot.js';

export async function getEmployerPortal(employerId: string) {
  if (!Types.ObjectId.isValid(employerId)) throw new HttpError(404, 'Employer not found', 'not_found');
  const emp = await Employer.findById(employerId).lean();
  if (!emp) throw new HttpError(404, 'Employer not found', 'not_found');
  const empObjId = new Types.ObjectId(employerId);
  // derived: distinct drives this employer participates in (via their booked slots)
  const driveAgg = await Slot.aggregate([
    { $match: { employerId: empObjId } },
    { $group: { _id: null, drives: { $addToSet: '$driveId' }, slots: { $sum: 1 } } },
  ]);
  const activeDrives = driveAgg[0]?.drives?.length ?? 0;
  const totalSlots = driveAgg[0]?.slots ?? 0;
  // upcoming interview slots (future), grouped for a calendar widget
  const now = new Date();
  const upcoming = await Slot.find({ employerId: empObjId, date: { $gte: now } }).sort({ date: 1 }).limit(20).lean();
  const calendar = upcoming.map((s) => ({ id: String(s._id), date: new Date(s.date).toISOString(), start: s.start, end: s.end, driveId: String(s.driveId) }));
  return {
    profile: {
      id: String(emp._id), name: emp.name, email: emp.email ?? '', industry: emp.industry,
      size: emp.size ?? '', status: emp.status ?? 'Active', spoc: emp.spoc ?? '', website: emp.website ?? '',
    },
    dashboard: {
      kpis: { activeDrives, upcomingInterviews: calendar.length, totalSlots },
      calendar,
      registrations: [] as unknown[],   // placeholder — filled by Slice 3
      shortlist: [] as unknown[],       // placeholder — filled by Slice 6
    },
  };
}
```

- [ ] **Step 4: Controller + routes** — mirror `seekerPortal.controller.ts`/`.routes.ts`. Controller reads the JWT `sub` (same access path the seeker controller uses) and calls `getEmployerPortal(sub)`. Routes:
```ts
export const employerPortalRoutes = Router();
employerPortalRoutes.use(requireAuth);
employerPortalRoutes.use(requireRole('employer'));
employerPortalRoutes.get('/employer', asyncHandler(portalController));
```
Mount in `app.ts` under `/api/me` (same base the seeker portal uses — read app.ts to confirm the seeker mount and mirror it; if the seeker mounts at `/api/me/portal`, mount this router at `/api/me` so the path is `/api/me/employer`).

- [ ] **Step 5: GREEN + tsc + full suite** — `npm test -w server -- employer-portal`; `npx -w server tsc --noEmit`; `npm test -w server`. Commit.
```bash
git add server/src/modules/employerPortal/ server/src/app.ts server/test/employer-portal.route.test.ts
git commit -m "feat(server): /api/me/employer portal aggregate (employer-gated)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Server — seed a demo employer login (+ verify green)

**Files:** Modify `server/src/seed/seed.ts`.

- [ ] **Step 1** — read how the seed creates the jobseeker demo accounts with `passwordHash` (grep `passwordHash`/`hashPassword` in seed.ts) and the login-print block at the end. Mirror it.
- [ ] **Step 2** — ensure a seeded `Employer` gets `status:'Active'` + `passwordHash: await hashPassword('Employer123!')` on a known demo email (e.g. `employer.demo@acme.test`), and at least one seeded employer stays `status:'Pending'`. Deterministic (no rng in the hash path). Add an "Employer login →" line to the seed's console summary.
- [ ] **Step 3** — `npx -w server tsc --noEmit`; `npm test -w server` (green). Do NOT run `npm run seed`. Commit.
```bash
git add server/src/seed/seed.ts
git commit -m "feat(seed): demo employer login + a Pending employer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Client — roles/routing foundation + employer stylesheet + route scaffold (+ test)

**Files:**
- Modify: `client/src/auth/roles.ts`, `client/src/auth/RoleRoute.tsx`, `client/src/App.tsx`
- Create: `client/src/styles/employer.css`, `client/src/pages/EmployerPortal/EmployerComingSoon.tsx` (+ minimal placeholder route targets so the app compiles/routes)
- Test: `client/src/test/employerRouting.test.tsx`

- [ ] **Step 1: roles + RoleRoute** — `roles.ts`: `homePathFor` returns `'/employer/dashboard'` for `role === 'employer'` (keep jobseeker `/portal`, default `/`). `RoleRoute.tsx`: widen the prop to `role: 'admin' | 'jobseeker' | 'employer'`.
- [ ] **Step 2: employer stylesheet** — create `client/src/styles/employer.css` by extracting the `<style>` block from the committed `Matchday_Employer.html` and scoping it under an `.employer-app` root (prefix selectors, or wrap so it doesn't leak to admin/jobseeker). Import it from the employer area root component (Task 7 shell + the auth screens wrap themselves in `.employer-app`). Keep the prototype's class names.
- [ ] **Step 3: routes** — in `App.tsx`, add the `/employer/*` routes. Public: `/employer` (landing), `/employer/signup`, `/employer/verify`, `/employer/login`, `/employer/mfa`. Gated: `/employer/dashboard` and `/employer/coming-soon/:slug` under `<RoleRoute role="employer">`. For THIS task, point them at lightweight placeholder components (real ones land in Tasks 5–8) so the app compiles. Add `EmployerComingSoon` (reads `:slug`, renders "Coming soon").
- [ ] **Step 4: routing test** — `employerRouting.test.tsx`: an employer-role auth in localStorage → visiting `/employer/dashboard` renders (not redirected); a jobseeker/admin token → redirected away by `RoleRoute`; `homePathFor('employer') === '/employer/dashboard'`. Match the existing `RoleRoute.test.tsx` harness.
- [ ] **Step 5: tsc + full client suite + commit** — `npx -w client tsc --noEmit`; `npm test -w client`. Commit.

---

### Task 5: Client — employer landing + login + verify/MFA stubs (+ test)

**Files:** Create under `client/src/pages/EmployerPortal/`: `EmployerLanding.tsx`, `EmployerLogin.tsx`, `EmployerVerify.tsx`, `EmployerMfa.tsx`. Wire them into the `App.tsx` routes (replace Task-4 placeholders). Test: `client/src/test/EmployerLogin.test.tsx`.

- [ ] Port markup from the prototype (landing 1869–2223 minimal; login 2467–2576; verify 2418–2466; mfa 2577–2629), each wrapped in `.employer-app`.
- [ ] **Landing** — minimal: brand + hero + buttons routing to `/employer/login` and `/employer/signup`.
- [ ] **Login** — email+password form → `useAuth().login(email, password)` → on success `navigate('/employer/mfa')`; surface `ApiError.message` inline. (Reuse the AuthContext `login`; it posts to `/api/auth/login` which now resolves employers.)
- [ ] **Verify stub** — 6-digit code input; any non-empty 6-digit → `navigate('/employer/dashboard')`. A "Resend" is cosmetic.
- [ ] **MFA stub** — 6-digit code; any 6-digit → `navigate('/employer/dashboard')`.
- [ ] **Test** — `EmployerLogin.test.tsx`: submitting valid creds (mock fetch `/auth/login` → employer user) navigates toward `/employer/mfa`; a 401 shows the inline error. Use the client test harness + fetch stub.
- [ ] tsc + full client suite + commit.

---

### Task 6: Client — 3-step signup wizard (+ test)

**Files:** Create `client/src/pages/EmployerPortal/EmployerSignup.tsx` (+ a small `useEmployerSignup` hook or inline `apiFetch`). Wire into the `/employer/signup` route. Test: `client/src/test/EmployerSignup.test.tsx`.

- [ ] Port the 3-step wizard markup (prototype 2224–2417): Step 1 Company (name, website, industry, size, hiringType, workLocations), Step 2 Contact (spoc name, designation, email, phone), Step 3 Billing+consent (billingContact, gstNumber, acceptTerms, acceptPrivacy) + a password field (the prototype may collect it at signup or verify — add a password field in the wizard so the account has credentials). Per-step "Next" validates that step's required fields before advancing.
- [ ] On final submit: `apiFetch('/auth/employer-signup', { method:'POST', body })` → then `useAuth().login(email, password)` to establish the session (reuses login; zero AuthContext change) → `navigate('/employer/verify')`. Surface `ApiError.message` (e.g. duplicate email) inline.
- [ ] **Test** — `EmployerSignup.test.tsx`: Next is blocked with missing required fields on step 1; a full 3-step completion posts the expected `employer-signup` body (mock fetch) and then navigates to verify. Assert the payload shape (name/industry/spoc/email/acceptTerms/password present).
- [ ] tsc + full client suite + commit.

---

### Task 7: Client — employer app shell + `useEmployerPortal` hook (+ test)

**Files:** Create `client/src/pages/EmployerPortal/EmployerShell.tsx`, `client/src/pages/EmployerPortal/hooks/useEmployerPortal.ts`. Test: `client/src/test/EmployerShell.test.tsx`.

- [ ] **`useEmployerPortal`** — React Query hook: `GET /api/me/employer` (via `apiFetch` + `useAuth().token`), `queryKey: ['employer-portal']`, `enabled: !!token`. Return type mirrors the server `{ profile, dashboard }`; add a client type in `client/src/types/employer.ts`.
- [ ] **`EmployerShell`** — the sidebar (dashboard, drives, registrations, candidates, interviews, kanban, reports, settings) + topbar (search, user menu → `useAuth().logout()`), wrapped in `.employer-app`, rendering `children`/`<Outlet>`. Sidebar items for not-yet-built areas navigate to `/employer/coming-soon/<slug>`; the dashboard item → `/employer/dashboard`. Port shell markup from prototype 2630–2704.
- [ ] **Test** — `EmployerShell.test.tsx`: renders the sidebar nav items; clicking a not-built item routes to coming-soon; the user menu logout calls `logout`. (Mock `/api/me/employer` if the shell reads the profile for the user menu.)
- [ ] tsc + full client suite + commit.

---

### Task 8: Client — employer dashboard (+ test)

**Files:** Create `client/src/pages/EmployerPortal/EmployerDashboard.tsx`. Wire the `/employer/dashboard` route to render `EmployerShell` + `EmployerDashboard`. Test: `client/src/test/EmployerDashboard.test.tsx`.

- [ ] Port dashboard markup (prototype 2705–~2790): greeting ("Welcome back, {profile.name}"), KPI grid (from `dashboard.kpis`), the calendar widget (from `dashboard.calendar`), and the registrations/shortlist cards rendering **empty states** when their arrays are empty. Show a **"Pending review" banner** when `profile.status === 'Pending'`.
- [ ] Data via `useEmployerPortal()`; loading + error states.
- [ ] **Test** — `EmployerDashboard.test.tsx`: with a mocked `/api/me/employer` (status Pending, some kpis, empty registrations) → renders the greeting, the KPI values, the empty-state copy, and the Pending banner; with status Active → no banner.
- [ ] tsc + full client suite + commit.

---

### Task 9: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only).

- [ ] **Step 1:** `npm test -w server && npm test -w client`.
- [ ] **Step 2:** `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: seed + smoke against an isolated DB** (controller): `MONGODB_URI=mongodb://localhost:27017/matchday_employer1_smoke npm run seed -w server`; start the worktree server on a spare port + that DB:
  - `POST /api/auth/login` with the demo employer creds → 200, `user.role==='employer'`.
  - `GET /api/me/employer` with that token → 200 profile+dashboard; with an admin token → 403.
  - `POST /api/auth/employer-signup` (fresh email) → 201; the new employer is `status:'Pending'` and appears in the admin employers list (`GET /api/employers` with an admin token includes it).
  - Duplicate-email signup → 400.
  - Stop server; drop `matchday_employer1_smoke`; confirm the shared `matchday` DB untouched.
- [ ] **Step 4:** No commit.

---

## Self-Review Notes (author)

- **Spec coverage:** Employer model + login branch + signup → T1; `/api/me/employer` → T2; seed → T3; roles/routing/CSS scaffold → T4; landing/login/verify/mfa → T5; signup wizard → T6; shell + hook → T7; dashboard → T8; E2E → T9.
- **Reuse over rebuild:** login/hash/token/requireRole/seekerPortal all exist; this widens the role. AuthContext untouched — signup reuses `login(email,password)` post-signup.
- **Stubs:** verify/MFA are client-only pass-throughs; signup already returns a token, so verify is cosmetic.
- **Styling isolation:** `.employer-app` scope prevents collision with admin/jobseeker CSS.
- **Type consistency:** server `{ profile, dashboard }` ↔ client `types/employer.ts` ↔ `useEmployerPortal`. `role: 'employer'` threaded through `roles.ts`/`RoleRoute`/JWT.
- **Signup ≠ RegistrationRequest:** creates an `Employer(Pending)`; the admin Employers list is the approval surface (existing).
- **Client port delegation:** markup/CSS ported from the committed `Matchday_Employer.html` (line ranges given); the plan specifies routing/hooks/data-flow precisely and leaves pixel porting to the implementer against the prototype.
