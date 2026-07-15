# MatchDay Admin (MERN)

Command Center vertical slice — see `docs/superpowers/specs/2026-07-14-matchday-command-center-design.md`.

## Prerequisites
- Node 20+
- A local MongoDB running at `mongodb://localhost:27017`

## Setup
```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run seed        # seeds the DB, prints the admin login
npm run dev         # server :4000 + client :5173
```

Sign in with the admin credentials printed by the seed (`admin@matchday.dev` / `Password123!`).

## Features
- **Drives** — List with filters, sort, and pagination; bulk archive/unarchive; create/edit via 6-step wizard. Available at `/drives`.
- **Institutes** — List with overview KPIs and derived funnel; filter, sort, and pagination; bulk approve/disable; create/edit via modal. Detail page with tabs: Overview, Candidates, Funnel, Performance, Ownership, Audit. Available at `/institutes`.
- **Jobseekers** — Candidate list with view lenses and filters, add/edit modal, and block capability. Bulk import wizard (5 steps: CSV/XLSX upload, duplicate detection, validation, summary, confirmation) with automatic deduplication. Available at `/jobseekers`.
- **Employers** — List with performance stats, filters, sort, and pagination; bulk approve/disable; create/edit via modal. Available at `/employers`. Registration approvals master-detail queue with approve/reject/request-changes/move-drive/change-slot actions at `/employers/approvals`.

## Tests
```bash
npm test            # server (vitest+supertest) and client (vitest+RTL)
```
