# Jobseekers Module — MERN Slice Design

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Depends on:** Command Center + Drives + Institutes slices — reuses auth, app shell, DTO/error conventions, the `Jobseeker` + `Institute` collections, and the cumulative funnel semantics.
**Source prototype:** `matchday-admin-app_23.html` — Jobseeker Management page (list + add/edit modal) and the Bulk Candidate Upload wizard (`#upWizard`).

## 1. Goal & Scope

The fourth vertical slice: manage candidates and **bulk-import** them — replacing the "Coming soon" placeholder at the `Jobseekers` nav. The 5-step CSV/XLSX import wizard is the centerpiece; it feeds every supply-side metric on the Command Center and Institutes pages.

### In scope
- **List page** (`/jobseekers`): 7 view lenses (All · By Institute · By Stream · By Evaluation · By Match Readiness · By Offer Status · By Consent), search, sort, pagination, row checkboxes, a **Block** bulk action, CSV export, Add Candidate, Bulk Upload.
- **Add/Edit modal** (single candidate).
- **Bulk Upload wizard** (5 steps): CSV Upload → Duplicate Check → Validation → Import Summary → Completion Report. Accepts **CSV + XLSX**, parsed **client-side** (SheetJS `xlsx`), with server **dry-run preview** + **commit** endpoints.
- Additive `Jobseeker` fields: `email`, `consent`.
- Sidebar "Jobseekers" → `/jobseekers`.

### Out of scope (deferred)
- **Duplicate-Risk view lens** and **Merge / Change-Stream / Reset-Eval** bulk actions (need dedup / stream-assignment infra). The Dup-Risk *column* still renders a light live indicator.
- File upload/storage on the server (parsing is client-side; only parsed rows are POSTed).
- Any change to `stage` / `profileCompleted` / `evaluationStatus` semantics (funnel source of truth).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Import formats | CSV + XLSX, parsed client-side via SheetJS (`xlsx`) |
| Field model | Keep stage/profileCompleted/evaluationStatus as funnel truth; DERIVE offer/match%/eval-label/dup-risk; ADD only `email` + `consent` |
| List scope | Core list + 7 practical view lenses + Block bulk (Dup-Risk lens + Merge/Change-Stream/Reset-Eval deferred) |
| Block action | Sets `consent: 'Revoked'` (no new `blocked` field) |
| Match-% in modal | Read-only, derived from stage |
| Parse location | Client-side (browser parses file → POST parsed rows to preview/commit) |

## 3. Schema — `Jobseeker` (additive)

`server/src/models/Jobseeker.ts` gains two fields (everything else retained; do NOT switch to timestamps — the Command Center dashboard tests seed jobseekers with explicit `createdAt`):
```ts
Jobseeker {
  // ...existing: name, instituteId, branch, gradYear, cgpa, source,
  //   profileCompleted, evaluationStatus, stage, createdAt
  email: string;                                   // default '' (NEW)
  consent: 'Granted' | 'Pending' | 'Revoked';      // default 'Granted' (NEW)
}
```
Keep `evaluationStatus` enum (`na | pending | completed`) and `stage` union unchanged.

### Derived display fields (never stored)
- **offerStatus**: `stage` → `Shortlisted`→"Shortlisted", `Offer`→"Offer sent", `Joined`→"Joined", `DroppedOff`→"Rejected", else "None".
- **matchReadinessPct**: ordinal map on `stage` — Applied 10, Screened 30, Evaluated 55, MatchReady 75, Shortlisted 85, Offer 92, Joined 100, DroppedOff 0.
- **evaluationLabel**: `evaluationStatus` → `na`→"Not started", `pending`→"In progress", `completed`→"Completed".
- **dupRisk**: "High" if the candidate's (non-empty) email is shared by another jobseeker, else "Low" (light live check within the returned page's scope + a targeted count; see §5).
- **stream** column ← existing `branch`.

## 4. Derived-field filter translation (server-side)

The list accepts filters on derived fields; the service translates them to real queries:
- `offer` → `stage`: `Shortlisted`→`Shortlisted`; `Offer sent`→`Offer`; `Joined`→`Joined`; `Rejected`→`DroppedOff`; `None`→`stage ∈ {Applied,Screened,Evaluated,MatchReady}`.
- `matchBucket` → `stage` ranges: `high`(≥75) → `stage ∈ {MatchReady,Shortlisted,Offer,Joined}`; `mid`(30–74) → `{Screened,Evaluated}`; `low`(<30) → `{Applied,DroppedOff}`.
- `evaluationStatus` filter maps the label back to the enum.
- `instituteId`, `stream`(=`branch`), `consent` filter directly.

