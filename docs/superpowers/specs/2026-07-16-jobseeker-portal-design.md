# Jobseeker Login & Self-Tracking Portal — MERN Slice Design

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Depends on:** the nine prior slices — reuses auth (JWT/bcrypt), the API client, theme.css, and all conventions. Introduces the **first non-admin role** in the app.
**Source prototype:** none — this is a new capability (the prototype is admin-only). Visual language reuses existing `theme.css` classes.

## 1. Goal & Scope

Let a **jobseeker log in** and **track their own status** — where they are in the hiring journey and which drives they qualify for. All content is **derived read-only from existing data**; no new "application" entity is introduced.

### In scope
- **Jobseeker authentication**: email + password against the existing `Jobseeker` records, issuing a `role: 'jobseeker'` JWT via the same `/api/auth/login` endpoint (role-routed on the client).
- **Role-based access control**: a `requireRole` middleware; existing admin routers gated to `admin`, the portal gated to `jobseeker`. A seeker token cannot read admin data.
- **Portal endpoint** `GET /api/me/portal`: aggregates the logged-in seeker's profile, journey, and eligible drives in one read.
- **Seeker portal page** (`/portal`): a minimal seeker-only shell (brand + name + logout — **not** the admin sidebar) showing:
  - **My Journey** pipeline (Applied → … → Joined) with the current stage highlighted + match-readiness %.
  - **Status cards**: evaluation status, offer status, match-readiness.
  - **My Drives**: the Active/Published drives the seeker is eligible for, each tagged **Selected** / **In progress** / **Closed** based on their overall stage.
- **Seed**: a shared demo password on seeded jobseekers plus two fixed named demo accounts (one "Selected", one "Applied"), with credentials printed on seed.

### Out of scope (deferred)
- A real **Application** entity (per-drive apply/shortlist/reject status). The single global `stage` applies to all of a seeker's eligible drives — this is an accepted limitation of the derive-only approach.
- **Self-service apply** (a seeker creating applications by browsing drives).
- Seeker **signup / password reset / MFA** (the existing `ForgotStub`/`MfaStub` remain admin-only stubs; seekers get seeded credentials only).
- Editing the seeker's own profile.

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Job model | **Derive from existing data** — no Application entity |
| Seeker auth | **Email + password on `Jobseeker`** (`passwordHash` field), reuse JWT/bcrypt, `role: 'jobseeker'` |
| Login entry | **One login, role-routed** — same form + `/api/auth/login`; server tries admin `User`, then `Jobseeker` |
| Portal content | **Journey + eligible drives, stage-tagged** (Selected / In progress / Closed) |
| Admin data protection | Add `requireRole('admin')` to existing admin routers (a seeker token → 403) |
| Employer per drive | Derived via `Slot.employerId` → `Employer.name`; drives with no slots show "—" |
| Eligible-drive statuses | Only `Active` + `Published` drives are shown (Draft/Archived excluded) |

## 3. Schema change — `Jobseeker`

Add one optional field (all other fields unchanged):

```ts
passwordHash: { type: String, default: undefined },   // present ⇒ seeker can log in
```

Seekers **without** a `passwordHash` simply cannot log in — no migration needed for existing records; the seed backfills demo accounts.

## 4. Auth (server)

### `auth.service.ts` — unified `login(email, password)`
1. Find admin `User` by email → if match, return `{ token, user: { id, name, email, role: 'admin' } }` (unchanged).
2. Else find `Jobseeker` by email **with a `passwordHash`** → verify → return `{ token, user: { id, name, email, role: 'jobseeker' } }`.
3. Else `401 Invalid credentials`.

JWT payload stays `{ sub, role }`; `sub` is the jobseeker's `_id` for seeker tokens. No controller/route change — same `POST /api/auth/login`.

### `requireRole` middleware (new)
```ts
requireRole(...roles: string[]) // 403 'Forbidden' if req.userRole ∉ roles
```
Runs **after** `requireAuth` (which populates `req.userRole`).

## 5. Access control

- **Admin routers** (`drives`, `institutes`, `jobseekers`, `employers`, `slots`, `templates`, `evalConfigs`, `evalMonitor`, `streams`, `streamRules`, `registrations`, `dashboard`): add `router.use(requireRole('admin'))` immediately after the existing `router.use(requireAuth)`. `/api/auth` and `/api/health` stay open.
- **Portal router** (`/api/me`): `router.use(requireAuth); router.use(requireRole('jobseeker'))`.

This is a one-line change per admin router; it is the security boundary that keeps candidate data out of seeker tokens.

## 6. Portal endpoint — `GET /api/me/portal`

