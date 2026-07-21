# Employer Portal — Slice 5a: Candidates + Passport (the `Application` backbone)

**Date:** 2026-07-20
**Status:** Approved
**Builds on:** Slices 1–4 (all merged to `main` @37e0878). This is the first sub-slice of the (decomposed) "Slice 5".
**Prototype:** `Matchday_Employer.html` — Screen 12 "Candidates" (markup ~3191, JS ~5528–5681), Screen 13 "Passport" (~3202, JS ~5695–5919). CSS already ported into `client/src/styles/employer.css` (`.cand*`/`table.cand`/`.match-ring`/`.pp-*`).

## Decomposition context

The original "Slice 5 (Candidates + Passport + Consent)" is too large for one spec — it bundles a net-new entity, read-side identity redaction (no precedent in the codebase), a match-scoring design, and TWO state machines (decision + consent) plus a cross-role candidate-side grant/deny that the jobseeker portal doesn't have. It is split:

- **5a (this spec)** — the `Application` entity + a **masked** candidate list + candidate passport + the decision (Shortlist/Hold/Reject) + private internal notes. Identity stays masked end-to-end.
- **5b (next)** — the consent / reveal-identity flow: the `waiting/interested/declined/expired` state machine, reminder/expiry, and the net-new jobseeker-side grant/deny.
- **Slice 6** — the shortlist workspace (bulk decide + package), already planned separately.

## Summary

