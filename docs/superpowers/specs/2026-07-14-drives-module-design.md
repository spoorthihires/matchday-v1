# Drives Module — MERN Slice Design

**Date:** 2026-07-14
**Status:** Approved design, pending implementation plan
**Depends on:** the Command Center slice (`2026-07-14-matchday-command-center-design.md`) — reuses auth, app shell, DTO/error conventions, and the `Drive` collection.
**Source prototype:** `matchday-admin-app_23.html` — Drive Management page (list) + the `#wizard` create-drive overlay.

## 1. Goal & Scope

The second vertical slice: a **full, faithful Drives module** — create, list, edit, and manage hiring drives — replacing the "Coming soon" placeholder at the `Drives` nav item. This is the core entity the rest of the platform references, so building it makes the Command Center's drive/event numbers backed by real CRUD.

### In scope
- **Drive list page** (`/drives`): search, four filters (status, month, stream, domain), sortable columns, pagination (8/15/25 rows), CSV export, row checkboxes.
- **Bulk actions**: publish / clone / archive on selected rows.
- **Create-drive wizard**: the 6 steps — Basic Info · Schedule · Eligibility · Evaluation · Visibility · Review & Publish — with per-step validation and a review summary.
- **Edit**: the same wizard, pre-filled from an existing drive.
- **Per-row actions**: edit, publish, archive, clone.
- **Schema expansion** of the `Drive` model to hold the full wizard payload.
- **Command Center compatibility**: update the dashboard aggregation + tests to read `eventDates[]`.
- Wire the sidebar "Drives" nav and both "New Drive"/"Create Drive" buttons to the real module.

### Out of scope (deferred)
- Streams / Templates / Evaluations config modules (evaluation stages here are embedded config on the drive, not linked to a separate Evaluations module).
- Institute/employer selection UIs referenced by "Selected institutes" / "Invite-only" visibility (stored as the chosen mode + a placeholder list; the pick-lists arrive with the Institutes/Employers slices).
- Real slot generation from a drive's capacity (Slots module is later).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Scope | Full faithful (list + wizard + edit + publish/archive/clone + bulk) |
| Event dates | `eventDates: Date[]` with a derived nearest-upcoming; dashboard updated to use it |
| Status on publish | Draft → **Published** → Active (Active is a separate running state); any → Archived |
| Command Center | OK to update its aggregation + re-verify via the E2E smoke |
| Evaluation stages | Embedded config on the `Drive` doc (not a separate collection) |
| Language / stack | Same as Command Center (TS strict, ESM, Express/Mongoose, React/Vite/Router/TanStack Query) |

## 3. Schema — expanded `Drive` model

`server/src/models/Drive.ts` grows (existing fields retained; new fields added):

```ts
Drive {
  name: string; domain: string; stream: string;
  status: 'Active' | 'Published' | 'Draft' | 'Archived';
  candType: 'Freshers' | 'Experienced' | 'Both';
  mode: 'Online' | 'Onsite' | 'Hybrid';
  frequency: 'Weekly' | 'Bi-weekly' | 'Monthly' | 'One-time';
  eventDay: 'Wednesday' | 'Saturday';
  eventDates: Date[];                        // one or more scheduled event dates
  candCap: number; empCap: number; slotCap: number;
  eligibility: {
    sources: string[];                       // Institutes | Resume Vault | Referrals | Direct Apply | Recruiter Uploads
    branches: string[];                      // CSE | IT | ECE | EEE | MECH | MCA | MBA
    gradYears: number[];                     // e.g. [2025, 2026]
    expType: string;                         // 'Freshers only' | '0–2 yrs' | '2–5 yrs' | '5+ yrs'
  };
  evaluation: {
    key: 'mcq' | 'coding' | 'tara' | 'assignments';
    enabled: boolean;
    config: Record<string, number>;          // mcq:{questions,durationMin} coding:{problems,durationMin} tara:{durationMin} assignments:{deadlineDays}
  }[];
  visibility: {
    employerReg: 'Open' | 'Invite-only' | 'Closed';
    instituteVis: 'All institutes' | 'Selected institutes' | 'Private link';
    candidateAccess: 'Public' | 'Eligible only' | 'Invite';
  };
  createdBy: string;                          // the authenticated user's name
  createdAt: Date; updatedAt: Date;           // timestamps: true
}
```

**Derived, not stored:** `primaryEventDate` = the earliest `eventDate ≥ now` (or the earliest overall if all are past). Computed where needed; never persisted (it changes as dates pass).

