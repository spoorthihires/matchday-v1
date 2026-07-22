# Jobseeker Portal — Slice JS-B (Public Landing + Signup) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** A public jobseeker marketing landing page (ported from `MatchDay_Jobseeker_Landing_Page.html`) + a public jobseeker signup that logs the seeker straight into `/portal`.

**Tech:** Express/Mongoose (ESM), Zod; React + React Router. Vitest.

## Global Constraints
- Branch `feat/jobseeker-portal-completion` (base `b420629`). Mirror the EMPLOYER equivalents: `employerSignup` in `server/src/modules/auth/auth.service.ts` (for `jobseekerSignup`), `client/src/pages/EmployerPortal/EmployerLanding.tsx` (public landing structure/routing) + `EmployerSignup.tsx` (signup form flow). `AuthContext.login()` already returns the user; reuse it. Identity via server; email unique. Error envelope `{error:{message,code}}`; ESM `.js`.

## Prereq
Baseline green: `npm test -w server -- --run test/seeker-auth.route.test.ts`.

---

## Task 1: Server — jobseeker signup + public institutes list

**Files:** Modify `server/src/modules/auth/auth.service.ts`, `auth.controller.ts`, `auth.routes.ts`; Create `server/test/jobseeker-signup.route.test.ts`.

**Interfaces:** `jobseekerSignup(input) → { token, user }`; `listPublicInstitutes() → { items:[{id,name}] }`; public routes `POST /api/auth/jobseeker-signup`, `GET /api/auth/institutes`.

