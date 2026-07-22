# Employer Portal — Slice 10: Reports & Analytics

**Date:** 2026-07-21
**Status:** Approved
**Builds on:** 5a (pool + `Application` decision), 5b (consent), 6, 7 (`Interview`), 8 (kanban `deriveStage`), 9 (`Application.offer`). **Stacked** on `feat/employer-portal-slice9` (main←7←8←9←10); the PR bases on the 9 branch and retargets down the chain as #32/#33/#34 merge.
**Prototype:** `Matchday_Employer.html` — Screen 22 "Reports & analytics" (markup ~3287, JS `computeReport`/`renderReports`/`downloadReport` ~7130–7247). CSS already ported (`.kpi`/`.kpi-grid`/`.rep-2col`/`.rep-funnel`/`.rf-row`/`.rf-l`/`.rf-track`/`.rf-right`/`.rf-v`/`.rf-conv`).

## Scope note (decomposition)
The original "Slice 10" bundled four independent subsystems (Notifications, Reports, Team-access/RBAC, Support). Per brainstorming, only **Reports** is built here — it is self-contained, derived, and needs no new entity or auth change. **Notifications** (net-new entity + event hooks), **Team-access/RBAC** (an auth/identity change — one login per employer today), and **Support** (thin; FAQ is static on the public landing) are deferred to their own future slices.

## Summary

A **read-only analytics** page for the employer: a hiring **funnel** (Recommended → Shortlisted → Confirmed → Interviewed → Offered → Accepted → Joined, with per-stage conversion) and headline **KPIs**, for a single drive or aggregated across the employer's drives. Everything is **derived** from data we already have — no new entity, no writes, and (being pure counts) **no PII in the payload**.

**Decisions locked during brainstorming:**
1. **Scope = Reports only** (the other three surfaces are separate future slices).
2. **Git base** — stacked on `feat/employer-portal-slice9`.
3. **Real counts only** — the prototype's "Top skills" (no jobseeker skills array exists) and its synthetic "interviews attended / no-show" metric are **dropped as fabricated**.
4. **Top-level `/employer/reports`** with an All-drives / per-drive selector (not a per-drive route).

## Non-goals (deliberate)
- Top-skills breakdown (no skills data on the model) and an "attended/no-show" metric (no attendance data) — omitted.
- Notifications / Team-access (RBAC) / Support — separate future slices.
- Any new entity or write path; any PII in the report (pure aggregate counts).
- Charting libraries — the funnel is CSS bars (ported), like the prototype.

## Architecture

No new model. One derived endpoint + one page.

