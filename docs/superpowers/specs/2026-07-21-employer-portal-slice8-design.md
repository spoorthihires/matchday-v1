# Employer Portal — Slice 8: Kanban Pipeline

**Date:** 2026-07-21
**Status:** Approved
**Builds on:** 5a (`Application` + candidate pool), 5b (consent), 6 (shortlist/decision), 7 (`Interview`). **Stacked** on `feat/employer-portal-slice7` (main←7←8); the PR bases on the 7 branch (or `main` if #32 has merged) and the diff is Slice-8-only.
**Prototype:** `Matchday_Employer.html` — Screen 18 "Employer Kanban" (markup ~3265, JS ~6565–6700). CSS already ported into `client/src/styles/employer.css` (`.kanban-board`/`.kanban-col`/`.kcol-*`/`.kcard`/`.kc-*`/`.kdot`/`.kbtn`). The prototype's feedback modal + drag-and-drop are out of scope this slice (see non-goals).

## Summary

A per-drive **private hiring pipeline board**: the eligible ∩ Match-Ready pool laid out across 13 stage columns, each card positioned by an **effective stage** derived from the existing signals (decision 5a / consent 5b / interview 7) unless the employer has explicitly **pinned** it by moving the card. Moving a card (advance / back / reject / restore) stores a `stage` on the `Application`. Identity is revealed on a card only when the candidate has consented (5b).

**Decisions locked during brainstorming:**
1. **Git base** — stacked on `feat/employer-portal-slice7` (main←7←8).
2. **Stage model** — a nullable `Application.stage`, **derived-until-moved**: `effectiveStage = app.stage ?? deriveStage(...)`. Moving **stores** `stage`; it does **not** mutate `decision`/`consent`/`interview` (one-way seed).
3. **Full prototype stage set** — Offer Sent / Offer Accepted / Joined ship as plain stage labels now; Slice 9 adds the offer entity + actions behind them.
4. **Buttons, not drag-and-drop** — advance/back/reject/restore (robust + testable); native HTML5 DnD is a follow-up.

## Non-goals (later slices / deliberate)
- The Offer entity + offer actions behind the offer stages — Slice 9.
- Round-stage interview **feedback / scorecards** (the prototype's feedback modal) — deferred.
- Native drag-and-drop (buttons this slice).
- The board never mutates `decision`/`consent`/`interview` (stage is a one-way-seeded overlay).
- No new "Recommended-column pagination"/windowing (the board shows the whole pool; the Recommended column may be large — acceptable at prototype scale).

## Architecture

### `Application.stage` (new field)
```
stage: String enum
  ['Recommended','Shortlisted','Candidate Confirmed','Scheduled',
   'L1','L2','L3','HR','Offer Sent','Offer Accepted','Joined',
   'Rejected','Withdrawn'] | null   (default null)
```
`null` = derive on read. Set = employer-pinned. Added to the 5a `Application` doc alongside `decision`/`notes`/`consent`.

### Derivation (shared helper `deriveStage`)
```
const STAGE_ORDER = ['Recommended','Shortlisted','Candidate Confirmed','Scheduled',
  'L1','L2','L3','HR','Offer Sent','Offer Accepted','Joined'];   // linear flow
const STAGE_TERMINAL = ['Rejected','Withdrawn'];

deriveStage(app, hasInterview):
  consent === 'granted' → hasInterview ? 'Scheduled' : 'Candidate Confirmed'
  consent === 'declined' → 'Withdrawn'
  decision === 'Shortlisted' → 'Shortlisted'
  decision === 'Rejected' → 'Rejected'
  else → 'Recommended'         // Hold / null / no Application
```
`effectiveStage(app, hasInterview) = app?.stage ?? deriveStage(app, hasInterview)`. `hasInterview` = a non-`Cancelled` `Interview` exists for `(employerId, driveId, jobseekerId)` (7). The set of stages, the linear order, and the terminal set live in a shared constant module reused by client + server where practical (server owns the enum + derivation; the client mirrors the order/terminal for the move buttons).

### Server — 2 endpoints (existing `/employer` gate + `hasApprovedRegistration`)
A focused `employerBoard.service.ts` (+ controller + schema), mounted the same scoped way; `employerId` from `req.userId`.

- **`GET /employer/drives/:id/board`** — the pool as cards. Loads: `poolSeekers(drive)` (5a, non-identity fields); this employer's `Application`s (`decision`/`consent`/`stage`) keyed by jobseekerId; the set of jobseekerIds with a non-`Cancelled` `Interview` for the drive; and, for consent-granted candidates only, the revealed identity (reuse 5a's granted-only load). Each card: `{ jobseekerId, code, matchScore, evalPill, stage (effective), decision, consentStatus, revealed: { name, email } | null }`. Returns `{ items }` sorted by `matchScore` desc (client groups by stage).
- **`PATCH /employer/drives/:id/candidates/:jobseekerId/stage`** — body `{ stage }` (zod: must be one of the 13 enum values). `requirePoolMember` (404 no-oracle for out-of-pool/bad id). **Upserts** the `Application` `(employerId, driveId, jobseekerId)` and sets `stage` — a pure-pool candidate with no Application row gets one created with `stage` set and `decision` left `null`. Returns the updated card (same projection as a board item, incl. reveal). Free-form: any valid stage → any valid stage; the client composes advance/back/reject/restore.

### Cross-slice notes
Reuses `poolSeekers`, `requirePoolMember`, `hasApprovedRegistration`, `candidateScore`, `cgpaBand`, `codeFor`, `consentBlock`, and the granted-only identity load pattern. Reads `Interview` (7) but does not modify it; reads `decision`/`consent` but never writes them from the board. Admin modules untouched.

## Client — page, hooks, entry
- **Types** (`client/src/types/employer.ts`): `BoardCard` (the projection), `BoardStage` (the union), `KANBAN_ORDER`/`KANBAN_TERMINAL` constants for the move buttons.
- **Hooks** (`hooks/useEmployerBoard.ts`): `useEmployerBoard(driveId)` (key `['employer-board', driveId]`), `useMoveStage(driveId)` (`mutate({ jobseekerId, stage })` → the stage PATCH; invalidates `['employer-board', driveId]` + `['employer-candidates', driveId]` + `['employer-portal']`).
- **`EmployerKanban`** (`/employer/drives/:id/board`, in `EmployerShell`, `.page-wrap`) — a privacy banner + an "Interviews" link; then the 13-column board (`.kanban-board`). Each column: a colored dot + label + count + its cards. Each card: the revealed name (consent granted) or masked code + "identity hidden", a match-score chip, and move controls — **◀ / ▶** (back/advance along `KANBAN_ORDER`, disabled at the ends), **Reject** (→ `Rejected`), and, on a terminal card, **Restore** (→ `Recommended`). Reuses ported `.kcard`/`.kc-*`/`.kdot`/`.kbtn` CSS. Loading/empty/error states; errors surfaced (mutation `role="alert"`).
- **Entry + nav**: a **"Pipeline board"** CTA on `EmployerCandidates` (alongside the others) → `/employer/drives/:id/board`; route in `App.tsx`.

## Error handling
`{ error: { message, code } }` throughout. zod → `400 validation` (incl. an invalid `stage` value); role guards → `401`/`403`; missing approved registration → `400 registration_not_approved`; out-of-pool/bad id → `404 not_found` (no oracle). The stage PATCH creating an Application for a pure-pool candidate is not an error.

## Testing

### Server (`employer-board.route.test.ts`)
- **board**: effective-stage derivation — a shortlisted-no-consent candidate → `Shortlisted`; a granted candidate with a non-cancelled interview → `Scheduled`, without one → `Candidate Confirmed`; a declined-consent candidate → `Withdrawn`; an undecided pool candidate → `Recommended`; a **pinned** `stage` (e.g. `L2`) overrides the derivation. Identity revealed only when granted (assert no name/email for a non-granted card; present for a granted one). Gated on an approved registration; employer-scoped (employer B's stages/reveals absent); `401`/`403`.
- **stage PATCH**: sets `stage` on an existing Application; **creates** an Application (with `decision:null`) for a pure-pool candidate then sets `stage`; a subsequent board read reflects the pinned stage; rejects an invalid `stage` value (`400 validation`); out-of-pool/bad id → `404`; employer-scoped; does NOT change `decision`/`consent`.

### Client (`EmployerKanban.test.tsx`)
- The board renders the stage columns and places a card in its (derived) column; **Advance** on a card fires `useMoveStage` with the next stage in the order; **Reject** fires with `Rejected`; a granted card shows the revealed name while a masked card shows its code; the empty state shows when the pool is empty.

## Verification
Full server + client suites green, both `tsc --noEmit` clean, client build OK. Live E2E on an isolated DB (`matchday_employer8_smoke`, dropped after; shared `matchday` untouched): an employer with an approved registration + a pool → `GET board` places candidates by derived stage (shortlisted→Shortlisted, granted+interview→Scheduled, declined→Withdrawn, undecided→Recommended); `PATCH stage` to `L2` pins a card and a re-read shows it in `L2` (while its `decision` is unchanged); an invalid stage → 400; a pure-pool candidate PATCH creates the Application; employer B sees none of A's pins/reveals; admin → 403; shared DB untouched.

## Follow-ups / known stubs
- The board's `stage` overlay can intentionally diverge from the 5a `decision` once pinned (no two-way sync, by design); a future reconciliation/display note could surface both.
- Offer Sent / Offer Accepted / Joined are stage labels only until Slice 9 wires the Offer entity (and may then derive those columns).
- Round-stage feedback/scorecards and native drag-and-drop are deferred.
- The whole eligible∩Match-Ready pool renders (Recommended may be large); windowing/filtering is a later concern.