- [ ] **Step 1: Failing test** — Create `server/test/jobseeker-signup.route.test.ts` (mirror `server/test/*auth*` + employer-signup tests). Seed an Institute. Assert:
  - `GET /api/auth/institutes` (NO auth) → 200, `items` includes `{id, name}` for the seeded institute (no PII beyond names).
  - `POST /api/auth/jobseeker-signup` `{name,email,password,instituteId,branch,gradYear,source,cgpa}` (valid) → 200 `{token, user:{role:'jobseeker', id, name, email}}`; the returned token can `GET /api/me/portal` → 200 (i.e. it's a working jobseeker login). A `Jobseeker` row now exists with `stage:'Applied'` and a `passwordHash` (present ⇒ can log in via `POST /api/auth/login`).
  - Duplicate email → `400` (`validation`); missing/invalid `instituteId` (not a real Institute) → `400`; short password (<8) → `400`.

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Service** — in `auth.service.ts`, add (import `Jobseeker` from `../../models/Jobseeker.js` and `Institute` from `../../models/Institute.js`):
```ts
export async function listPublicInstitutes() {
  const rows = await Institute.find().select('name').sort({ name: 1 }).lean<{ _id: unknown; name?: string }[]>();
  return { items: rows.map((i) => ({ id: String(i._id), name: i.name ?? '—' })) };
}

export async function jobseekerSignup(input: {
  name: string; email: string; password: string; instituteId: string;
  branch: string; gradYear: number; source: string; cgpa: number;
}) {
  const email = input.email.toLowerCase().trim();
  if (await Jobseeker.findOne({ email })) throw new HttpError(400, 'An account with this email already exists', 'validation');
  if (!Types.ObjectId.isValid(input.instituteId) || !(await Institute.findById(input.instituteId)))
    throw new HttpError(400, 'Please choose a valid institute', 'validation');
  const passwordHash = await hashPassword(input.password);
  const js = await Jobseeker.create({
    name: input.name, email, instituteId: input.instituteId, branch: input.branch,
    gradYear: input.gradYear, cgpa: input.cgpa, source: input.source,
    passwordHash, stage: 'Applied', profileCompleted: false, evaluationStatus: 'na',
  });
  const token = signToken({ sub: String(js._id), role: 'jobseeker' });
  return { token, user: { id: String(js._id), name: js.name, email, role: 'jobseeker' as const } };
}
```
(import `Types` from mongoose if not already; `HttpError`/`hashPassword`/`signToken` are in-module.)

- [ ] **Step 4: Controller + routes + schema** — in `auth.controller.ts` add a zod schema `jobseekerSignupSchema = z.object({ name: z.string().trim().min(1), email: z.string().email(), password: z.string().min(8), instituteId: z.string().min(1), branch: z.string().trim().min(1), gradYear: z.number().int(), source: z.string().trim().min(1), cgpa: z.number().min(0).max(10) })` and controllers `jobseekerSignupController` (parse → `res.json(await jobseekerSignup(...))`) + `institutesController` (`res.json(await listPublicInstitutes())`). In `auth.routes.ts` add (PUBLIC — before any gate; mirror `/employer-signup`): `authRoutes.post('/jobseeker-signup', asyncHandler(jobseekerSignupController)); authRoutes.get('/institutes', asyncHandler(institutesController));`

- [ ] **Step 5: Green + full server suite + tsc** — `npm test -w server -- --run test/jobseeker-signup.route.test.ts && npm test -w server && npx -w server tsc --noEmit`.

- [ ] **Step 6: Commit** — `git add server/src/modules/auth server/test/jobseeker-signup.route.test.ts && git commit -m "feat(server): public jobseeker signup + institutes list"`

---

## Task 2: Client — public jobseeker landing page

**Files:** Create `client/src/pages/JobseekerLanding/JobseekerLanding.tsx`, `client/src/pages/JobseekerLanding/jobseekerLanding.css`; Modify `client/src/App.tsx`; Create `client/src/test/JobseekerLanding.test.tsx`.

Port `MatchDay_Jobseeker_Landing_Page.html` (repo root) into a React page. **Mirror `client/src/pages/EmployerPortal/EmployerLanding.tsx`** for the public-page pattern (no auth gate, its own scoped wrapper class + CSS import, brand + CTAs → routes).

- [ ] **Step 1: Failing test** — Create `client/src/test/JobseekerLanding.test.tsx` (render `<JobseekerLanding/>` in a `<MemoryRouter>`; the global test setup provides ThemeProvider is NOT needed if the page doesn't use `useTheme` — but wrap in `<ThemeProvider>` to be safe, mirroring other tests). Assert: the hero headline "Your next job, matched in one week" renders; a **Log in** link/button with a route to `/login`; a **Join free** link/button routing to `/jobseekers/signup`; at least one marketing section heading (e.g. "Why MatchDay" or the streams grid) renders.

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Build the page** — Create `JobseekerLanding.tsx`: a single scoped wrapper `<div className="js-landing">…</div>` containing the ported sections from the prototype (nav with Log in / Join free, hero + Wednesday-rail motif, Why MatchDay, Events, Streams grid, How-it-works timeline, The assessment, Companies `.league` table, Success stories, FAQ, final CTA, footer). Content is **static** (port the prototype's copy/arrays — STREAMS, TESTS, companies, FAQ items — as in-file constants). CTAs: "Log in" → `<Link to="/login">`; "Join free"/"Register"/final-CTA → `<Link to="/jobseekers/signup">`. Use React Router `<Link>` (not `<a>`), plain semantic markup + the ported classes. Create `jobseekerLanding.css` with the prototype's landing-specific styles **scoped under `.js-landing`** (port `.hero*`, `.league`, `.fx`, `.stream*`, `.timeline/.tl-*`, `.cover*`, `.faq`, `.cta-band`, nav/footer, and the `--indigo`/Inter tokens if not already global). Import the css at the top of the page. Do NOT modify any global css.

- [ ] **Step 4: Route** — In `App.tsx`, import `JobseekerLanding` and add a PUBLIC route (no RoleRoute), e.g. `<Route path="/jobseekers" element={<JobseekerLanding />} />` (mirror how `EmployerLanding` is routed).

- [ ] **Step 5: Green + tsc** — `npm test -w client -- --run src/test/JobseekerLanding.test.tsx && npx -w client tsc --noEmit`.

- [ ] **Step 6: Commit** — `git add client/src/pages/JobseekerLanding client/src/App.tsx client/src/test/JobseekerLanding.test.tsx && git commit -m "feat(client): public jobseeker landing page"`

---

## Task 3: Client — jobseeker signup page

**Files:** Create `client/src/pages/JobseekerLanding/JobseekerSignup.tsx`, `client/src/hooks/useJobseekerSignup.ts` (or inline); Modify `client/src/App.tsx`; Create `client/src/test/JobseekerSignup.test.tsx`.

**Mirror `client/src/pages/EmployerPortal/EmployerSignup.tsx`** (its form + `useAuth().login`/signup flow + navigate).

- [ ] **Step 1: Failing test** — Create `client/src/test/JobseekerSignup.test.tsx`. Mock `GET /api/auth/institutes` → `{items:[{id:'i1',name:'Acme University'}]}` and `POST /api/auth/jobseeker-signup` → `{token:'t', user:{id:'j1',name:'X',email:'x@x.test',role:'jobseeker'}}`. Render in the test harness (QueryClient+MemoryRouter+AuthProvider, at `/jobseekers/signup`, with a `/portal` route present to assert navigation). Fill name/email/password/branch/gradYear/source/cgpa + select the institute; submit; assert `POST /api/auth/jobseeker-signup` fired with the entered fields, and the app navigated to `/portal` (assert a `/portal` marker renders).

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Build** — `JobseekerSignup.tsx` (route `/jobseekers/signup`): a form (name, email, password, institute `<select>` populated from a `GET /api/auth/institutes` query, branch, gradYear (number), source, cgpa (number)). On submit → `POST /api/auth/jobseeker-signup` (via `apiFetch`), then call `useAuth().login`-style handling: since signup returns `{token,user}`, store it the same way `EmployerSignup` does (reuse the AuthContext method the employer signup uses — check `EmployerSignup.tsx`), then `navigate('/portal')`. Surface a submit error (`role="alert"`). Reuse existing form control classes (check `EmployerSignup`/theme).

- [ ] **Step 4: Route** — In `App.tsx` add PUBLIC `<Route path="/jobseekers/signup" element={<JobseekerSignup />} />`.

- [ ] **Step 5: Green + full client suite + tsc + build** — `npm test -w client -- --run src/test/JobseekerSignup.test.tsx && npm test -w client && npx -w client tsc --noEmit && npm run -w client build`.

- [ ] **Step 6: Commit** — `git add client/src/pages/JobseekerLanding/JobseekerSignup.tsx client/src/hooks/useJobseekerSignup.ts client/src/App.tsx client/src/test/JobseekerSignup.test.tsx && git commit -m "feat(client): jobseeker signup page"`

---

## Notes
- The landing is a marketing page with static content (documented non-goal: no real events/streams feed). The only real wiring is the two CTAs → `/login` and `/jobseekers/signup`.
- Jobseeker signup creates an immediately-active seeker (stage Applied) — no admin approval gate (a self-serve candidate), unlike employer signup which lands Pending. Documented.
- Mirror employer siblings for all boilerplate (routing, form controls, AuthContext usage). No global CSS changes; landing CSS scoped under `.js-landing`.
