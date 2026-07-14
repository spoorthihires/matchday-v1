# MatchDay Admin — MERN Vertical Slice: Command Center

**Date:** 2026-07-14
**Status:** Approved design, pending implementation plan
**Source prototype:** `matchday-admin-app_23.html` (Hiringhood MatchDay Admin)

## 1. Goal & Scope

Turn the static HTML prototype into a real MERN (MongoDB, Express, React, Node) application, built as an **MVP vertical slice**. This first slice delivers one complete, production-quality path end-to-end:

> **JWT login → protected Command Center dashboard**, where every figure on the dashboard is computed **live** by MongoDB aggregation over real seeded collections.

### In scope
- Real email/password login with JWT and protected routes.
- The full Command Center dashboard, faithful to the prototype's look, driven by live-aggregated data:
  - Readiness hero (score, verdict, countdown, four health pillars, attention alert)
  - 14 KPIs with 30-day deltas (table + cards views)
  - Three conversion funnels (Supply, Demand, Hiring)
  - Schedule & capacity (month calendar + upcoming events + slot-utilization donut)
  - Institute and Employer leaderboards
- Six lean, related MongoDB collections with a deterministic seed script.
- The app shell (sidebar + topbar) faithful to the prototype.

### Out of scope (deferred to later slices)
- All other modules: Drives, Templates, Streams, Institutes (list/detail), Jobseekers, Evaluations (configs + monitoring), Employers, Approvals, Slots calendar management, Reports, Audit Trail, Settings. Their sidebar entries render a lightweight "Coming soon" placeholder so the shell feels complete.
- MFA (2FA) and password-reset: ported **visually** from the prototype but non-functional stubs in this slice.
- Real-time updates, exports, and role-based authorization beyond a single admin role.

## 2. Tech Decisions (confirmed)

| Decision | Choice |
|---|---|
| Primary goal | MVP vertical slice |
| Anchor module | Command Center dashboard |
| Dashboard data backing | Live aggregation over lean real collections |
| UI approach | Faithful port of the prototype's custom design |
| Auth scope | JWT login only (MFA/reset = visual stubs) |
| Language | TypeScript (client + server) |
| MongoDB | Local `mongod` (`mongodb://localhost:27017`) |
| Client data fetching | TanStack Query (React Query) |
| Repo layout | Monorepo via npm workspaces |

## 3. Architecture

Monorepo with npm workspaces:

```
matchday/
  matchday-admin-app_23.html   # kept as design reference
  package.json                 # root scripts: dev / seed / test (via concurrently)
  docs/superpowers/specs/      # this spec
  server/                      # Express + TypeScript + Mongoose
    src/
      index.ts                 # bootstrap + middleware wiring
      config/env.ts            # typed env loader (zod)
      db/connect.ts
      models/                  # User, Drive, Institute, Employer, Jobseeker, Slot
      modules/
        auth/                  # auth.routes.ts, auth.controller.ts, auth.service.ts
        dashboard/             # dashboard.routes.ts, dashboard.controller.ts, dashboard.service.ts
      middleware/              # requireAuth (JWT), errorHandler, asyncHandler
      seed/seed.ts             # deterministic seed of all collections
      types/dashboard.ts       # DashboardOverview DTO — source of truth
    tsconfig.json
    package.json
  client/                      # Vite + React + TypeScript + React Router + TanStack Query
    src/
      main.tsx, App.tsx
      api/client.ts            # fetch wrapper (adds JWT, handles 401)
      auth/                    # AuthContext, LoginPage, ProtectedRoute, MfaStub, ForgotStub
      pages/Dashboard/         # index + ReadinessHero, KpiSection, FunnelsSection,
                               #   ScheduleSection, LeaderboardsSection
      components/              # AppShell (Sidebar + Topbar), ComingSoon, shared bits
      hooks/                   # useDashboardOverview, useLogin
      styles/                  # theme.css + component CSS extracted from prototype
      types/dashboard.ts       # mirrors server DTO
    index.html
    vite.config.ts             # dev proxy /api -> http://localhost:4000
    package.json
```

Each unit has one clear purpose and a well-defined interface: models own persistence, services own business/aggregation logic, controllers own HTTP shape, React section components own one dashboard region.

## 4. Data Model

Six collections. Each metric has **exactly one source collection** to prevent drift.

### User
`{ _id, email (unique), passwordHash, name, role: 'admin', createdAt }` — authentication only.

### Institute
`{ _id, name, city, type, status: 'Active'|'Pending'|'Disabled', createdAt }`
Sources: Institute Participation KPI (count active).

