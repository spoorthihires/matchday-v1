# MatchDay Admin (MERN)

Hiringhood **MatchDay** — a hiring-drive orchestration console, built as a MERN app (MongoDB · Express · React · Node, TypeScript strict, ESM). Ported module-by-module from the static prototype `matchday-admin-app_23.html`.

Two roles share one login:
- **Admins** run the full console (drives, institutes, jobseekers, employers, slots, templates, evaluations, streams).
- **Jobseekers** get a read-only self-tracking **portal** at `/portal`.

## Prerequisites
- Node 20+
- A local MongoDB running at `mongodb://localhost:27017`

## Setup
```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run seed        # seeds the DB, prints the admin + demo jobseeker logins
npm run dev         # server :4000 + client :5173
```

`npm run seed` prints the credentials it creates:
- **Admin** → `admin@matchday.dev` / `Password123!` (lands on the console)
- **Jobseeker** → `seeker.selected@matchday.dev` or `seeker.applied@matchday.dev` / `Seeker123!` (lands on `/portal`)

## Features

### Admin console
- **Command Center** (`/`) — live dashboard driven by MongoDB aggregation (funnels, KPIs, readiness, schedule, leaderboards).
- **Drives** (`/drives`) — list with filters/sort/pagination, bulk archive, create/edit via a 6-step wizard.
- **Institutes** (`/institutes`, `/institutes/:id`) — list with overview KPIs and a derived funnel; bulk approve/disable; create/edit modal. Detail tabs: Overview, Candidates, **Drives** (real institute↔drive assignments via diff-based assign modal + bulk assign), Funnel, Performance, Ownership, Audit.
- **Jobseekers** (`/jobseekers`) — candidate list with view lenses and filters, add/edit modal, block; 5-step CSV/XLSX bulk-import wizard with dedup and validation.
- **Employers** (`/employers`, `/employers/approvals`) — list with performance stats; bulk approve/disable; create/edit modal; a registration-approvals master-detail queue (approve / reject / request-changes / move-drive / change-slot).
- **Slots** (`/slots`) — Month/Week/Day calendar with session CRUD (capacity, booked/held, meeting links, reschedule, no-shows).
- **Templates** (`/templates`) — reusable drive-configuration templates with a six-tab editor and a version-history ledger (create / clone / restore).
- **Evaluations** — Management (`/evaluations`) for evaluation configs (create / edit / duplicate / enable-toggle) and a read-only live **Monitoring** dashboard (`/evaluations/monitor`) deterministically derived from real candidate data.
- **Streams** — Configuration (`/streams`, versioned stream definitions) and a **Selection Rules** settings page (`/streams/rules`).

### Jobseeker portal
- **`/portal`** — after a jobseeker signs in, a self-tracking view (its own minimal shell, no admin sidebar): a journey pipeline (Applied → … → Joined) with match-readiness, status cards (evaluation, offer), and the drives they're eligible for, each tagged **Selected / In progress / Closed**. All derived read-only from existing data; the seeker can only see their own record.

## Architecture
- **Server** (`server/`) — Express + Mongoose + Zod. Modules live under `server/src/modules/<name>/` (routes → controller → service). JWT auth (`{ sub, role }`); `requireAuth` authenticates, `requireRole('admin' | 'jobseeker')` authorizes. Every admin API is gated to `admin`; `GET /api/me/portal` is jobseeker-only.
- **Client** (`client/`) — React 18 + Vite + react-router-dom 6 + TanStack Query. Login is role-routed (`RoleRoute`): admins land on the console, jobseekers on `/portal`. Styling is a faithful port of the prototype's CSS in `client/src/styles/theme.css` (real prototype class names).
- Design specs and implementation plans live under `docs/superpowers/{specs,plans}/`.

## Tests
```bash
npm test            # server (vitest + supertest + mongodb-memory-server) and client (vitest + RTL)
npm run test:server
npm run test:client
```