### Server — 1 endpoint (top-level, on the existing `/employer` gate)
- **`GET /api/me/employer/reports?driveId=<id|all>`** (default `all` when omitted). In a focused `employerReports.service.ts` (+ controller + schema); `employerId` from `req.userId`.
  - **Scope resolution:** `driveId=<id>` → gated by `hasApprovedRegistration(employerId, driveId)` (else `400 registration_not_approved`; invalid/unknown id → `404 not_found`); computes over that one drive. `driveId=all` → the set of drives the employer has an **Approved** `RegistrationRequest` for (`RegistrationRequest.find({employerId, status:'Approved'}).distinct('driveId')`); computes each and sums.
  - **Per-drive computation** (reuses `poolSeekers`, `deriveStage`, `candidateScore`; loads this employer's `Application`s for the pool + the set of jobseekerIds with a non-`Cancelled` `Interview`):
    - For each pool candidate, `effectiveStage = app.stage ?? deriveStage(decision, consentStatus, hasInterview, offerStatus)`; `flowIdx = KANBAN_ORDER.indexOf(effectiveStage)` (terminal `Rejected`/`Withdrawn` → `-1`, so they count only toward Recommended).
    - **The funnel is defined on ONE basis — the effective-stage flow index — so it is monotonic by construction** (higher threshold ⇒ fewer): `Recommended` = pool size; `Shortlisted` = count(`flowIdx ≥ idx('Shortlisted')`); `Confirmed` = count(`flowIdx ≥ idx('Candidate Confirmed')`); `Interviewed` = count(`flowIdx ≥ idx('Scheduled')`); `Offered` = count(`flowIdx ≥ idx('Offer Sent')`); `Accepted` = count(`flowIdx ≥ idx('Offer Accepted')`); `Joined` = count(`flowIdx ≥ idx('Joined')`). So `conversionPct` is always ≤ 100. (The funnel = *current* pipeline position, so a declined offer counts as Withdrawn — not at "Offered".)
    - `scoreSum` = Σ `candidateScore(...)` over the pool (for the avg).
  - **Response:**
    ```
    {
      scope: 'all' | '<driveId>',
      drives: [{ id, name }],              // the employer's Approved-registration drives (for the selector)
      funnel: [ { stage, count, conversionPct } … 7 stages ],   // conversionPct = round(count/prevCount*100); first = 100
      kpis: {
        recommended,         // = funnel Recommended (pool size)
        shortlisted,         // = funnel Shortlisted (flow-index based)
        interviewsScheduled, // REAL cumulative: total non-Cancelled Interview count across the scope
        offersSent,          // REAL cumulative: count(offer.status ∈ Sent/Accepted/Declined/Joined) — INCLUDES declined
        offersAccepted,      // REAL cumulative: count(offer.status ∈ Accepted/Joined)
        dropOffPct,          // recommended>0 ? round((shortlisted - offersAccepted)/shortlisted*100) : 0
        avgMatchScore        // recommended>0 ? round(scoreSum/recommended) : 0
      }
    }
    ```
    KPIs `interviewsScheduled`/`offersSent`/`offersAccepted` are **real cumulative counts** (e.g. `offersSent` includes declined offers), deliberately distinct from the funnel's *current-position* counts (where a declined offer sits in Withdrawn). No identity/PII anywhere — only counts.
  - Empty scope (no approved drives / empty pool) → all-zero funnel + kpis (200, not an error).

### Cross-slice notes
Reuses `poolSeekers`, `candidateScore`, `hasApprovedRegistration`, `KANBAN_ORDER`/`deriveStage`; reads `Application`/`Interview`/`RegistrationRequest`/`Drive`. Reads only — modifies nothing. Admin modules untouched.

## Client — page, hook, nav
- **Types** (`client/src/types/employer.ts`): `ReportFunnelStage` (`{ stage, count, conversionPct }`), `EmployerReport` (`{ scope, drives:[{id,name}], funnel:[], kpis:{…} }`).
- **Hook** (`hooks/useEmployerReports.ts`): `useEmployerReports(driveId)` (key `['employer-reports', driveId]`, `keepPreviousData`).
- **`EmployerReports`** (`/employer/reports`, in `EmployerShell`, `.page-wrap`) — a drive `<select>` (**All drives** + each `report.drives` entry); a **KPI grid** (recommended, shortlisted, interviews scheduled, offers sent, offers accepted, drop-off %, avg match score) using ported `.kpi`; a **hiring-funnel** panel (ported `.rep-funnel`/`.rf-row`: label, bar width = count/maxCount, count, "% of prev") ; and an **Export report** CSV button (client-side Blob, matching the existing exporters). Loading/empty/error states.
- **Nav/entry**: a **"Reports"** link — added to the `EmployerShell` sidebar nav (the prototype has a Reports item) — routing to `/employer/reports`; plus the route in `App.tsx`. (Confirm the shell nav structure during implementation; if it isn't easily extensible, add a dashboard CTA as a fallback.)

## Error handling
`{ error: { message, code } }`. zod (bad `driveId` format for a specific id) → the service treats a non-`all`, non-ObjectId value as `404 not_found`; role guards → `401`/`403`; a specific drive without an approved registration → `400 registration_not_approved`. `driveId=all` with no approved drives → `200` with zeroed data.

## Testing

### Server (`employer-reports.route.test.ts`)
- Seed one drive with a spread of Applications (a shortlisted-only, a consent-granted, one with an interview, one offered, one accepted, one joined) → assert the funnel counts + `conversionPct` + the KPIs (`recommended`/`shortlisted`/`interviewsScheduled`/`offersSent`/`offersAccepted`/`dropOffPct`/`avgMatchScore`) match the derivation.
- `driveId=all` aggregates across two approved drives (sums funnel + KPIs).
- A specific drive without an approved registration → `400 registration_not_approved`; an unknown/invalid driveId → `404`.
- Employer-scoped: employer B's Applications/interviews/offers are not counted in employer A's report.
- **No PII**: assert the serialized payload contains no seeded jobseeker name/email.
- `401` no token / `403` admin token.

### Client (`EmployerReports.test.tsx`)
- Renders the KPI grid + funnel bars from a mocked report; the drive selector switches the query (fires a fetch with the new `driveId`); the Export button triggers CSV generation (stub `URL.createObjectURL`); empty state when the funnel is all zeros.

## Verification
Full server + client suites green, both `tsc --noEmit` clean, client build OK. Live E2E on an isolated DB (`matchday_employer10_smoke`, dropped after; shared untouched): an employer with an approved registration + a spread of Applications/interviews/offers → `GET reports?driveId=<id>` returns the expected funnel + KPIs (verify a few counts against the seed); `driveId=all` sums across the employer's approved drives; the payload contains **no** seeded name/email; a non-approved drive → `registration_not_approved`; employer B's data is excluded; admin → 403; shared `matchday` untouched.

## Follow-ups / known stubs
- Top-skills + attendance metrics are omitted (no backing data); if a skills array / attendance tracking is ever added, the report can grow.
- `interviewed` counts candidates with any non-cancelled interview; a richer "attended vs scheduled" split awaits real attendance data.
- The report is recomputed on read (no caching/materialization) — fine at prototype scale; a later optimization if drives/pools grow large.
- Notifications, Team-access (RBAC), and Support remain as future slices.