Guarded by `requireAuth` + `requireRole('jobseeker')`. Keyed off `req.userId` (the seeker's id). New module `modules/seekerPortal/` (service + controller + routes), mounted at `/api/me`.

Response shape:
```ts
{
  profile: {
    id: string; code: string;          // codeFor(id) → 'C-XXXXXX'
    name: string; email: string;
    institute: string;                 // Institute.name (or '—')
    branch: string; gradYear: number; cgpa: number;
  },
  journey: {
    stage: JobseekerStage;
    stages: JobseekerStage[];           // JOBSEEKER_STAGES, ordered
    matchReadinessPct: number;          // matchReadinessPct(stage)
    evaluationLabel: string;            // evaluationLabel(evaluationStatus)
    offerStatus: string;                // offerStatus(stage)
  },
  drives: Array<{
    id: string; name: string; domain: string;
    employers: string[];               // distinct Employer.name via Slots (may be [])
    eventDates: string[];              // ISO dates from Drive.eventDates
    statusTag: 'Selected' | 'In progress' | 'Closed';
  }>
}
```

**Reuses** `matchReadinessPct`, `offerStatus`, `evaluationLabel`, `codeFor` from `jobseekers.service.ts` (exported already).

### Eligibility derivation (service)
A Drive is eligible for the seeker when **all** hold:
- `drive.status ∈ { 'Active', 'Published' }`, and
- `eligibility.branches` is empty **or** contains `seeker.branch`, and
- `eligibility.gradYears` is empty **or** contains `seeker.gradYear`, and
- `eligibility.sources` is empty **or** contains `seeker.source`.

(`expType` is ignored — all seekers are freshers in this dataset.)

### Status tag (per eligible drive — same for all, from the global stage)
- `Shortlisted | Offer | Joined` → **Selected**
- `Applied | Screened | Evaluated | MatchReady` → **In progress**
- `DroppedOff` → **Closed**

### Employers per drive
Distinct non-null `Slot.employerId` for the drive → `Employer.name`. No slots ⇒ empty list ⇒ rendered as "—".

## 7. Client

### Routing & role gating
- **`RoleRoute`** (extends `ProtectedRoute` with a `role` prop): no token → `/login`; token but wrong role → redirect (admin ↦ `/`, jobseeker ↦ `/portal`).
- Existing admin routes wrapped in `<RoleRoute role="admin">`; new `/portal` in `<RoleRoute role="jobseeker">`.
- `AuthContext.login()` **returns the user** so `LoginPage.onSubmit` navigates by role (`admin → '/'`, `jobseeker → '/portal'`).
- `<Route path="/*">` catch-all currently maps to the admin Dashboard — it becomes `<RoleRoute role="admin">`, so a seeker hitting an unknown/admin path bounces to `/portal`.

### Login page
- Copy made role-neutral ("Sign in to MatchDay" / "Use your credentials"); remove the hardcoded admin-email prefill or keep it as a harmless convenience (prefill cleared). Keep the existing markup/styles.

### Portal page (`pages/Portal/`)
- **`PortalShell`**: a lightweight header (brand glyph + "MatchDay" + seeker name + Logout button) and a content container. Reuses theme.css tokens; does **not** import the admin `Sidebar`/`Topbar`.
- **`usePortal`** hook: react-query `GET /api/me/portal`.
- **Journey pipeline**: the ordered `stages` rendered as steps, current stage highlighted, `DroppedOff` shown as a terminal/closed state when applicable; match-readiness % shown.
- **Status cards**: evaluation label, offer status, match-readiness.
- **My Drives list**: card/row per drive — name, domain, employer name(s) or "—", event dates, status tag badge. Empty state when the seeker qualifies for no drives.

## 8. Seed

- Backfill a **shared demo `passwordHash`** (e.g. password `Seeker123!`) on all seeded jobseekers so any known email works.
- Insert **two fixed demo accounts** with deterministic emails and stages that exercise both tags:
  - `seeker.selected@matchday.dev` — stage `Offer` (⇒ **Selected**), profile complete, eval completed, a branch/gradYear/source that matches seeded drives.
  - `seeker.applied@matchday.dev` — stage `Applied` (⇒ **In progress**).
- Print their credentials next to the existing `Admin login →` line.

## 9. Testing

Server unit/integration tests (existing Vitest + in-memory Mongo helpers):
- **Jobseeker login**: valid seeker email+password → `role: 'jobseeker'` token; wrong password → 401; jobseeker without `passwordHash` → 401; admin still logs in as `admin`.
- **`requireRole`**: seeker token → 403 on an admin route (e.g. `GET /api/jobseekers`); admin token → 403 on `GET /api/me/portal`; jobseeker token → 200 on the portal.
- **Portal derivation**: eligibility matching (branch/gradYear/source incl. empty-constraint cases), status-tag mapping across stages, employer derivation via slots, and profile/journey shape.

## 10. File-level impact

**Server**
- `models/Jobseeker.ts` — add `passwordHash`.
- `middleware/requireRole.ts` — new.
- `modules/auth/auth.service.ts` — unified login.
- `modules/seekerPortal/{service,controller,routes}.ts` — new.
- `app.ts` — mount `/api/me`; add `requireRole('admin')` to admin routers (in each router file).
- `seed/seed.ts` — demo passwords + two demo accounts + printed creds.

**Client**
- `auth/AuthContext.tsx` — `login()` returns user.
- `auth/RoleRoute.tsx` — new (or extend `ProtectedRoute`).
- `auth/LoginPage.tsx` — role-neutral copy + role-based post-login navigation.
- `App.tsx` — role-gate routes + `/portal`.
- `pages/Portal/` — `index.tsx`, `PortalShell.tsx`, journey/cards/drives components.
- `hooks/usePortal.ts` — new.
- `types/` + `api` — portal response types.
```

**No changes** to any admin page component, and no data migration (new field is optional).