## 5. API (all under `/api/jobseekers`, protected by `requireAuth`)

Errors: shared `{ error: { message, code } }`; 400 validation, 404 unknown id, 401 no token.

- **`GET /api/jobseekers`** — query `q` (name contains, case-insensitive), `instituteId`, `stream`, `evaluationStatus`, `offer`, `consent`, `matchBucket`, `sort` (name|institute|matchReady), `order`, `page`, `limit` (default 10). Returns `{ items: JobseekerListItem[]; total; page; limit }`.
  - `JobseekerListItem` = `{ id, code, name, email, instituteId, instituteName, stream, evaluationLabel, matchReadinessPct, offerStatus, dupRisk, consent, stage }`. `code` is **display-only**: `'C-' + <last 6 hex chars of _id, uppercased>` (no separate stored counter; search is by name only, not code).
  - `instituteName` via `$lookup`; `dupRisk` via a per-page email-collision check (aggregate emails appearing >1 across the collection, mark page rows whose email is in that set).
- **`POST /api/jobseekers`** — body (zod): `{ name, instituteId, branch, gradYear, cgpa, source?, email?, consent?, stage?, evaluationStatus?, profileCompleted? }`. Defaults: stage `Applied`, evaluationStatus `na`, consent `Granted`. Returns the created jobseeker.
- **`GET /api/jobseekers/:id`** — the jobseeker (for edit prefill), 404 if missing.
- **`PATCH /api/jobseekers/:id`** — partial update (name/institute/branch/stage/evaluationStatus/consent/email). 404 if missing.
- **`POST /api/jobseekers/bulk`** — `{ ids: string[], action: 'block' }` → sets `consent: 'Revoked'` via `updateMany`. Returns `{ affected }`. (Only `block` accepted; others 400.)
- **`POST /api/jobseekers/import/preview`** — body `{ rows: RawRow[] }` (parsed client-side). Returns per-row results + summary. For each row: **validation** (required `name`, `email`, `institute`; email format; `cgpa` 0–10; `gradYear` 2020–2030; institute name resolves to an active/known institute) and **duplicate detection** (within-batch by lowercased email OR name+institute; and vs existing jobseekers by email OR name+instituteId). Response: `{ rows: [{ index, data(normalized incl. resolved instituteId/instituteName), valid, errors: string[], dupe: bool, dupeReason?: string }], summary: { total, valid, invalid, duplicates, willImport } }`.
- **`POST /api/jobseekers/import/commit`** — body `{ rows: RawRow[] }`. **Re-runs preview logic server-side** (never trusts the client), then `insertMany` the rows that are `valid && !dupe` with defaults (stage `Applied`, evaluationStatus `na`, profileCompleted false, source `Bulk import`, consent `Granted`, resolved `instituteId`/`branch`). Returns `{ imported, skipped, skippedReasons: {duplicates, invalid} }`.

`RawRow` = `{ name?, email?, institute?, branch?, gradYear?, cgpa?, source? }` (loose strings from the file).

Module: `server/src/modules/jobseekers/` (`jobseekers.routes.ts`, `jobseekers.controller.ts`, `jobseekers.service.ts`, `jobseekers.import.ts` (preview/validation/dup logic), `jobseekers.schemas.ts`). Mounted `app.use('/api/jobseekers', jobseekerRoutes)` (errorHandler stays last). Route order: `/bulk`, `/import/preview`, `/import/commit` before `/:id`.

## 6. Frontend

New route `/jobseekers` (protected, inside the shell). Sidebar "Jobseekers" `NavLink` → `/jobseekers`.

### List — `client/src/pages/Jobseekers/`
- `index.tsx` — `AppShell` (crumb "Supply", title "Jobseeker Management") + view pills + toolbar + bulk bar + table + pager. Holds `view` + `params` + `selectedIds`. `useJobseekers(params)` fetches the list. View pills set which filter (`instituteId`/`stream`/`evaluationStatus`/`offer`/`consent`/`matchBucket`) is active and show the contextual filter `<select>`. Add → modal; row Edit → modal (prefilled); Block (row + bulk) → mutation. Bulk Upload → the wizard. CSV export from current items.
- `JobseekersToolbar.tsx`, `ViewPills.tsx`, `JobseekersTable.tsx` (columns: Candidate, Institute, Stream, Evaluation, Match, Offer, Dup Risk, Consent, Actions; `.badge-st`/pill styling; checkboxes; per-row menu View/Edit/Block), `BulkBar.tsx` (Block + Clear; deferred actions omitted or disabled "coming soon"), `JobseekerModal.tsx`.
- `hooks/useJobseekers.ts`, `useJobseekerMutations.ts` (add/update/block; invalidate `['jobseekers']`).