### Employer
`{ _id, name, industry, status: 'Active'|'Pending'|'Disabled', offersExtended: number, slotsFillRate: number (0–100), createdAt }`
Sources: Employer Registrations KPI, Employer leaderboard, demand pillar.

### Drive
`{ _id, name, domain, stream, status: 'Active'|'Published'|'Draft'|'Archived', eventDate: Date, candCap, empCap, slotCap, createdAt }`
Sources: Active Drives KPI, Upcoming Wednesdays, Demand funnel (drives created), Schedule events.

### Jobseeker (funnel engine)
`{ _id, name, instituteId: ObjectId→Institute, branch, gradYear, cgpa, source, profileCompleted: boolean, evaluationStatus: 'na'|'pending'|'completed', stage: 'Applied'|'Screened'|'Evaluated'|'MatchReady'|'Shortlisted'|'Offer'|'Joined'|'DroppedOff', createdAt }`
Single source for: Jobseekers Added, Profiles Completed, Evaluations Completed/Pending, Match-Ready, Shortlisted, Offers Sent, Joined, Drop-off Rate; the Supply funnel, the Hiring funnel, and the Institute leaderboard (match-ready supplied + conversion).

**Refinement:** evaluation completion is a field on Jobseeker, not a separate collection, so evaluation KPIs cannot drift out of sync with the candidate funnel. The standalone Evaluations module (MCQ/Coding/TARA configs + monitoring) is a later slice.

### Slot
`{ _id, driveId: ObjectId→Drive, employerId: ObjectId→Employer|null, date: Date, start, end, status: 'booked'|'held'|'available', createdAt }`
Sources: Slots Booked/Available KPIs, slot-utilization donut, Demand funnel (slots opened/booked).

### 30-day deltas
Seed spreads `createdAt` across ~60 days. Count-based deltas are computed as `count(last 30d)` vs `count(prior 30d)`. Ratio metrics compute current-window ratio vs prior-window ratio. No hard-coded deltas.

## 5. API

Base path `/api`. All responses JSON. Errors: `{ error: { message, code } }`.

### `POST /api/auth/login`
Body (zod-validated): `{ email, password }`. Verifies bcrypt hash; returns `{ token, user: { id, name, email, role } }`. 400 on invalid body, 401 on bad credentials.

### `GET /api/dashboard/overview` (protected — requires `Authorization: Bearer <jwt>`)
Returns a single `DashboardOverview`:
```ts
interface DashboardOverview {
  readiness: {
    score: number;                 // 0–100 weighted
    verdict: { label: string; tone: 'ontrack'|'at-risk'|'off-track' };
    nextMatchDay: string;          // ISO date of next Wednesday event
    countdown: { days: number; hours: number };
    pillars: { key: 'supply'|'demand'|'slots'|'evaluations';
               pct: number; caption: string }[];
    attention: { message: string } | null;
  };
  kpis: { key: string; label: string; group: string;
          value: number; display: string;
          delta: { value: number; direction: 'up'|'down'|'flat'; display: string } }[];
  funnels: {
    supply: FunnelStep[];  // Jobseekers → Profiles → Evaluations → Match-Ready
    demand: FunnelStep[];  // Employers → Drives → Slots Opened → Slots Booked
    hiring: FunnelStep[];  // Match-Ready → Shortlisted → Offers → Joined
  };
  schedule: {
    monthLabel: string;
    calendar: { day: number; inMonth: boolean; isWed: boolean;
                isToday: boolean; isNextMatchDay: boolean }[];
    events: { date: string; title: string;
              employers: number; slots: number; candidates: number;
              prepPct: number; status: 'prep'|'open' }[];
  };
  // total = booked + held + available; utilizedPct = round(booked / total * 100)
  slotUtilization: { booked: number; held: number; available: number;
                     total: number; utilizedPct: number };
  leaderboards: {
    institutes: { rank: number; name: string; city: string;
                  ready: number; conversionPct: number }[];
    employers:  { rank: number; name: string; industry: string;
                  offers: number; fillRatePct: number }[];
  };
}
interface FunnelStep { name: string; value: number; pct: number | null; }
```
Assembled by `dashboardService.getOverview()` running MongoDB aggregation pipelines (counts, `$group`, `$facet`) plus the readiness computation. One endpoint = one fast dashboard load; can be split later.

## 6. Readiness Score (formula)

