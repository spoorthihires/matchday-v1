# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Project

Hiringhood **MatchDay** — a hiring-drive orchestration console, ported module-by-module from the static prototype `matchday-admin-app_23.html` into a MERN app. Two roles: **admin** (full console) and **jobseeker** (read-only self-tracking portal at `/portal`).

Stack: TypeScript (strict, ESM) · Express 4 + Mongoose 8 + Zod · React 18 + Vite + react-router-dom 6 + TanStack Query 5. npm workspaces: `server/` and `client/`.

## Commands

```bash
npm run dev            # server :4000 + client :5173 (concurrently)
npm run seed           # deterministic seed; prints admin + demo jobseeker logins
npm test               # server tests, then client tests
npm run test:server    # vitest + supertest + mongodb-memory-server
npm run test:client    # vitest + @testing-library/react (jsdom)
npm run build -w server   # tsc
npm run build -w client   # tsc -b && vite build  (emits to client/dist — which is NOT git-ignored)
```

For a fast client typecheck without emitting into the tracked `client/dist`, use `cd client && npx tsc -b` instead of the full build.

Local MongoDB at `mongodb://localhost:27017/matchday`. Seed logins: admin `admin@matchday.dev` / `Password123!`; jobseekers `seeker.selected@matchday.dev` & `seeker.applied@matchday.dev` / `Seeker123!`.

## Architecture

**Server** (`server/src/`):
- `modules/<name>/` each hold `*.routes.ts` → `*.controller.ts` → `*.service.ts` (some use `routes.ts`/`controller.ts`/`service.ts`). Controllers stay thin; services hold logic; Zod schemas validate at the controller boundary.
- `models/` — Mongoose models. `middleware/` — `requireAuth` (verifies JWT, sets `req.userId`/`req.userRole`), `requireRole(...roles)` (authorizes), `asyncHandler`, `errorHandler`.
- `app.ts` mounts every module under `/api/*`. `seed/seed.ts` resets and seeds deterministically (no `Math.random`/`Date.now` — uses a seeded RNG).
- Auth: `POST /api/auth/login` tries the admin `User` then a `Jobseeker` with a `passwordHash`, issuing a `{ sub, role }` JWT. **Every admin router is gated with `requireRole('admin')`; `/api/me/portal` is `requireRole('jobseeker')`.** Keep that boundary intact when adding routes.

**Client** (`client/src/`):
- `pages/<Module>/`, `components/` (admin `AppShell`/`Sidebar`/`Topbar`), `hooks/`, `types/`, `api/client.ts` (`apiFetch<T>(path, { token })`, BASE `/api`), `auth/` (`AuthContext`, `RoleRoute`, `LoginPage`).
- Routing is role-gated via `RoleRoute role="admin" | "jobseeker"`; login navigates by role (`homePathFor` in `auth/roles.ts`). The jobseeker portal (`pages/Portal/`) has its own shell — do NOT reuse the admin `Sidebar`/`AppShell` there.
- Styling: faithful port of the prototype CSS in `styles/theme.css`, using the prototype's real class names (`card`, `btn`, `badge`, `st-active`, …).

## API ↔ route map

`/api/auth`, `/api/me` (portal, jobseeker-only), `/api/dashboard`, `/api/drives`, `/api/employers`, `/api/institutes` (+ nested `/:id/drives`, `/assign-drives`), `/api/jobseekers`, `/api/registrations`, `/api/slots`, `/api/templates`, `/api/eval-configs`, `/api/eval-monitor`, `/api/streams`, `/api/stream-rules`.

Client routes: `/login`, `/portal` (jobseeker), and admin routes `/` (Command Center), `/drives`, `/institutes[/:id]`, `/jobseekers`, `/employers[/approvals]`, `/slots`, `/templates`, `/evaluations[/monitor]`, `/streams[/rules]`.

## Conventions & gotchas

- **ESM everywhere**: relative TS imports use a `.js` specifier (e.g. `'./foo.js'`), even for `.ts` files.
- **Errors**: `throw new HttpError(status, message, code)`; the contract is `{ error: { message, code } }`. Zod parse failures auto-map to `400 { code: 'validation' }`.
- **Zod is the requiredness source of truth** (drafts relaxed, publish strict) — Mongoose schemas are permissive at the persistence layer.
- **Derive, don't fake stats**: display metrics (funnels, match-readiness, assigned-drive counts, portal drives) are derived from real documents, not stored. Candidate funnels are **cumulative** ("reached at least stage X"). Reuse the shared helpers in `jobseekers.service.ts` (`matchReadinessPct`, `offerStatus`, `evaluationLabel`, `codeFor`) rather than reimplementing.
- **Version-ledger modules** (Templates, Streams): editor-save bumps the minor version + logs an entry; status-only PATCH does not bump; restore is ledger-only (does not roll back content).
- **Mongoose `.lean()` typing**: `.lean()` can mis-infer nested schema fields (e.g. `eligibility` as `| null`, array-of-subdoc fields). If `tsc` complains, type the call with an explicit interface (`.lean<Shape[]>()`) rather than reaching for `any` — see `seekerPortal.service.ts` for the pattern.
- Tests: server uses the `setupTestDb`/`clearDb`/`teardownTestDb` helpers and mints tokens with `signToken({ sub, role })`; client stubs `global.fetch` and wraps in `QueryClientProvider` + `MemoryRouter` + `AuthProvider`.

## Docs & process

Design specs live in `docs/superpowers/specs/`, implementation plans in `docs/superpowers/plans/` — one vertical slice per module (brainstorm → spec → plan → TDD build → review → merge). Follow the existing module as a template when adding a new one.