### Import wizard — `client/src/pages/Jobseekers/upload/`
- `UploadWizard.tsx` — full-screen overlay porting `#upWizard` (`.wiz-top`/`.wiz-body`/`.wiz-rail` 5 `.st` steps/`.wiz-main`/`.wiz-progress`/`.wiz-foot`). State: `step`, parsed `rows`, `preview` result, `commit` result. Step nav gated (can't advance past Upload without rows; past Validation runs preview).
- `parse.ts` — client-side file parse via `xlsx` (SheetJS): reads CSV/XLSX → array of `RawRow`. `template.ts` — the CSV template string + a small sample dataset.
- Step components: `StepUpload` (dropzone + file chip + template/sample links), `StepDuplicates` (preview dupes, removable), `StepValidation` (invalid rows + reasons), `StepSummary` (counts), `StepCompletion` (commit result + download log).
- `hooks/useImportPreview.ts`, `useImportCommit.ts` (mutations to the two endpoints; commit invalidates `['jobseekers']`).

## 7. Seed

`server/src/seed/seed.ts` — add `email` (derived: `first.last<n>@<institute-slug>.edu`, lowercased) + `consent` (weighted: ~85% Granted, ~10% Pending, ~5% Revoked via PRNG) to each seeded jobseeker. Additive — funnel counts unchanged. Deterministic; idempotent.

## 8. Command Center / Institutes impact

`Jobseeker` change is additive (email/consent optional defaults). The dashboards' `stage`/`profileCompleted`/`evaluationStatus`-based funnels are untouched → their tests stay green and live numbers (readiness 82, matchReady 531) are preserved. Bulk import adds `Applied`-stage candidates (real data); re-seed after any live smoke.

## 9. Validation & Errors

Zod: add/edit (name/instituteId required, cgpa 0–10, gradYear int, enums for consent/stage/evaluationStatus); bulk (`action: 'block'`); import preview/commit (`rows` array). Import row rules enforced in `jobseekers.import.ts` (single source of truth, used by both preview and commit). Standard error contract.

## 10. Testing (TDD)

- **Server**: list filters incl. derived-field translation (offer/matchBucket → stage; consent; institute) + pagination + dupRisk flag; add/edit; block → consent Revoked; **import preview** (validation errors: missing field, bad email, cgpa out of range, unknown institute; duplicate detection within-batch + vs existing) and summary counts; **import commit** inserts only valid non-dupes with defaults and returns imported/skipped; 404/401.
- **Client**: list renders rows + a view-pill switch changes the active filter; `JobseekerModal` add submit (mocked); **UploadWizard** parse (a small CSV string → rows) → preview (mocked) → summary → commit (mocked) happy path; validation/dup rows surfaced.

## 11. File Structure Additions

```
server/src/
  models/Jobseeker.ts                       # + email, consent
  modules/jobseekers/
    jobseekers.schemas.ts jobseekers.import.ts jobseekers.service.ts
    jobseekers.controller.ts jobseekers.routes.ts
  seed/seed.ts                              # + email/consent on jobseekers
client/src/
  types/jobseekers.ts
  pages/Jobseekers/
    index.tsx JobseekersToolbar.tsx ViewPills.tsx JobseekersTable.tsx BulkBar.tsx JobseekerModal.tsx
    hooks/useJobseekers.ts useJobseekerMutations.ts
    upload/UploadWizard.tsx parse.ts template.ts
           StepUpload.tsx StepDuplicates.tsx StepValidation.tsx StepSummary.tsx StepCompletion.tsx
    upload/hooks/useImportPreview.ts useImportCommit.ts
  App.tsx                                   # add /jobseekers route
  components/Sidebar.tsx                    # Jobseekers NavLink → /jobseekers
client/package.json                         # + xlsx (SheetJS)
```

## 12. Status / Consent Model

`consent`: `Granted` (default; participating), `Pending` (awaiting), `Revoked` (blocked — set by the Block action; excluded from active outreach). Consent is orthogonal to `stage` (the pipeline position). The Block bulk action sets `consent: 'Revoked'`.
