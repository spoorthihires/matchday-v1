# Institutes Module — MERN Slice Design

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Depends on:** Command Center + Drives slices — reuses auth, app shell, DTO/error conventions, the `Institute` + `Jobseeker` collections, and the cumulative funnel semantics.
**Source prototype:** `matchday-admin-app_23.html` — Institute Management page (list + create/edit modal) and the Institute Details page (7-tab detail).

## 1. Goal & Scope

The third vertical slice: a full, faithful **Institutes module** — onboard/manage institutes and view per-institute funnel analytics — replacing the "Coming soon" placeholder at the `Institutes` nav. Makes the Command Center's institute leaderboard clickable and backs the supply-side pipeline.

### In scope
- **List page** (`/institutes`): overview KPIs (Total Institutes, Pending Approval, Candidates Uploaded, Avg Match-Ready %), search, type + status filters, sortable funnel columns, pagination, row checkboxes, bulk **Approve / Disable**, CSV export, **Create Institute**.
- **Create/Edit modal**: name, type, city, owner/SPOC, email, status.
- **Detail page** (`/institutes/:id`): header (logo, name + status, subrow, actions) + KPI row + tabs. **Six tabs built with real data**: Overview, Candidates, Funnel Analytics, Performance, Ownership History, Audit Logs. **One tab deferred**: Drives (+ the "Assign Drives" action) renders "coming soon" — it needs the institute↔drive link, deliberately deferred.
- **Derived funnel metrics** computed live from Jobseeker (never stored).
- **AuditLog** collection (new, reusable) written on institute mutations; **ownershipHistory** embedded on the Institute.
- Sidebar "Institutes" → real `/institutes`.

### Out of scope (deferred)
- **Institute↔Drive assignment** — "Assign Drives" (bulk + detail action) and the detail **Drives** tab show "coming soon". Added when Slots/Approvals need it.
- Candidate **Upload** flow from the institute detail (the bulk-import wizard is the Jobseekers slice).
- Any change to the Jobseeker schema — funnel metrics are derived from existing fields (`stage`, `profileCompleted`).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Scope | Full faithful; the one deferral is the institute↔drive link → Drives tab + Assign Drives = "coming soon" |
| Detail tabs built | Overview, Candidates, Funnel Analytics, Performance, Ownership History, Audit Logs (6 of 7) |
| Audit logging | New reusable `AuditLog` collection (not embedded) |
| Ownership history | Embedded `ownershipHistory[]` on the Institute |
| Funnel metrics | Derived live from Jobseeker; cumulative reached-stage semantics |
| `signupPct` mapping | % of the institute's jobseekers past the `Applied` stage (no `signedUp` field added to Jobseeker) |

## 3. Schema

### Institute (expand)
```ts
Institute {
  name: string;
  city: string;
  type: 'Engineering College' | 'University' | 'Autonomous Institute' | 'Bootcamp';
  status: 'Active' | 'Pending' | 'Disabled';
  owner: string;                 // SPOC full name          (NEW)
  email: string;                 // contact email           (NEW)
  ownershipHistory: {            // append on owner/email change (NEW)
    owner: string; email: string; changedAt: Date; changedBy: string;
  }[];
  createdAt: Date; updatedAt: Date;   // timestamps: true
}
```
**Migration note:** the existing lean Institute has `{ name, city, type, status, createdAt }` with `type` free-string. The seed rewrites institutes with the new fields and a `type` drawn from the four allowed values; `owner`/`email` become required-on-create (defaulted for legacy).

### AuditLog (new, lean, reusable)
```ts
AuditLog {
  entityType: string;   // 'institute' (extensible to other entities later)
  entityId: ObjectId;
  action: string;       // 'created' | 'edited' | 'approved' | 'disabled' | 'status-changed'
  actor: string;        // the authenticated user's name ('Platform Admin')
  detail?: string;      // human-readable summary
  at: Date;             // createdAt (timestamps)
}
```
Indexed on `{ entityType, entityId, at }` for the per-institute audit query.

## 4. Derived Funnel Metrics (per institute, from Jobseeker)

