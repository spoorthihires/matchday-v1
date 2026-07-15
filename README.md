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

## Tests
```bash
npm test            # server (vitest+supertest) and client (vitest+RTL)
```