**Domain/stream vocab** (from the prototype): domains = Frontend, Backend, Full-stack, Data / ML, DevOps; streams = B.Tech, M.Tech, MCA, MBA. The list's Month filter is derived from a drive's `primaryEventDate` (e.g. "Jul 2026").

## 4. Command Center Compatibility

The single `eventDate` becomes `eventDates[]`, so the dashboard aggregation (`server/src/modules/dashboard/dashboard.service.ts`) and its tests are updated:
- **nextMatchDay / events**: a drive is "upcoming" if `eventDates` has any element `≥ now`; each upcoming event date contributes to the events list; the events list shows the nearest upcoming dates (still limit 3), sorted ascending.
- **Upcoming Wednesdays**: unwind `eventDates`, filter to `≥ now` and day-of-week = Wednesday (UTC), count distinct dates.
- **Active Drives KPI**: unchanged (`status:'Active'`).
- The Drive seed switches `eventDate` → `eventDates` (§7), so `dashboard.service.test.ts` fixtures and the drive-count assertions are updated accordingly.
- Re-verified by the existing controller-run E2E smoke (login → overview → assert numbers) after the change.

## 5. API (all under `/api/drives`, protected by `requireAuth`)

Errors use the shared `{ error: { message, code } }` contract; 400 on zod-validation, 404 on unknown id.

- **`GET /api/drives`** — query: `q` (name/domain/stream contains, case-insensitive), `status`, `month` (`YYYY-MM`), `stream`, `domain`, `sort` (name|domain|stream|month|candCap|empCap|slotCap|status), `order` (asc|desc, default desc by createdAt), `page` (1-based), `limit` (8|15|25, default 8). Returns:
  ```ts
  { items: DriveListItem[]; total: number; page: number; limit: number }
  // DriveListItem: { id, name, domain, stream, month, frequency, eventDay,
  //                  candCap, empCap, slotCap, status, createdBy, primaryEventDate }
  // month = display label "Jul 2026", derived from primaryEventDate. The `month`
  // query param is `YYYY-MM` (e.g. "2026-07"); the server filters on primaryEventDate's
  // year+month, and the client builds dropdown options as {value:'2026-07', label:'Jul 2026'}.
  ```