Computed by aggregating Jobseeker grouped by `instituteId`. `uploaded` = total jobseekers at the institute. Percentages are integer-rounded, guarded against divide-by-zero (0 when `uploaded === 0`):
- `signupPct` = count(`stage` != `'Applied'`) / uploaded · 100
- `completionPct` = count(`profileCompleted` === true) / uploaded · 100
- `matchReadyPct` = count(`stage` ∈ {MatchReady, Shortlisted, Offer, Joined}) / uploaded · 100
- `shortlistPct` = count(`stage` ∈ {Shortlisted, Offer, Joined}) / uploaded · 100
- `offerPct` = count(`stage` ∈ {Offer, Joined}) / uploaded · 100
- `joinedPct` = count(`stage` === `Joined`) / uploaded · 100

List overview KPIs: `total` = institute count (all), `pending` = count(status Pending), `uploaded` = Σ jobseekers across institutes, `avgMatchReadyPct` = mean `matchReadyPct` across **Active** institutes.

## 5. API (all under `/api/institutes`, protected by `requireAuth`)

Errors: shared `{ error: { message, code } }`; 400 validation, 404 unknown id, 401 no token.

- **`GET /api/institutes`** — query `q` (name/type/city contains, case-insensitive), `type`, `status`, `sort` (name|type|uploaded|signup|completion|matchReady|shortlist|offer|joined), `order` (asc|desc), `page`, `limit` (default 8). Returns `{ items: InstituteListItem[]; total; page; limit; overview }`. Each `InstituteListItem` = `{ id, name, city, type, status, owner, email, uploaded, signupPct, completionPct, matchReadyPct, shortlistPct, offerPct, joinedPct }`. `overview` is **global** (computed over ALL institutes, ignoring q/type/status/pagination) so the KPI tiles are stable as the user filters. Implementation: compute the per-institute funnel for every institute first (aggregate Jobseeker grouped by instituteId, merge onto institutes), THEN apply the text/type/status match, THEN sort (a funnel column sorts by its derived value) and paginate — the derived metrics must exist before sort/paginate, so filtering/pagination cannot precede the funnel computation.
- **`POST /api/institutes`** — body (zod): `{ name, type, city, owner, email, status? }`. Creates with `ownershipHistory:[{owner,email,changedAt:now,changedBy:actor}]`; writes an `AuditLog` `created`. Returns the institute.
- **`GET /api/institutes/:id`** — `{ institute (incl. ownershipHistory), funnel (the derived metrics), kpis, performance }`. `performance` = the institute's `matchReadyPct` and `joinedPct` vs the platform average + its rank by match-ready count.
- **`PATCH /api/institutes/:id`** — partial update incl. `status`. If `owner` or `email` changed, append an `ownershipHistory` entry. Writes an `AuditLog` (`edited` / `approved` when status→Active / `disabled` when status→Disabled / `status-changed` otherwise). Returns the updated institute. 404 if missing.
- **`POST /api/institutes/bulk`** — `{ ids: string[], action: 'approve' | 'disable' }` → sets status Active/Disabled via `updateMany`, writes an `AuditLog` per affected id. Returns `{ affected }`. ("assign" is intentionally NOT accepted — coming soon.)
- **`GET /api/institutes/:id/candidates`** — paginated jobseekers for the institute: `?page&limit` → `{ items:[{ id, name, branch, gradYear, cgpa, source, stage, profileCompleted }], total, page, limit }`.
- **`GET /api/institutes/:id/audit`** — paginated audit logs for the institute: `?page&limit` → `{ items:[{ action, actor, detail, at }], total, page, limit }`.

Module: `server/src/modules/institutes/` (`institutes.routes.ts`, `institutes.controller.ts`, `institutes.service.ts`, `institutes.schemas.ts`). New model file `server/src/models/AuditLog.ts`. Mounted `app.use('/api/institutes', instituteRoutes)` (errorHandler stays last).

## 6. Frontend

New routes `/institutes` and `/institutes/:id` (protected, inside the shell). Sidebar "Institutes" `NavLink` → `/institutes`.