Pillars (each 0–100):
- **Supply** = `matchReady / max(supplyTarget, 1) * 100`, capped 100. `supplyTarget` = configured target of match-ready candidates for the cycle.
- **Demand** = `activeEmployers / max(demandTarget, 1) * 100`, capped 100.
- **Slots** = `booked / max(totalCapacity, 1) * 100`.
- **Evaluations** = `completed / max(completed + pending, 1) * 100`.

**Readiness = round(0.30·Supply + 0.25·Demand + 0.20·Slots + 0.25·Evaluations)**.

Verdict: `>= 80` → On track (`ontrack`); `60–79` → Needs a push (`at-risk`); `< 60` → Off track (`off-track`). Targets and weights live in `config/env.ts` / a small `dashboard.config.ts` constant so they are tunable.

## 7. Data Flow

- **Login:** `LoginPage` → `useLogin` mutation → `POST /api/auth/login` → store JWT (in-memory + `localStorage`) via `AuthContext` → redirect to `/`.
- **Guarding:** `ProtectedRoute` reads `AuthContext`; unauthenticated → `/login`. `api/client.ts` attaches the bearer token and, on any `401`, clears auth and redirects to `/login`.
- **Dashboard:** `Dashboard` page → `useDashboardOverview()` (TanStack Query) → `GET /api/dashboard/overview` → each section component renders from the typed DTO with skeleton/loading and error states.

## 8. UI Port

- Extract the prototype `<style>` block into CSS files under `client/src/styles/`, preserving class names and CSS variables so components map 1:1 to prototype markup.
- Load **Inter** + **JetBrains Mono** (Google Fonts) and **Tabler Icons** webfont (npm `@tabler/icons-webfont` or the pinned CDN link the prototype uses: `@tabler/icons-webfont@2.47.0`).
- `AppShell` reproduces the sidebar nav (Command Center active; other items → `ComingSoon` placeholder) and the topbar with breadcrumb/title, search, and user chip.

## 9. Error Handling

- **Server:** `asyncHandler` wraps route handlers; central `errorHandler` emits `{ error: { message, code } }`; zod validation on request bodies → 400; missing/invalid JWT → 401; unknown route → 404; unexpected → 500 without leaking internals.
- **Client:** TanStack Query `isLoading` / `isError` states per query; login surfaces credential errors inline; global `401` handler redirects to `/login`; a top-level React error boundary catches render failures.

## 10. Testing (TDD)

- **Server:** Vitest + supertest + `mongodb-memory-server` (isolated DB per suite).
  - Unit: `dashboardService.getOverview()` against a known seeded fixture — assert each KPI value, each funnel step, slot utilization, both leaderboards, and the readiness score/verdict.
  - Integration: `POST /login` (success, wrong password → 401, malformed body → 400); `GET /overview` (no token → 401, valid token → 200 with correct DTO shape).
- **Client:** Vitest + React Testing Library.
  - `LoginPage` — submits credentials, shows error on failure, redirects on success (mocked API).
  - One dashboard section (e.g. `KpiSection`) renders values from a mocked DTO.

## 11. Config & Run (local mongod)

- **Server `.env`:** `PORT=4000`, `MONGODB_URI=mongodb://localhost:27017/matchday`, `JWT_SECRET`, `JWT_EXPIRES=1d`, `CLIENT_ORIGIN=http://localhost:5173`.
- **Client `.env`:** `VITE_API_URL=/api` (Vite proxies `/api` → `http://localhost:4000` in dev; CORS configured for prod).
- **Root scripts:** `npm run dev` (client + server via concurrently), `npm run seed` (seeds all collections; prints the seeded admin email/password), `npm test` (runs both test suites).
- **Prerequisite:** a local `mongod` running before `npm run seed` / `npm run dev`.

## 12. Seed Data (deterministic)

A fixed-seed PRNG (no `Math.random`) generates volumes roughly matching the prototype so the dashboard reads believably: ~21 institutes, ~48 employers, ~12 active drives (3 upcoming Wednesday events in the current cycle), ~1,284 jobseekers with a realistic stage distribution (≈968 profiles complete, ≈742 evaluations complete, ≈531 match-ready, ≈196 shortlisted, ≈84 offers, ≈41 joined), and ~360 slots (≈288 booked / ≈36 held / ≈72 available) for the next MatchDay. One admin `User`. `createdAt` values spread across ~60 days for genuine 30-day deltas.

## 13. Future Slices (for context, not this build)

Drives (list + create wizard) → Institutes (list + detail funnels) → Employers + Approvals → Jobseekers + CSV import wizard → Evaluations (configs + monitoring) → Streams → Slots calendar → Reports/Audit/Settings. Each reuses the shell, auth, and data foundation established here.
