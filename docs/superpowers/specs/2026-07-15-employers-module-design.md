# Employers Module — MERN Slice Design

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Depends on:** Command Center + Drives + Institutes + Jobseekers slices — reuses auth, app shell, DTO/error conventions, the `Employer` + `Drive` + `AuditLog` collections, and the established list-page pattern.
**Source prototype:** `matchday-admin-app_23.html` — Employer Management page (list + create/edit modal, lines 1893–1956) and the Employer Registration Approval page (lines 1959–1968 + runtime renderers at ~3489–3552).

## 1. Goal & Scope

The fifth vertical slice: manage employers and gate their **role registrations** through an approval queue — replacing the "Coming soon" placeholder at the `Employers` nav. This is the demand-side counterpart to Institutes and the final module in the agreed order.

### In scope
- **Employer list** (`/employers`): search (name/industry), industry + status filters, sortable columns (Employer, Industry, Active Drives, Candidates Viewed, Shortlist Rate, Offer Rate, Response Time, Status), pagination (8/15/25, windowed pager), row checkboxes, bulk **Approve / Disable**, CSV export, **Create Employer**, and a "Registration Approvals" button → the queue.
- **Create/Edit modal**: name, industry, company size, hiring SPOC, contact email, status.
- **Registration Approvals** (`/employers/approvals`): master-detail queue with all five prototype actions — **Approve** (upserts the employer), **Reject** (+reason), **Request Changes** (+note), **Move Drive** (picks from real non-archived drives), **Change Slot** — each appending to the registration's embedded activity log. Header count "N awaiting review · M total". Back link → `/employers`.
- New **RegistrationRequest** collection (seeded with the prototype's four registrations).
- **AuditLog** reuse: employer create/edit/approve/disable write `entityType:'employer'` rows.
- Sidebar "Employers" → `/employers`.

### Out of scope (deferred)
- **"Assign Drives"** bulk action — needs the employer↔drive link (same deferral as Institutes). Button present but disabled "coming soon".
- Employer detail page (the prototype has none — list + modal only).
- Recruiters module (separate nav item; later).
- A submission flow for NEW registrations (registrations arrive via seed; the admin console only reviews them).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Scope | Full faithful (all five approval actions; only Assign Drives deferred) |
| On approve | **Upsert the employer**: case-insensitive name match; create `{name, industry, spoc: submittedBy, status:'Active'}` only if absent; existing employers untouched |
| Registration industry | `RegistrationRequest.industry` field added (prototype registrations carry none) so the upsert never fabricates an industry |
| Performance metrics | Stored stats on `Employer` (no interaction data exists to derive them); `offersExtended`/`slotsFillRate` untouched for the Command Center leaderboard |
| Registration activity | Embedded `activity[]` on the registration (what the detail panel renders); employer mutations use `AuditLog` |
| Slot values | Free strings server-side (non-empty); the client offers a curated option list |

## 3. Schema

### Employer (additive — existing fields untouched)
```ts
Employer {
  name: string; industry: string;
  status: 'Active' | 'Pending' | 'Disabled';
  offersExtended: number; slotsFillRate: number;   // existing — CC leaderboard reads these
  createdAt: Date;                                  // existing explicit field — do NOT switch to timestamps
  size: '1–50' | '51–200' | '201–1000' | '1000+';  // NEW, default '51–200'
  spoc: string;                                     // NEW, default ''
  email: string;                                    // NEW, default ''
  activeDrives: number;                             // NEW stored stat, default 0
  candidatesViewed: number;                         // NEW, default 0
  shortlistRate: number;                            // NEW (0–100), default 0
  offerRate: number;                                // NEW (0–100), default 0
  respHours: number;                                // NEW (avg response time in hours), default 0
}
```
`industry` stays a plain String at the model layer (zod enforces the six-value enum at the API boundary): Product · SaaS | Fintech | ML / AI Platform | Cloud Infra | Enterprise | E-commerce.

### RegistrationRequest (new)
```ts
RegistrationRequest {
  company: string; industry: string;               // industry used by the approve-upsert
  role: string;
  driveId: ObjectId → Drive | null;                // real drive link
  driveName: string;                               // denormalized display name
  openings: number; ctcRange: string;              // e.g. '₹18–26 LPA'
  skills: string[];
  slot: string;                                    // e.g. 'Wed, Jul 16 · 10:00–12:00'
  panel: { name: string; role: string }[];
  jd: string;
  submittedBy: string;
  status: 'Pending review' | 'Approved' | 'Rejected' | 'Changes requested';
  activity: { action: string; by: string; at: Date }[];   // newest first (unshift)
  createdAt: Date;
}
```

## 4. API (protected by `requireAuth`; errors `{ error: { message, code } }`)

### `/api/employers`
- **`GET /`** — `q` (name/industry contains, case-insensitive), `industry`, `status`, `sort` (name|industry|drives|viewed|shortlist|offer|respHours), `order`, `page`, `limit` (default 8). Returns `{ items: EmployerListItem[]; total; page; limit }`. `EmployerListItem` = `{ id, name, industry, size, spoc, email, status, activeDrives, candidatesViewed, shortlistRate, offerRate, respHours }`.
- **`POST /`** — zod: name, industry (enum), size (enum), spoc, email (email or ''), status (default 'Pending'). AuditLog `created`. → 201.
- **`GET /:id`** / **`PATCH /:id`** — prefill / partial update (status changes log `approved`/`disabled`/`status-changed`, else `edited`). 404 on unknown/malformed id.
- **`POST /bulk`** — `{ ids, action: 'approve' | 'disable' }` (zod rejects anything else, incl. `assign`) → status Active/Disabled via updateMany + AuditLog per affected id. Returns `{ affected }`.

### `/api/registrations`
- **`GET /`** — optional `?status=`; returns all (small collection), sorted newest-first: `{ items: Registration[] ; counts: { pending, total } }` (`counts` powers the "N awaiting review · M total" header).
- **`GET /:id`** — one registration. 404 on unknown/malformed id.
- **`POST /:id/action`** — zod discriminated union on `action`:
  - `{ action: 'approve' }` — 400 if status is Approved/Rejected (closed). Sets `status:'Approved'`, unshifts activity `Approved`. **Employer upsert**: case-insensitive exact name match on `Employer.name`; if absent, create `{ name: company, industry, spoc: submittedBy, status: 'Active' }` (stats zeroed) + AuditLog `created` (detail "Created from registration approval"). If present, leave untouched.
  - `{ action: 'reject', reason?: string }` — 400 if closed. Status `Rejected`, activity `Rejected — <reason>` (reason optional).
  - `{ action: 'request-changes', note?: string }` — 400 if closed. Status `Changes requested`, activity `Changes requested — <note>`.
  - `{ action: 'move-drive', driveId: string }` — allowed regardless of status (matches prototype). Resolves the drive (404 if missing), sets `driveId` + `driveName`, activity `Moved to drive: <name>`.
  - `{ action: 'change-slot', slot: string (min 1) }` — allowed regardless of status. Sets `slot`, activity `Slot changed: <slot>`.
  - All actions log `by: 'Platform Admin'`, `at: now`, return the updated registration.

Modules: `server/src/modules/employers/` and `server/src/modules/registrations/` (schemas/service/controller/routes each). New model `server/src/models/RegistrationRequest.ts`. Mounted in `app.ts` (errorHandler last; `/bulk` before `/:id`).

## 5. Frontend

Routes `/employers` and `/employers/approvals` (protected). Sidebar "Employers" → `/employers`.

### List — `client/src/pages/Employers/`
- `index.tsx` — `AppShell` (crumb "Demand", title "Employer Management"); toolbar (search + industry/status selects + Registration Approvals button → navigate `/employers/approvals` + Export + Create), bulk bar (Approve / Assign Drives **disabled "coming soon"** / Disable / Clear), table (sortable columns; respHours displayed as `Xh` / `X.Yd` like the prototype's `fmtResp`), **windowed pager** (reuse the Jobseekers `pagerWindow` helper — lift it to a shared util), create/edit modal.
- `EmployersToolbar.tsx`, `EmployersTable.tsx` (presentational), `BulkBar.tsx`, `EmployerModal.tsx`, `hooks/useEmployers.ts`, `hooks/useEmployerMutations.ts` (create/update/bulk → invalidate `['employers']`).

### Approvals — `client/src/pages/Employers/approvals/`
- `ApprovalsPage.tsx` — `AppShell` (crumb "Demand · Employers", title "Registration Approvals"); `.backlink` → `/employers`; header count from `counts`; `.appr-wrap` with:
  - `ApprovalsList.tsx` — `.appr-item` cards (logo initials/color, company, role, status badge `.st-pending/.st-active/.st-danger/.st-teal`, submitted-when as relative time from `createdAt`); click selects.
  - `ApprovalDetail.tsx` — `.ad-head` (logo, role, company · submitted by · when, status badge), `.ad-actions` (Approve `.btn-success` / Reject `.btn-danger` / Request Changes — all disabled when closed; Move Drive / Change Slot always enabled), `.ad-sec` sections: Company & Drive, Requirement (openings/CTC/slot), Skills `.skillchips`, Job Description `.jd-box` (preserve newlines), Interview Panel `.panelist` rows, Approval activity `.adlog` timeline.
  - `ActionModal.tsx` — the small generic modal (reason textarea for Reject, note textarea for Request Changes, drive select for Move Drive fed by `useDrives({ limit: 100 })` filtered non-Archived, slot select for Change Slot from a curated option list of upcoming Wed/Sat time slots).
- `hooks/useRegistrations.ts` (list + counts), `useRegistrationAction.ts` (mutation → `POST /:id/action`; invalidates `['registrations']` and, on approve, `['employers']`).

## 6. Seed

- Expand the 48 employers: `size`/`spoc`/`email` + stats (`activeDrives` 0–4, `candidatesViewed` 40–420, `shortlistRate` 20–60, `offerRate` 8–35, `respHours` 4–96) via the deterministic PRNG. Existing name/industry/status/offersExtended/slotsFillRate generation untouched.
- Seed the prototype's 4 registrations — Vaultline Systems (Fintech), Northpeak Cloud (Cloud Infra), Aetherverse AI (ML / AI Platform), Cartsy Commerce (E-commerce) — with their roles/openings/CTC/skills/slots/panels/JDs/submitters, `driveId` linked to real seeded drives, statuses 2× Pending review / 1× Changes requested / 1× Approved, and seeded activity entries. Aetherverse AI already exists as an employer → built-in no-duplicate test for approve-upsert. Add `RegistrationRequest` to the seed's deleteMany group.

## 7. Command Center / other-module impact

Additive only. Employer KPIs (`employerRegistrations` = count all), the demand pillar, and the employer leaderboard (`offersExtended`/`slotsFillRate`, status Active) are untouched; dashboard tests stay green. Re-verified in the E2E task (readiness 82 / matchReady 531).

## 8. Validation & Errors

Zod throughout: employer create/update (enums for industry/size/status; email format or empty); bulk `action ∈ {approve, disable}`; registration action = discriminated union (reject/request-changes accept optional text; move-drive requires a valid ObjectId; change-slot a non-empty string). Approve/reject/request-changes on a closed (Approved/Rejected) registration → 400 `{ code: 'validation' }`. Standard 401/404.

## 9. Testing (TDD)

- **Server**: employers list filter/sort/paginate; create/patch + audit actions; bulk approve/disable + reject `assign`; registrations list + counts; each of the five actions; **approve upserts only when absent** (creates for Vaultline-style newcomers; does NOT duplicate an existing employer, case-insensitive); closed-registration 400s; move-drive resolves + denormalizes; 404/401.
- **Client**: employers table renders a row (presentational test); approvals master-detail renders the seeded queue from a mocked response, selecting an item shows its detail, and an action (e.g. Approve) fires the mocked mutation and updates status.

## 10. File Structure Additions

```
server/src/
  models/Employer.ts                        # additive fields
  models/RegistrationRequest.ts             # new
  modules/employers/
    employers.schemas.ts employers.service.ts employers.controller.ts employers.routes.ts
  modules/registrations/
    registrations.schemas.ts registrations.service.ts registrations.controller.ts registrations.routes.ts
  seed/seed.ts                              # employer fields + 4 registrations
client/src/
  types/employers.ts                        # EmployerListItem, Registration, action payloads
  utils/pagerWindow.ts                      # lifted from Jobseekers (shared)
  pages/Employers/
    index.tsx EmployersToolbar.tsx EmployersTable.tsx BulkBar.tsx EmployerModal.tsx
    hooks/useEmployers.ts useEmployerMutations.ts
    approvals/ApprovalsPage.tsx ApprovalsList.tsx ApprovalDetail.tsx ActionModal.tsx
    approvals/hooks/useRegistrations.ts useRegistrationAction.ts
  App.tsx                                   # /employers + /employers/approvals routes
  components/Sidebar.tsx                    # Employers NavLink → /employers
```

## 11. Status Models

- **Employer**: `Pending` (default for new) → `Active` (approve) · any → `Disabled` · re-approve allowed. Same transitions as Institutes.
- **Registration**: `Pending review` → `Approved` | `Rejected` | `Changes requested`; `Changes requested` → any decision; `Approved`/`Rejected` are terminal for approve/reject/request-changes (400), but Move Drive / Change Slot remain allowed (prototype behavior).
