# Employer Portal — Slice 6: Shortlist Workspace

**Date:** 2026-07-21
**Status:** Approved
**Builds on:** Slice 5a (`Application` entity + `decision` field + redacted candidate pool) and Slice 5b (consent/reveal + the consent page). **Stacked** on `feat/employer-portal-slice5b` (main←5a←5b←6); the PR bases on the 5b branch and retargets down the stack as #25/#30 merge.
**Prototype:** `Matchday_Employer.html` — Screen 15 "Shortlist workspace" (markup ~3211, JS ~6016–6232). CSS already ported into `client/src/styles/employer.css` (`.bulk-bar`, `.cand-*`, `.status-pill`, `.deadline-banner`). The prototype's Skills/Notice/Availability/Location columns are fabricated — omitted here (real redacted fields only, per 5a/5b).

## Summary

A per-drive **bulk action center** over the same redacted candidate pool: multi-select candidates and **bulk shortlist / hold / reject**, see a live **decision summary** (All / Shortlisted / Hold / Rejected / Undecided), read an **informational "shortlisting closes" deadline** (24h before the drive's event date), **download a redacted shortlist pack** (CSV with internal notes), and jump to the 5b **consent** page. No new entity — it drives 5a's `Application.decision`.

**Decisions locked during brainstorming:**
1. **Git base** — stacked on `feat/employer-portal-slice5b` (3-level stack); same pattern as 5b-on-5a.
2. **Bulk decision writes 5a's `decision`** — no `Shortlist` collection (the decision field already is the shortlist state). Bulk is **non-null only** (`Shortlisted`/`Hold`/`Rejected`); clearing a decision stays the single-candidate 5a path.
3. **Shortlist pack = JSON endpoint + client-side CSV** — matches the 5 existing client-side CSV exporters (Jobseekers/Drives/Employers/Streams/Eval-monitor) and keeps the API JSON-only (`apiFetch` always parses JSON). A raw-CSV server response was rejected as the first non-JSON endpoint.
4. **Pack stays fully redacted** — no name/email even for consented candidates (a downloadable file with names is a bigger leak surface); it carries `consentStatus` so the employer knows who to chase and can get identities from the consent page.
5. **Deadline is informational only** — derived client-side from the drive's event date − 24h; no server-enforced write lock.

## Non-goals (later slices / deliberate)
- Revealing consented identities inside the pack (kept redacted; a consented-identity pack is a possible later follow-up).
- Enforcing the deadline as a write lock (display-only this slice).
- Interviews / kanban / offers — Slices 7–9.
- A `Shortlist`/`Package` entity — none; the pack is a stateless read.

## Architecture

No new model. Two endpoints on the existing `.use('/employer', requireAuth, requireRole('employer'))` gate, each gated by `hasApprovedRegistration(employerId, driveId)` and scoped to the drive's pool (reusing 5a's `requirePoolMember`/`poolSeekers`/`isEligible`). A focused `employerShortlist.service.ts` (+ controller) holds both, mounted the same scoped way; `employerCandidates.service.ts` is reused, not extended.

### Bulk decision
- **`POST /employer/drives/:id/candidates/bulk-decision`** — body `{ jobseekerIds: string[] (1..500), decision: 'Shortlisted'|'Hold'|'Rejected' }` (zod; `decision` non-null). Steps: gate → compute the drive's eligible∩Match-Ready pool → intersect `jobseekerIds` with the pool's ids → `Application.bulkWrite` of `updateOne({ employerId, driveId, jobseekerId }, { $set: { decision }, $setOnInsert: { employerId, driveId, jobseekerId } }, { upsert: true })` for each valid id → return `{ updated: <count of valid ids> }`. Non-pool / unknown ids are silently skipped (no enumeration oracle; the count reflects only valid ones). `notes` and `consent` on existing rows are untouched (a later decision change never revokes consent — 5b invariant). `employerId` from `req.userId`, never the body.

### Shortlist pack (JSON; client renders CSV)
- **`GET /employer/drives/:id/shortlist/pack`** — returns
```
{
  driveName: string,
  generatedAt: string (ISO),
  items: [{
    code, matchScore, evalPill, branch, gradYear, cgpaBand,
    instituteCategory, stage,
    consentStatus: 'requested'|'granted'|'declined'|'expired'|'none',
    notes: string[]   // note TEXT only (the crux the list lacks)
  }]
}
```
for this employer's candidates whose `Application.decision === 'Shortlisted'` **and** who are still in the pool. **Fully redacted** — no `name`/`email`/institute name/city (a server test asserts their absence). `consentStatus` derives from the consent sub-doc via 5b's `consentBlock`/`isExpired` (`granted`/`declined`/`requested`/derived `expired`, else `none`). Sorted by `matchScore` desc.

### Deadline (client-derived, no server change)
The workspace reads `useEmployerDrive(driveId)` (5a) → the earliest **upcoming** `eventDate`; the deadline = that date − 24h. Rendered as a banner + countdown with urgency (crit <24h / warn <48h / ok). If no upcoming event date, the banner shows "No slot scheduled yet — shortlisting stays open." Purely informational.

