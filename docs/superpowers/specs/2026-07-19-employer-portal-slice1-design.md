# Employer Portal — Slice 1 (Auth + Onboarding + Shell + Dashboard) — MERN Slice Design

**Date:** 2026-07-19
**Status:** Approved design, pending implementation plan
**Depends on:** the completed admin port + real-links + the multi-role auth foundation (admin `User` → `Jobseeker`) + jobseeker portal + tech-debt, all on `origin/main` @524fabf. Reuses the auth module, `requireRole`, the `seekerPortal` pattern, the `Employer` model, and the admin Employers approve/disable flow.
**Context:** First of ~10 vertical slices building the net-new **employer-facing role application** from the design prototype `Matchday_Employer.html` (`<title>Hiringhood MatchDay — For Employers</title>`). This slice is the foundation every later slice logs into and navigates through: employer auth + onboarding, the authenticated app shell, and the dashboard.

## 0. Where this fits

The MERN app already serves two roles via a unified `/api/auth/login` (admin `User` → `Jobseeker` → role-scoped JWT) with `requireRole` gating and a `seekerPortal` `/api/me/portal` aggregate. This slice adds the **third role, `employer`**, extending that exact foundation. The employer prototype has its own visual identity (distinct from the admin `theme.css`), reached under `/employer/*` routes.

The remaining ~9 employer slices (drive marketplace, per-drive registration, slot booking, candidates/passport/consent + the `Application` entity, shortlist, interviews, kanban, offers, notifications/reports/team/support) are **out of scope** here — Slice 1 stands up the shell + dashboard they plug into.

## 1. Goal & Scope

Employers can sign up (creating a Pending account that appears in the admin Employers approval list), verify (stub), log in (email+password), pass MFA (stub), and land in an authenticated employer app shell with a working dashboard.

### In scope
- **`Employer.passwordHash`** (bcrypt) + the onboarding profile fields the signup collects.
- **Employer login** — a third branch in `auth.service` (`Employer.findOne` → `role:'employer'`).
- **`POST /api/auth/employer-signup`** (public) — creates a Pending employer + auto-login token.
- **`GET /api/me/employer`** (`requireRole('employer')`) — profile + dashboard aggregate (derived from existing data + placeholder shapes for later-slice widgets).
- **Client `/employer/*`** — minimal landing, 3-step signup wizard, email-OTP verify **stub**, login, TOTP MFA **stub**, the app shell (sidebar + topbar), and the dashboard.
- **Employer stylesheet** ported from the prototype, scoped to the employer routes.
- **Seed** a demo employer (Active, with passwordHash) + keep a Pending one.

### Out of scope (deferred to later slices / decisions)
- Real email OTP + TOTP MFA (both **stubbed** — accept a demo/any code, like the admin `MfaStub`/`ForgotStub`).
- The full marketing landing (streams/process/pricing) — **minimal landing** only.
- Everything past the shell: drives, registrations, candidates, interviews, kanban, offers, reports, settings, team access, support, notifications — sidebar items for these route to a "Coming soon" placeholder in Slice 1.
- The `Application`/pipeline entity, `Offer`, `Interview`, `Notification` (later slices).
- Any change to the admin or jobseeker experiences.

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Verify + MFA | Faithful UI, **stubbed** (accept a demo/any code); no email/TOTP infra |
| Login | Real email + `passwordHash`, via the existing unified `/api/auth/login` (add employer branch) |
| Signup lifecycle | Creates a **Pending `Employer`** (passwordHash + onboarding) → appears in the admin Employers list for approve/disable; employer can log in immediately; a "Pending review" banner shows until `status==='Active'` |
| Signup ≠ RegistrationRequest | Company signup creates an `Employer`; `RegistrationRequest` (per-drive hiring) is Slice 3 |
| Landing | Minimal (brand + hero + Log in / Employer sign up) |
| Dashboard | Shell + live-where-possible via `/api/me/employer`; empty states for later-slice widgets |
| Styling | Dedicated employer stylesheet, faithful to the prototype, scoped to `/employer` |

## 3. Server changes

