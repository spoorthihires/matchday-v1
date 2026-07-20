# Employer Portal — Slice 2 (Drive Marketplace + Detail) — MERN Slice Design

**Date:** 2026-07-20
**Status:** Approved design, pending implementation plan
**Depends on:** Slice 1 (employer auth + shell + dashboard + `/api/me/employer`), on branch `feat/employer-portal-slice1` (PR #18, not yet merged). This slice is **stacked** on that branch (`feat/employer-portal-slice2` off `feat/employer-portal-slice1`); its PR rebases onto `main` once #18 merges. Reuses the existing `Drive` model + the `employerPortal` module + `EmployerShell`.
**Context:** Second of ~10 employer-portal slices. The employer browses available MatchDay drives (a marketplace) and opens a drive's detail page. Read-only — the "Register for this drive" action leads into Slice 3 (per-drive registration wizard); "View slots" leads into Slice 4.

## 1. Goal & Scope

Employers browse Active/Published drives in a filterable marketplace and view a drive's full detail (facts, eligibility, evaluation flow), all inside the employer app shell, backed by new employer-scoped read endpoints.

### In scope
- **`GET /api/me/employer/drives`** (`requireRole('employer')`) — marketplace list: Active+Published drives, optional `q` + `domain` filters, employer projection with `employerReg`/`canRegister`.
- **`GET /api/me/employer/drives/:id`** — drive detail projection: facts + `eligibility` + `evaluation` (eval flow) + `streamId`; 404 for missing/Draft/Archived.
- **Client marketplace** (`/employer/drives`) — header + privacy chip + search + domain filter chips + result count + drive-card grid (Register CTA + View→detail).
- **Client detail** (`/employer/drives/:id`) — hero + facts panel + eligibility panel + eval-flow panel + Register CTA (→ Slice-3 placeholder) + View-slots (→ Slice-4 placeholder).
- **Nav/routing** — `/employer/drives` + `/employer/drives/:id` under `RoleRoute role="employer"` inside `EmployerShell`; the shell "Drives" item routes here.

### Out of scope (later slices)
- The registration wizard (Slice 3) — the Register CTA routes to the coming-soon placeholder.
- Slot booking (Slice 4) — the View-slots link routes to the coming-soon placeholder.
- Candidate data + the per-drive "already registered" badge — needs the `RegistrationRequest`↔employer link, which lands in Slice 3.
- The Invite-only invitation flow — `employerReg` only sets the CTA state here.
- Any write action; any change to admin/jobseeker or the admin `/api/drives`.

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Marketplace membership | All **Active + Published** drives; `visibility.employerReg` governs the Register CTA state (Open = register; Invite-only = request; Closed = no CTA), NOT membership |
| Detail depth | Facts + eligibility + evaluation flow (all from the existing `Drive`); no candidate data |
| Register / View-slots | CTAs route to the Slice-3 / Slice-4 coming-soon placeholders |
| Endpoints | New employer-scoped reads in the `employerPortal` module (do NOT open the admin `/api/drives` to employers) |
| Data | Derived-on-read projections; no new stored fields |

## 3. Server changes (extend `server/src/modules/employerPortal/`)

- **`listEmployerDrives(params: { q?, domain? })`** — `Drive.find({ status: { $in: ['Active','Published'] }, …filters })`. `q` → case-insensitive regex over name/domain/stream; `domain` → exact match. Map each to an employer projection:
  `{ id, name, domain, stream, month, primaryEventDate, eventDates, candCap, empCap, slotCap, frequency, eventDay, status, employerReg, canRegister }` where `employerReg = visibility.employerReg` and `canRegister = employerReg !== 'Closed'`. Reuse the `monthLabel`/primary-event-date logic from `drives.service` (export the helper or replicate the small function). No pagination needed initially (drive counts are small); a simple full list is fine (can window later).
- **`getEmployerDrive(id)`** — resolve the drive; 404 if invalid id, not found, or `status ∉ {Active, Published}` (Draft/Archived not exposed). Return the list projection **plus** `eligibility: { sources, branches, gradYears, expType }`, `evaluation: [{ key, enabled, config }]`, `streamId`.
- **Controllers + routes** — add to the employerPortal router (already mounted at `/api/me`, path-scoped `.use('/employer', requireAuth, requireRole('employer'))` from Slice 1): `GET /employer/drives`, `GET /employer/drives/:id`. Keep everything under the existing employer role gate. Error contract; zod-parse the query.
- No change to the admin `drives` module or `/api/drives`.

## 4. Client changes (`client/src/pages/EmployerPortal/`)

- **Types** (`client/src/types/employer.ts`, extend): `EmployerDriveListItem`, `EmployerDriveDetail` mirroring the server projections.
- **Hooks** (`hooks/useEmployerDrives.ts`): `useEmployerDrives({ q, domain })` → `GET /me/employer/drives?…` (queryKey `['employer-drives', q, domain]`); `useEmployerDrive(id)` → `GET /me/employer/drives/:id` (queryKey `['employer-drive', id]`). Both `enabled: !!token`.
- **`EmployerDrives.tsx`** (`/employer/drives`) — marketplace: `.mkt-head` (title + privacy chip), `.mkt-filters` (search input bound to `q`; domain filter chips bound to `domain` — all/data/ml/dataeng/genai mapped to the drive `domain` values), a result count, and a `.drive-grid` mapping drive cards (name, domain/stream chip, key facts, a Register button [→ placeholder], a View button [→ `/employer/drives/:id`]). Loading + empty states. Renders inside `EmployerShell`.
- **`EmployerDriveDetail.tsx`** (`/employer/drives/:id`) — via `useEmployerDrive(id)`: hero (`#ddName`, status pill), a facts panel (domain, stream, event dates, capacities, frequency, event day), an eligibility panel (sources/branches/gradYears/expType), an evaluation-flow panel (the enabled `evaluation` stages in order). Primary CTA "Register for this drive" → `/employer/coming-soon/register`; "View slots" → `/employer/coming-soon/slots`. Loading / error / 404 states. Renders inside `EmployerShell`.
- **Routing** (`App.tsx`): add `/employer/drives` and `/employer/drives/:id` under `RoleRoute role="employer"` wrapped in `EmployerShell`. Update `EmployerShell`'s "Drives" sidebar item to navigate to `/employer/drives` (currently → coming-soon) and mark it active on those routes.
- Port markup/classes from the prototype `Matchday_Employer.html` (`page-drives` 2776–2827 + the `renderDrives` card template; `page-drive-detail` 2827–2919). Reuse the scoped `.employer-app` styles; **watch-item:** if any inline `.err-msg` is rendered, toggle `.show-err` on its `.field` (per Slice 1's CSS gotcha).

## 5. Testing (TDD)

- **Server:** `listEmployerDrives` returns only Active+Published (a Draft/Archived drive is excluded); `q` and `domain` filters narrow correctly; the projection carries `employerReg`/`canRegister` (Closed → canRegister false). `getEmployerDrive` returns facts+eligibility+evaluation for an Active drive; 404 for a Draft drive + a nonexistent id. `requireRole('employer')` gates both routes (403 for an admin token, 401 no token). Fixtures via mongodb-memory-server.
- **Client:** marketplace renders cards from a mocked `useEmployerDrives`; typing in search / clicking a domain chip updates the query params; Register routes to the placeholder, View routes to `/employer/drives/:id`. Detail renders the three panels from a mocked `useEmployerDrive` and wires both CTAs; a 404 renders the not-found state. The "Drives" nav item navigates to `/employer/drives`.
- **E2E (isolated DB):** employer token → `GET /api/me/employer/drives` returns Active+Published only; `GET /api/me/employer/drives/:id` returns a detail projection; a Draft drive id → 404; admin token → 403.

## 6. File Structure (indicative)

```
server/src/modules/employerPortal/
  employerPortal.service.ts       # + listEmployerDrives, getEmployerDrive
  employerPortal.controller.ts    # + drives list/detail controllers
  employerPortal.routes.ts        # + GET /employer/drives, /employer/drives/:id
server/test/
  employer-drives.route.test.ts   # NEW
client/src/
  types/employer.ts               # + EmployerDriveListItem, EmployerDriveDetail
  pages/EmployerPortal/hooks/useEmployerDrives.ts   # NEW
  pages/EmployerPortal/EmployerDrives.tsx           # NEW
  pages/EmployerPortal/EmployerDriveDetail.tsx      # NEW
  pages/EmployerPortal/EmployerShell.tsx            # Drives nav → /employer/drives
  App.tsx                                           # + 2 routes
client/src/test/
  EmployerDrives.test.tsx, EmployerDriveDetail.test.tsx   # NEW
```

## 7. Notes

- **Employer-scoped reads, not admin reuse** — the admin `/api/drives` stays admin-gated; employers get their own projection (no admin-only fields, `Draft`/`Archived` hidden), so opening admin data to a new role is never a risk.
- **Derived-never-stored** — projections computed on read; no new fields.
- **`employerReg` drives the CTA, not membership** — with the seed defaulting to Invite-only, the marketplace still populates (all Active/Published), and the CTA reflects Open/Invite-only/Closed.
- **Stacked slice** — built on `feat/employer-portal-slice1`; if #18 lands with changes, rebase before merge.
- **Isolation/DB** — isolated worktree `/Users/srinivasarao.kandula/code/matchday-employer2`; seed RUN + smoke against an isolated DB in the E2E task; shared `matchday` untouched.