## Client — pages, hooks, entry

- **Hooks** (`hooks/useEmployerShortlist.ts`): `useBulkDecision(driveId)` — `mutate({ jobseekerIds, decision })` → `POST bulk-decision`, invalidating `['employer-candidates', driveId]` + `['employer-portal']`. `fetchShortlistPack(driveId, token)` — a plain token'd `apiFetch` GET returning the pack JSON (used by the download handler; no query cache needed).
- **`EmployerShortlist`** (`/employer/drives/:id/shortlist`, inside `EmployerShell`, `.page-wrap`, no `.employer-app` re-wrap) — loads the **full** pool via `useEmployerCandidates(driveId, {})` (unfiltered, so summary counts are stable), then client-side: the deadline banner; a toolbar (search over code/branch, evaluation `<select>`, "Download shortlist pack", "Consent status" → `/employer/drives/:id/consent`); **summary chips** All/Shortlisted/Hold/Rejected/Undecided (derived counts; click filters the view); a **bulk bar** ("N selected · Bulk shortlist · Bulk hold · Bulk reject · Clear") shown when ≥1 row is selected; a table with a select-all + per-row checkbox, masked code, match ring + eval pill, branch·gradYear·cgpaBand, current decision, consent status, and per-row **Passport** + single Shortlist/Hold/Reject (reusing 5a's `useCandidateMutations`). Decision-chip + search + evaluation filtering is client-side (counts stay over the full pool — deliberately avoiding the 5b "gate-on-the-filtered-list" trap). Loading/empty/error states. The pack download builds the CSV in-browser (Blob + object URL + `a.download`, exactly like the 5 existing exporters) with a redacted header line and one row per shortlisted candidate (code, match, evaluation, branch, gradYear, cgpaBand, institute category, stage, consent status, notes joined by " | ").
- **Entry + nav**: a **"Shortlist workspace"** CTA on `EmployerCandidates` → `/employer/drives/:id/shortlist`; route added to `App.tsx`. Reuses the ported `.bulk-bar`/`.cand-*`/`.status-pill`/`.deadline-banner` CSS.

## Error handling
`{ error: { message, code } }` throughout. zod → `400 validation`; role guards → `401`/`403`; missing approved registration → `400 registration_not_approved`; a bad drive id → `404 not_found`. Bulk decision with an empty `jobseekerIds` or a bad `decision` → `400 validation`. Non-pool ids are not an error — they are skipped and excluded from `updated`. The pack for a drive with no shortlisted candidates → `200` with `items: []`.

## Testing

### Server (`employer-shortlist.route.test.ts`)
- **bulk-decision**: upserts `decision` for pool members (a new `Application` row is created; an existing row's `decision` is updated and its `notes`/`consent` preserved); a non-pool / unknown id in the array is skipped and not counted in `updated`; gated on an Approved registration (Pending → `400 registration_not_approved`); `400` on empty ids / bad decision; employer-scoped (employer B's rows untouched); `401`/`403`.
- **pack**: returns only `decision==='Shortlisted'` candidates, **redacted** — assert each item has `code` and the raw JSON does NOT contain a seeded jobseeker's real name/email or the institute name/city; note *text* is present; `consentStatus` reflects a granted/declined/requested/expired consent (derived) and `none` otherwise; empty `items` for a drive with no shortlist; gated; `401`/`403`.

### Client (`EmployerShortlist.test.tsx`)
- Renders the pool with stable summary counts; selecting rows + "Bulk shortlist" fires `useBulkDecision` with the selected ids + `Shortlisted`; a decision chip filters the visible rows without changing the counts; the deadline banner renders from a drive event date (and the "No slot scheduled yet" fallback); the "Consent status" CTA routes to the consent page; the pack download handler calls the pack endpoint and produces CSV text (assert the fetch fires + a redacted header row; no real name in the output).

## Verification
Full server + client suites green, both `tsc --noEmit` clean, client build OK. Live E2E on an isolated DB (`matchday_employer6_smoke`, dropped after; shared `matchday` untouched): an employer with an approved registration bulk-shortlists 3 pool candidates → the summary counts move and `updated:3`; `GET shortlist/pack` returns exactly those 3, **redacted** (grep the payload — a seeded real name is ABSENT) with note text + `consentStatus`; a non-pool id in a bulk call is ignored (`updated` excludes it); employer B (approved for the same drive) sees none of A's decisions; admin token → 403; a `Hold`/`Reject` bulk on already-shortlisted candidates flips them and the pack shrinks accordingly.

## Follow-ups / known stubs
- The pack is redacted-only; a "reveal consented identities in the pack" option is deferred (privacy-conservative default).
- The deadline is informational; no write lock. If shortlisting must hard-close, that is a later, separate change (introduces time-based write gating not present elsewhere).
- Bulk clear-to-null is intentionally unsupported (single-candidate clear via 5a keeps the consent-aware delete guard in one place).
- Search/evaluation/decision filtering is client-side over the full pool (fine at prototype scale; the pool is already the eligible∩Match-Ready set). Revisit if pools grow large.