### 3.1 `Employer` model — `server/src/models/Employer.ts`
Add: `passwordHash: { type: String, default: undefined }` and the onboarding fields the signup collects that aren't present: `website`, `hiringType`, `workLocations: [String]`, `designation`, `phone`, `billingContact`, `gstNumber`. (`name`, `industry`, `size`, `email`, `spoc`, `status` already exist; `status:'Pending'` is already an enum value.) No stats fields change.

### 3.2 Auth — `server/src/modules/auth/auth.service.ts`
After the `User` and `Jobseeker` branches, add: resolve `Employer.findOne({ email: normalized })`; if it has a `passwordHash` that verifies, return `signToken({ sub, role: 'employer' })` + a `{ id, name, email, role:'employer' }` user shape. Order: admin `User` → `Jobseeker` → `Employer`. Uses the same bcrypt-compare helper the jobseeker branch uses.

### 3.3 Employer signup — `server/src/modules/auth/` (extend) or a small `employerSignup` route
- **`POST /api/auth/employer-signup`** (public, no auth) — zod-validated 3-step payload (company: name/website/industry/size/hiringType/workLocations; contact: spoc(name)/designation/email/phone; billing: billingContact/gstNumber; consent booleans required true). Rejects a duplicate email (400). Hashes the password (bcrypt). Creates `Employer(status:'Pending', passwordHash, …fields)`. Returns `{ token, user }` (auto-login as `role:'employer'`) — same shape as login.
- The Pending employer surfaces in the admin Employers list (existing list shows all; the admin bulk approve sets `status:'Active'`). No new admin work needed.
- **Verify is a client stub** — signup already returns a token, so the verify screen is cosmetic (accept any code → dashboard). No server verify endpoint in Slice 1.

### 3.4 Employer portal aggregate — new `server/src/modules/employerPortal/` (mirrors `seekerPortal`)
- **`GET /api/me/employer`** — `requireAuth` + `requireRole('employer')`. Keyed off the JWT `sub` (the Employer `_id`). Returns:
  - `profile`: `{ id, name, email, industry, size, status, spoc, … }` (safe subset, no passwordHash).
  - `dashboard`: derived aggregate — the employer's **drives** (count/active — via the derived `activeDrives` participation already computed for employers, or `Slot.distinct(driveId, {employerId})`), an **upcoming interview-slot calendar** (their `Slot`s, future, grouped by day), and **placeholder shapes** for the pipeline widgets (`registrations: []`, `shortlist: []`, KPI zeros) that later slices fill. All derived-on-read; nothing faked-stored.

### 3.5 Seed — `server/src/seed/seed.ts`
Add a `passwordHash` to (at least) one seeded `Employer` set to `status:'Active'` with a known demo email + shared demo password (mirrors the jobseeker demo accounts), and ensure at least one seeded employer stays `status:'Pending'` so the pending-banner demos. Deterministic. Print the employer demo login alongside the admin/seeker logins.

## 4. Client changes

### 4.1 Roles + routing
- `client/src/auth/roles.ts` — extend the role union to include `'employer'` and `homePathFor('employer') → '/employer/dashboard'`.
- `client/src/auth/RoleRoute.tsx` — widen the `role` prop union to include `'employer'`.
- `client/src/App.tsx` — add the `/employer/*` routes (public: landing/signup/verify/login/mfa; gated: the app shell + dashboard under `RoleRoute role="employer"`). `LoginPage`'s post-login redirect already routes by role via `homePathFor` — employer logins land on `/employer/dashboard`.

### 4.2 Employer area — `client/src/pages/EmployerPortal/`
- **Landing** (`/employer`) — minimal: brand, a short hero, "Log in" / "Employer sign up".
- **Signup wizard** (`/employer/signup`) — 3 steps (Company → Contact → Billing+consent) with per-step validation; on submit posts to `employer-signup`, stores the returned token via AuthContext, → verify.
- **Verify stub** (`/employer/verify`) — email-OTP UI; any 6-digit code → `/employer/dashboard`.
- **Login** (`/employer/login`) — email+password → `/api/auth/login`; on success → `/employer/mfa`.
- **MFA stub** (`/employer/mfa`) — TOTP UI; any 6-digit code → `/employer/dashboard`.
- **App shell** (`EmployerShell`) — sidebar (dashboard, drives, registrations, candidates, interviews, kanban, reports, settings) + topbar (search, user menu → logout). Later-slice nav items → a `/employer/coming-soon/:slug` placeholder.
- **Dashboard** (`/employer/dashboard`) — greeting, "Pending review" banner when `status==='Pending'`, KPI grid + card widgets, fed by a `useEmployerPortal()` hook (`GET /api/me/employer`); pipeline widgets render empty states.