A logged-in employer, for a drive they have an **Approved** registration for, views the candidate pool (eligible + Match-Ready jobseekers) with **identity fully masked**, opens a candidate **passport** (redacted profile + a derived match score + factor breakdown), and records a **decision** (Shortlist / Hold / Reject) and **private internal notes**. These decisions/notes persist as the net-new **`Application`** entity — the backbone six later pages share. Reached from a drive-detail "View candidates" CTA (gated on approval, mirroring Slice 4's "View slots").

**Decisions locked during brainstorming:**
1. **Application population** — the candidate list is **derived on read** (eligible ∩ Match-Ready jobseekers for the drive), LEFT-joined with `Application` rows; an `Application` row is created only when the employer acts on a candidate (decision or note). The pool stays derived-never-stored; `Application` = the funnel of *engaged* candidates.
2. **Match score** — a **derived, transparent** 0–100 score from the real fields (`cgpa`, `evaluationStatus`, `stage`), never stored; drives the sort, the Strong/Qualified pill, and the passport factor breakdown. No synthetic/random data.
3. **Passport / masking** — identity is **always masked** in 5a (candidate shown by a stable derived code; no name/email/phone/resume). The passport shows **real data only** (branch, gradYear, cgpa band, source, institute category, evaluationStatus, stage, the derived score + breakdown) + private internal notes. The prototype's fabricated per-round scores (MCQ/coding/TARA) and projects are **omitted** (no backing data).

## Non-goals (later slices)

- Consent / reveal-identity + the jobseeker-side grant/deny — 5b. **No identity is ever revealed in 5a.**
- Shortlist bulk workspace + "package" — Slice 6.
- Interviews / kanban / offers — Slices 7–9. No `stage` field on `Application` yet (kanban is Slice 8).
- Fabricated per-round scores / projects; a jobseeker skills array (the model has none); the full weighted match-explanation modal (5a shows an inline factor breakdown only).

## Architecture

### New model: `Application` (`server/src/models/Application.ts`)
```
employerId  ObjectId → Employer   (required; server-set from JWT, never the body)
driveId     ObjectId → Drive      (required; route param)
jobseekerId ObjectId → Jobseeker  (required)
decision    String enum ['Shortlisted','Hold','Rejected'] | null (default null)
notes       [{ text: String, by: String, at: Date }]  (default [])  — private, employer-team
```
`{ timestamps: true }`; unique compound index `(employerId, driveId, jobseekerId)`. Minimal by design — no `matchScore`/`stage` stored (score derived; kanban stage is Slice 8). Sparse: a row exists only for candidates the employer has acted on. Later slices extend this same doc.

### The candidate pool (derived, redacted)
For a drive, the pool = `Jobseeker`s where `isEligible(drive.eligibility, { branch, gradYear, source })` **and** `stage ∈ MATCH_READY_STAGES` (`['MatchReady','Shortlisted','Offer','Joined']`). Reuses `isEligible` (`seekerPortal.service.ts`) and the `stages` constant. The list left-joins this employer's `Application` rows (by jobseekerId) for `decision`/`noteCount`.

### Redaction discipline (the security crux)
A dedicated projection converts a `Jobseeker` doc → a **redacted candidate** that NEVER contains `name`, `email`, `passwordHash`, `phone`, institute name, or institute city:
```
RedactedCandidate {
  code: string          // stable derived id, e.g. `HH-<streamAbbrev>-<shortHash(jobseekerId)>`
  branch, gradYear, source
  cgpaBand: string      // e.g. "8.0–8.5" (floor to 0.5), not the exact value
  instituteCategory: string   // Institute.type only (name + city hidden)
  evaluationStatus, stage
  matchScore: number    // derived
  evalPill: 'Strong' | 'Qualified'
  decision: 'Shortlisted'|'Hold'|'Rejected'|null   // from the joined Application
  noteCount: number
}
```
The candidate `code` is derived deterministically from `jobseekerId` (a short non-reversible hash) + the drive's stream abbreviation, so the same candidate always shows the same code to the employer without exposing the ObjectId or any PII. The passport adds the score factor breakdown + the full `notes[]`, but still no identity.

### Derived match score
```
normCgpa   = clamp(cgpa / 10, 0, 1)
evalWeight = { completed: 1, pending: 0.5, na: 0.3, failed: 0 }[evaluationStatus] ?? 0.3
stageWeight= { Joined: 1, Offer: 0.9, Shortlisted: 0.8, MatchReady: 0.6 }[stage] ?? 0.5
matchScore = Math.round(100 * (0.5*normCgpa + 0.3*evalWeight + 0.2*stageWeight))
evalPill   = matchScore >= 80 ? 'Strong' : 'Qualified'
```
Documented weights, derived on read, never stored. The passport returns each factor's contribution (`normCgpa`, `evalWeight`, `stageWeight` and their weighted values) for an honest inline "why".

## Server — 4 endpoints on the existing `/employer` gate

All added to `employerPortalRoutes` under the existing `.use('/employer', requireAuth, requireRole('employer'))`. `employerId` is resolved from `req.userId` (JWT `sub`). Every endpoint is gated by `hasApprovedRegistration(employerId, driveId)` (reused from Slice 4) → else `400 registration_not_approved`. Admin `jobseekers`/`seekerPortal` modules are untouched. If the `employerPortal.service.ts` grows unwieldy, the candidate logic may live in a focused `employerCandidates.service.ts` (+ schema) mounted the same scoped way; default is to extend the existing module.

- **`GET /employer/drives/:id/candidates`** — the redacted pool for the drive. Query params: `q` (case-insensitive match over the candidate `code` + `branch`), `decision` (`Shortlisted|Hold|Rejected|undecided`), `evaluation` (`Strong|Qualified`). Sorted by `matchScore` desc. Returns `{ items: RedactedCandidate[] }`.
- **`GET /employer/drives/:id/candidates/:jobseekerId`** — the passport: the redacted candidate + the score factor breakdown + this employer's `Application` `decision` and `notes[]`. `404 not_found` if the jobseeker is not in this drive's eligible∩Match-Ready pool (no leak of arbitrary jobseekers; indistinguishable from a bad id).
- **`PUT /employer/drives/:id/candidates/:jobseekerId/decision`** — body `{ decision: 'Shortlisted'|'Hold'|'Rejected'|null }`. Verifies pool membership, then upserts the `Application` (sets `decision`); if `decision` is cleared to `null` **and** the Application has no notes, the row is deleted (keeps the collection sparse). Returns the updated redacted candidate.
- **`POST /employer/drives/:id/candidates/:jobseekerId/notes`** — body `{ text }` (non-empty). Verifies pool membership, upserts the `Application`, appends `{ text, by: <employer spoc/name>, at: now }` to `notes`. Returns the updated passport (or the notes array).

Cross-employer isolation: `Application` rows are always keyed by the auth'd `employerId`; another employer never sees a foreign decision/note. Pool membership is re-verified on the passport/decision/notes paths so an employer cannot fetch or annotate an arbitrary jobseeker outside their drive's pool.

## Client — pages, hooks, entry

- **Types** (`client/src/types/employer.ts`): `EmployerCandidate` (the `RedactedCandidate` shape), `CandidatePassport` (adds `factors` breakdown + `notes[]`), `CandidateDecision` (`'Shortlisted'|'Hold'|'Rejected'|null`).
- **Hooks** (`client/src/pages/EmployerPortal/hooks/useEmployerCandidates.ts`): `useEmployerCandidates(driveId, filters)` (key `['employer-candidates', driveId, q, decision, evaluation]`), `useCandidatePassport(driveId, jobseekerId)` (key `['candidate-passport', driveId, jobseekerId]`), `useCandidateMutations(driveId)` — `setDecision` / `addNote`, each invalidating the candidates list + the passport + `['employer-portal']`.
- **`EmployerCandidates`** (`/employer/drives/:id/candidates`, inside `EmployerShell`, no `.employer-app` re-wrap) — a privacy banner ("Names, contact details and resumes stay hidden"), search + evaluation filter + decision-filter chips, and the candidate table (masked code, match ring/score + pill, branch, gradYear, cgpa band, institute category, eval status, stage, current decision); per-row **Passport** link + Shortlist / Hold / Reject. Loading/empty/error states.
- **`EmployerCandidatePassport`** (`/employer/drives/:id/candidates/:jobseekerId`) — redacted header (code + "Identity hidden — redacted passport"), the real facts grid, the derived score + factor breakdown, decision buttons, and the private internal-notes composer + list. Loading/error/404 states.
- **Entry + nav**: a **"View candidates"** CTA on `EmployerDriveDetail` (enabled only when `useEmployerRegistrations()` has an `Approved` item for the drive — same gate pattern as Slice 4's "View slots") → `/employer/drives/:id/candidates`. Routes added in `App.tsx`. The sidebar **"Candidates"** nav item (currently `/employer/coming-soon/candidates`) repoints to the drives list `/employer/drives` (candidates are viewed per-drive — pick a drive first). Reuses the ported `.cand*`/`.pp-*` CSS; field validation (note composer) uses the `.show-err` convention.

## Error handling

`{ error: { message, code } }` throughout. zod → `400 validation`; `requireRole` → `403`; no token → `401`; missing approved registration → `400 registration_not_approved`; a jobseeker outside the drive's pool (or a bad id, or another employer's data) → `404 not_found` (no enumeration oracle). **PII masking is enforced server-side in the projection** — the client never receives identity fields; a server test asserts their absence.

## Testing

### Server
- New model test (`Application.model.test.ts`): the unique `(employerId, driveId, jobseekerId)` index rejects a duplicate.
- Route test (`employer-candidates.route.test.ts`):
  - `GET candidates` returns a **redacted** projection — assert each item has `code` and does **NOT** contain `name`/`email`.
  - The pool is exactly eligible ∩ Match-Ready — a non-eligible jobseeker and a non-Match-Ready jobseeker are both excluded; an eligible+ready one is included.
  - Gated on an Approved registration → `400 registration_not_approved` without one (a Pending reg does not unlock it).
  - Sorted by `matchScore` desc; the `decision`/`evaluation` filters narrow correctly.
  - `matchScore` is deterministic for a fixed jobseeker (assert the formula's output).
  - `GET passport` → `404` for a jobseeker not in the pool; returns the factor breakdown + `notes`.
  - `PUT decision` upserts the `Application` (row created), is employer-scoped (employer B does not see employer A's decision on the same candidate), and deleting the decision (`null`) with no notes removes the row.
  - `POST notes` appends a note; another employer's list/passport never shows it.
  - `401` no token / `403` admin token.

### Client (`EmployerCandidates.test.tsx`, `EmployerCandidatePassport.test.tsx`)
- The list renders masked rows (the `code`, never a name); the decision filter chip narrows; a per-row Shortlist click fires the decision mutation.
- The passport renders the redacted header + facts + score breakdown + notes; adding a note fires the mutation; the note composer blocks an empty submit with `.show-err`.
- The drive-detail "View candidates" CTA is disabled without an Approved registration and enabled + routes with one.

## Verification

Full server + client suites green, both `tsc --noEmit` clean, client build OK. Live E2E on an isolated DB (`matchday_employer5a_smoke`, dropped after; shared `matchday` untouched): an employer with an approved registration → `GET candidates` returns only eligible+Match-Ready jobseekers, **redacted** (no PII in the payload); a decision persists an `Application` and is visible only to that employer; a note appends; a passport for a non-pool jobseeker → 404; admin token → 403.

## Follow-ups / known stubs

- The candidate `code`, cgpa **band**, and institute **category** are the anonymity surface; a specific rare institute category could in principle narrow identity, but no name/city/email is ever exposed.
- The match score is intentionally thin (only `cgpa`/`evaluationStatus`/`stage` exist as real signals — no skills array, no per-round scores); it is honest and derived, not a fabricated fit score.
- `Application` carries only `decision` + `notes` now; 5b adds a consent sub-state, Slice 8 a kanban stage, Slice 9 offer data — all on this same doc.