### List — `client/src/pages/Institutes/`
- `index.tsx` — `AppShell` (crumb "Supply", title "Institute Management") + overview `.kpis` + toolbar + bulk bar + table + pager. Holds filter/sort/page + `selectedIds`; `useInstitutes(params)` fetches the list. Row click / "View" → `/institutes/:id`. Create → modal; Edit → modal (prefilled). Bulk approve/disable via `useInstituteMutations().bulk`; "Assign Drives" bulk button present but disabled/"coming soon". CSV export from current items.
- `InstitutesToolbar.tsx`, `InstitutesTable.tsx` (sortable funnel columns, status badge, checkboxes, per-row action menu: View / Edit / Approve / Disable), `BulkBar.tsx`, `InstituteModal.tsx` (create/edit form in `.modal-scrim`/`.modal`).
- `hooks/useInstitutes.ts`, `useInstituteMutations.ts` (create/update/bulk; invalidate `['institutes']`).

### Detail — `client/src/pages/Institutes/detail/`
- `InstituteDetail.tsx` — route `/institutes/:id`; header (`.idhead` logo/name/`.badge-st`/subrow/`.idactions` — Assign Drives (coming soon) / Upload (coming soon) / Edit) + KPI row + `.tabbar`/`.tabpane` tabs. `useInstitute(id)` for the detail payload.
- Tab components: `TabOverview`, `TabCandidates` (paginated via `useInstituteCandidates`), `TabFunnel`, `TabPerformance`, `TabOwnership`, `TabAudit` (paginated via `useInstituteAudit`), `TabDrivesComingSoon`.

## 7. Seed

`server/src/seed/seed.ts` — rewrite institute creation: keep the 21 names/cities, set `type` from the four allowed values, add `owner` (a plausible SPOC name via the PRNG name pool), `email` (`spoc@<slug>.edu`), and an initial `ownershipHistory` entry. After institutes + jobseekers are seeded, insert a handful of `AuditLog` rows per institute (`created`, and for a subset `approved`/`edited`) dated across the spread window. Deterministic (fixed PRNG). Idempotent (delete AuditLog + institutes on re-seed).

## 8. Validation & Errors

Zod: create requires `name`, `type` (enum), `city`, `owner`, `email` (email format); `status` optional (default Pending for new). Update = partial. Bulk `action ∈ {approve, disable}` (reject `assign` with 400). Standard error contract.

## 9. Testing (TDD)

- **Server**: list aggregation (funnel math per institute correct against a known fixture; overview KPIs; filter by type/status/q; sort by a funnel column; pagination); create writes ownershipHistory + audit; patch appends ownershipHistory only on owner/email change + writes the right audit action; bulk approve/disable + audit per id + rejects `assign`; `/candidates` and `/audit` pagination; 404/401.
- **Client**: list renders rows + overview KPIs from a mocked response and a filter change refetches; `InstituteModal` create submit (mocked); detail renders tabs and switches panes; `TabDrivesComingSoon` shows the placeholder.

## 10. File Structure Additions

```
server/src/
  models/Institute.ts                      # expanded
  models/AuditLog.ts                        # new
  modules/institutes/
    institutes.routes.ts  institutes.controller.ts  institutes.service.ts  institutes.schemas.ts
  seed/seed.ts                             # institutes + audit logs
client/src/
  types/institutes.ts
  pages/Institutes/
    index.tsx  InstitutesToolbar.tsx  InstitutesTable.tsx  BulkBar.tsx  InstituteModal.tsx
    hooks/useInstitutes.ts  useInstituteMutations.ts  useInstitute.ts
           useInstituteCandidates.ts  useInstituteAudit.ts
    detail/InstituteDetail.tsx  TabOverview.tsx  TabCandidates.tsx  TabFunnel.tsx
           TabPerformance.tsx  TabOwnership.tsx  TabAudit.tsx  TabDrivesComingSoon.tsx
  App.tsx                                  # add /institutes and /institutes/:id routes
  components/Sidebar.tsx                   # Institutes NavLink → /institutes
```

## 11. Status / State Model

- `Pending` — onboarded, awaiting approval (default for new institutes).
- `Active` — approved and participating (counted in Avg Match-Ready).
- `Disabled` — retired; excluded from active views/averages.
Transitions: Pending→Active (approve), any→Disabled (disable), Disabled→Active (re-approve). Bulk approve → Active; bulk disable → Disabled. Each transition writes an AuditLog.