### 4.3 Styling — `client/src/styles/employer.css`
Port the employer prototype's CSS into a dedicated stylesheet, imported by the employer area (or scoped under an `.employer-app` root class) so it does not collide with the admin `theme.css` / jobseeker styles. Faithful class names from `Matchday_Employer.html`.

## 5. Testing (TDD)

- **Server:**
  - `auth.service`: an employer with a valid passwordHash logs in → `role:'employer'`; wrong password → 401; the admin/jobseeker branches still resolve first.
  - `employer-signup`: creates a Pending employer with a hashed password (not plaintext) + returns a token; duplicate email → 400; missing consent → 400.
  - `employerPortal`: `requireRole('employer')` gates `/api/me/employer` (admin/seeker token → 403); the aggregate returns the profile + dashboard shape (derived drives/slots + empty pipeline placeholders).
  - Fixtures via mongodb-memory-server.
- **Client:**
  - Signup wizard: step validation blocks advance on missing required fields; a complete submit posts the expected payload and stores the token.
  - Login role-routes an employer to `/employer/dashboard`; `RoleRoute role="employer"` redirects a non-employer to their home.
  - Dashboard renders from a mocked `/api/me/employer` (greeting + KPIs + empty pipeline states); the "Pending review" banner shows only when `status==='Pending'`.
- **E2E (isolated DB):** seed → employer demo login works; `/api/me/employer` returns the aggregate; a fresh `employer-signup` creates a Pending employer visible to the admin Employers list; verify/mfa stubs pass through.

## 6. File Structure (indicative)

```
server/src/
  models/Employer.ts                              # + passwordHash + onboarding fields
  modules/auth/auth.service.ts                    # + Employer login branch
  modules/auth/auth.controller.ts/.routes.ts      # + employer-signup route
  modules/auth/auth.schemas.ts                    # + employerSignupSchema
  modules/employerPortal/{service,controller,routes}.ts  # NEW — /api/me/employer
  app.ts                                          # mount employerPortal routes
  seed/seed.ts                                    # employer passwordHash + demo login
client/src/
  auth/roles.ts, auth/RoleRoute.tsx               # + 'employer'
  App.tsx                                         # + /employer/* routes
  pages/EmployerPortal/                           # NEW — landing, signup, verify, login, mfa, shell, dashboard, coming-soon
  pages/EmployerPortal/hooks/useEmployerPortal.ts # NEW
  styles/employer.css                             # NEW — ported employer stylesheet
```

## 7. Notes

- **Extends, not rebuilds** — the multi-role auth, `requireRole`, and `seekerPortal` pattern already exist; this is the third role wearing the same machinery.
- **Signup ≠ per-drive registration** — the company account (`Employer`, Slice 1) is distinct from `RegistrationRequest` (per-drive hiring, Slice 3); the design's two "registration" concepts are kept separate.
- **Pending is soft** — a Pending employer can log in and explore; approval (admin, existing) flips to Active and clears the banner. Not a hard gate in Slice 1 (a later slice may gate write actions on Active).
- **Stubs are honest** — verify/MFA screens are faithful UI but accept any code; no email/TOTP is claimed. Real OTP/TOTP is a deferred decision.
- **Derived-never-stored** holds for the dashboard aggregate (drives/slots derived; nothing faked-stored).
- **Isolation/DB:** built in an isolated worktree (`/Users/srinivasarao.kandula/code/matchday-employer1`, off `origin/main` @524fabf); seed RUN + smoke against an isolated DB in the E2E task — the shared local `matchday` DB is the user's parallel-work space and must not be touched.