- **`POST /api/drives`** — body = full wizard payload (zod-validated). `status` defaults to `'Draft'`; if the client sends `status:'Published'` (the wizard's Publish), persist that. `createdBy` = the authenticated user's name. Returns the created `Drive`.
- **`GET /api/drives/:id`** — the full `Drive` document (for edit prefill). 404 if missing.
- **`PATCH /api/drives/:id`** — partial update of any drive fields, including `status` (this endpoint powers Edit, Publish → `status:'Published'`, and Archive → `status:'Archived'`). Zod-validated (partial). Returns the updated `Drive`.
- **`POST /api/drives/:id/clone`** — deep-copies the drive as a new `Draft` named `"<name> (copy)"`, returns it.
- **`POST /api/drives/bulk`** — body `{ ids: string[], action: 'publish' | 'clone' | 'archive' }`. Applies the action to each id; returns `{ affected: number }` (clone returns the created count).

Module lives in `server/src/modules/drives/` (`drives.routes.ts`, `drives.controller.ts`, `drives.service.ts`, `drives.schemas.ts` for zod). Mounted `app.use('/api/drives', driveRoutes)` in `app.ts` (errorHandler stays last).

## 6. Frontend

New route `/drives` (protected, inside the app shell). Sidebar "Drives" `NavLink` → `/drives`.

### Drive list — `client/src/pages/Drives/`
- `index.tsx` — page: `AppShell` (crumb "Operations", title "Drive Management") + toolbar + bulk bar + table + pager. Holds filter/sort/page state; `useDrives(params)` (TanStack Query) fetches `GET /api/drives`.
- `DrivesToolbar.tsx` — search input + status/month/stream/domain `<select>`s + Export + Create Drive.
- `DrivesTable.tsx` — sortable header, row checkboxes, status badge, per-row action menu (Edit / Publish / Archive / Clone), reusing the prototype's `.dm` table classes.
- `BulkBar.tsx` — appears when rows are selected; Publish / Clone / Archive / Clear.
- `useDrives.ts`, `useDriveMutations.ts` (create/update/clone/archive/bulk mutations that invalidate the list query).
- CSV export built client-side from the current filtered result (matches the prototype's Export).

### Create/Edit wizard — `client/src/pages/Drives/wizard/`
- `DriveWizard.tsx` — full-screen overlay reproducing the prototype's `#wizard`: step rail (`.wiz-rail` with the 6 `.st` items), `.wiz-main` with progress bar and the active `.wstep`, and `.wiz-foot` (Back · Save draft & exit · Continue · Publish). Holds the wizard form model; per-step validation gates "Continue".
- One component per step: `StepBasics`, `StepSchedule`, `StepEligibility`, `StepEvaluation`, `StepVisibility`, `StepReview` — each rendering the prototype's real field markup/classes (`.wfld`, `.pick`/`.opt`, `.chips`/`.chipc`, `.evrow`/`.switch`, `.datechips`).
- Opened in **create** mode from the list's "Create Drive" and the Command Center's "New Drive"; in **edit** mode via `GET /api/drives/:id` prefill. Submit → `POST` (create) or `PATCH` (edit); "Save draft & exit" persists with `status:'Draft'`; "Publish" (review step) persists with `status:'Published'`.
- Date selection: the Schedule step offers the upcoming event dates for the chosen `eventDay` (Wednesdays or Saturdays) as multi-select chips, matching the prototype's `#dateChips`.

## 7. Seed

`server/src/seed/seed.ts` — the 12 existing drives gain the new fields with deterministic values (candType/mode/frequency/eventDay/eligibility/evaluation/visibility/createdBy) and `eventDate` becomes `eventDates: [date]` (the 3 upcoming MatchDay drives keep Jul 15/22/29 2026; give at least one drive multiple dates to exercise the array). `createdBy` = "Platform Admin". Re-running the seed stays idempotent.

## 8. Validation & Errors

Zod schemas mirror the wizard's client rules:
- `name` required (non-empty).
- `eventDates` — at least one.
- `eligibility.sources` — at least one; `eligibility.branches` — at least one.
- `evaluation` — at least one stage with `enabled: true`.
- enums validated against their allowed values.
Server returns 400 `{ error: { code:'validation' } }` on failure; the wizard also validates per step client-side (the same rules) before allowing "Continue".

## 9. Testing (TDD)

- **Server** (Vitest + supertest + mongodb-memory-server):
  - `drives.service`/route: list filtering (status/stream/domain/month/q), sorting, pagination (total/page/limit correct); create round-trip persists the full payload; `GET /:id`; `PATCH` updates fields + status (publish/archive); clone produces a Draft copy; bulk applies to all ids; zod 400s (missing name, no dates, no sources, no enabled eval stage); 404 on unknown id; auth 401 without token.
  - Updated `dashboard.service` tests for `eventDates[]` (nextMatchDay, upcoming Wednesdays, events).
- **Client** (Vitest + RTL): wizard step-validation (blocks Continue when a required step is invalid) and a create submit (mocked API); the list renders rows from a mocked response and a filter change refetches; status-badge render.

## 10. File Structure Additions

```
server/src/
  models/Drive.ts                         # expanded
  modules/drives/
    drives.routes.ts  drives.controller.ts  drives.service.ts  drives.schemas.ts
  modules/dashboard/dashboard.service.ts  # updated for eventDates[]
  seed/seed.ts                            # updated
client/src/
  pages/Drives/
    index.tsx  DrivesToolbar.tsx  DrivesTable.tsx  BulkBar.tsx
    hooks/useDrives.ts  hooks/useDriveMutations.ts
    wizard/DriveWizard.tsx  wizard/StepBasics.tsx  StepSchedule.tsx
           StepEligibility.tsx  StepEvaluation.tsx  StepVisibility.tsx  StepReview.tsx
    types.ts                              # Drive + wizard-model types (+ shared DTO additions)
  App.tsx                                 # add /drives route
  components/Sidebar.tsx                  # Drives NavLink → /drives
```

## 11. Status / State Model

- `Draft` — created/incomplete; not visible to employers/candidates.
- `Published` — completed via the wizard's Publish (or PATCH); open per visibility rules.
- `Active` — a running drive (its event window is current). Set manually/by seed in this slice; the Command Center "Active Drives" KPI counts this state.
- `Archived` — retired; excluded from active views.
Transitions allowed: Draft→Published, Published→Active, any→Archived, Archived→Draft (restore). The wizard's "Publish" sets `Published`; "Save draft & exit" sets `Draft`.
