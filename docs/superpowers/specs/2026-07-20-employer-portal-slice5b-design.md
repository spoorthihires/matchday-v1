# Employer Portal — Slice 5b: Consent / Reveal-Identity

**Date:** 2026-07-20
**Status:** Approved
**Builds on:** Slice 5a (`Application` entity + redacted candidate pool/passport). 5a is on **PR #25 (open, not yet merged)**; 5b is **stacked** on `feat/employer-portal-slice5a` and its PR retargets to `main` once #25 merges.
**Prototype:** `Matchday_Employer.html` — Screen 16 "Candidate consent status" (markup ~3225, JS ~6259–6360). CSS already ported into `client/src/styles/employer.css` (`.reveal`/`.rn`/`.re`/`.resp-pill.declined`/`.cand-anon`). The prototype is **employer-only and fakes the candidate response** (`seedConsent`, `revealFor` generate fake names) — 5b makes the jobseeker response **real**.

## Summary

The second half of the original "Slice 5". For a candidate the employer has **Shortlisted** (5a decision), the employer sends a **reveal request**; the candidate (jobseeker) **grants or denies** it; identity is revealed to that employer **only** on grant. This is the consent state machine (`requested → granted | declined`, with a derived `expired`) layered onto the same `Application` doc, plus the **net-new jobseeker-side grant/deny** the prototype never had.

**Decisions locked during brainstorming:**
1. **Git base** — stacked on `feat/employer-portal-slice5a` (retarget PR to `main` after #25 merges); same precedent as slice 2 on slice 1.
2. **Jobseeker-side is API-only** — 5b ships the jobseeker consent **endpoints** (in `seekerPortal`) + the full **employer-side UI**. The jobseeker-**facing** UI is left to the user's parallel `feat/jobseeker-portal` effort. `client/src/pages/Portal/` is **not touched** (zero collision).
3. **Consent trigger** — an **explicit** per-candidate "Request reveal" action (enabled only for Shortlisted candidates). NOT auto-on-shortlist (would retroactively change 5a's decision path and reveal-request everyone).
4. **Consent state on `Application`** — a `consent` sub-doc; `expired` is **derived on read**, never stored (no cron; race-free; matches the codebase's derived-never-stored ethos).
5. **Reveal set = real data only** — `name`, `email`, institute `name` + `city`. The Jobseeker model has **no phone and no resume**; the prototype's repo/resume links were fabricated and stay out.
6. **Terminal states** — `granted` and `declined` are terminal (no re-request) to prevent reveal-request spam. `withdraw` is allowed only while `requested`/expired.

## Non-goals (later slices / parallel work)
- The jobseeker-**facing** consent UI (owned by the parallel `feat/jobseeker-portal` branch). 5b provides the API only.
- Shortlist bulk workspace + "package" — Slice 6. (5b acts on the per-candidate 5a Shortlist decision.)
- Interviews / kanban / offers — Slices 7–9. No `stage`/`offer` on `Application` yet.
- Notifications/email — no real notification channel; a reveal request is surfaced via the jobseeker API (polled by their portal), not emailed. Reminder updates timestamps only.
- Touching the global `Jobseeker.consent` (Granted/Pending/Revoked) — that is a distinct platform-level field; 5b's consent is per-(employer × drive × candidate).

## Architecture

### `Application.consent` sub-doc (`server/src/models/Application.ts`)
```
consent: {
  status:       String enum ['requested','granted','declined']   // absent/undefined = never requested
  requestedAt:  Date
  expiresAt:    Date         // requestedAt + REVEAL_EXPIRY_HOURS; re-armed by a reminder
  respondedAt:  Date | null  (default null)
  remindedAt:   Date | null  (default null)
}   // { _id: false }, the whole sub-doc default undefined
```
`REVEAL_EXPIRY_HOURS = 48` (a documented constant). `expired` is **not** a stored status — it is derived: `status === 'requested' && now > expiresAt`. Consent is per-(employer × drive × candidate), keyed by the same unique index as 5a. Distinct from the global `Jobseeker.consent`.

### Reveal gating (the security crux)
5a's redacted projection still NEVER emits identity by default. 5b adds an **additive, consent-gated** layer. A new helper `revealedIdentity(app, seeker, institute)` returns:
```
revealed: { name: string; email: string; institute: string; city: string } | null
```
— non-null **only** when `app?.consent?.status === 'granted'`. Every candidate/passport response gains `revealed` (null unless granted) and a `consent` block:
```
consent: {
  status: 'requested' | 'granted' | 'declined' | null   // null = never requested
  expired: boolean                                        // derived
  requestedAt, expiresAt, respondedAt: string | null      // ISO
} | null
```
The default masked shape is unchanged from 5a; reveal is strictly additive and only on grant. **PII masking stays enforced server-side** — the `revealed` block is the ONLY path to identity and is gated on the stored `granted` status.

### Critical interaction with 5a's decision-clear (must-fix)
5a's `setDecision(..., null)` deletes the Application when `notes` is empty (`deleteOne({ ..., notes: { $size: 0 } })`). With 5b, that delete must **also skip when a `consent` sub-doc exists** — otherwise an employer clearing a Shortlist decision would silently destroy an in-flight/granted reveal request. The condition becomes "delete only if no notes **and** no consent" (e.g. add `consent: { $exists: false }`); if a consent sub-doc is present, the row is kept with `decision: null`. Consent is gated on `Shortlisted` only **at request time** — a later decision change (Hold/Reject/clear) does **not** revoke an existing consent.

### Derived consent view helper
`consentView(app)` → `{ status, expired, requestedAt, expiresAt, respondedAt } | null`, applying the derived-expiry rule. Used by both the candidate/passport projection and the jobseeker list.

### Server — employer endpoints
All on the existing `.use('/employer', requireAuth, requireRole('employer'))` gate, each also gated by `hasApprovedRegistration(employerId, driveId)` and `requirePoolMember` (reused from 5a). `employerId` from `req.userId` (JWT `sub`), never the body.

- **`POST /employer/drives/:id/candidates/:jobseekerId/reveal-request`** — `none → requested`. Requires this employer's `Application.decision === 'Shortlisted'` → else `400 not_shortlisted`. Sets `requestedAt = now`, `expiresAt = now + 48h`, clears `respondedAt`/`remindedAt`. If already `granted`/`declined` → `400 already_responded` (terminal, no re-request). If already `requested` (and not expired) → idempotent no-op returning current state. Returns the updated passport.
- **`POST /employer/drives/:id/candidates/:jobseekerId/reveal-request/remind`** — re-arms a `requested` or **expired** request: new `expiresAt`, `remindedAt = now`, status stays/returns to `requested`. `400 not_remindable` if `none`/`granted`/`declined`. Returns the updated passport.
- **`DELETE /employer/drives/:id/candidates/:jobseekerId/reveal-request`** — withdraw: clears the `consent` sub-doc back to `none`. Allowed only while `requested`/expired → else `400 not_withdrawable`. (In practice the row is never orphaned: a reveal request requires a `Shortlisted` decision, which keeps the row non-empty; the sparse-delete-if-empty rule is unreachable here but harmless.) Returns the updated passport.

The existing **`GET /employer/drives/:id/candidates`** and passport projections gain the `consent` + `revealed` blocks — so the employer consent page reuses `GET candidates` filtered to `decision=Shortlisted`; **no new employer GET endpoint**.

### Server — jobseeker endpoints (API only)
Extend `seekerPortal` on its existing `.use(requireAuth); .use(requireRole('jobseeker'))` gate. `jobseekerId` from `req.userId`.

- **`GET /api/me/portal/reveal-requests`** — this jobseeker's reveal requests: `Application`s where `jobseekerId === me` and `consent.status ∈ {requested, granted, declined}`. Each item: `{ applicationId, company, driveName, requestedAt, expiresAt, respondedAt, status, expired }`. The requesting **employer's company name is shown** (candidates must know who is asking; employers are not anonymous to candidates). An expired `requested` item is surfaced with `expired: true` (visible to the jobseeker as lapsed, but not respondable — see the respond guards). Sorted by `requestedAt` desc.
- **`POST /api/me/portal/reveal-requests/:applicationId/respond`** — body `{ decision: 'grant' | 'deny' }`. Verifies the `Application._id` belongs to this jobseeker (`jobseekerId === me`) → else uniform `404 not_found` (no oracle: foreign, unknown, and bad-id are indistinguishable). Requires `consent.status === 'requested'` and **not expired** → else `400 already_responded` (granted/declined) or `400 request_expired`. Sets `status = granted|declined`, `respondedAt = now`. Returns `{ status }`.

### State machine + expiry
```
none ──(employer request; must be Shortlisted)──▶ requested   (expiresAt = now + 48h)
requested ──(jobseeker grant)──▶ granted     [identity revealed to THIS employer]
requested ──(jobseeker deny)───▶ declined
requested & now > expiresAt ───▶ (derived) expired
requested/expired ──(employer remind)──▶ requested   (re-armed, remindedAt set)
requested/expired ──(employer withdraw)──▶ none
granted, declined = terminal (no re-request)
```

## Client — employer side only

- **Types** (`client/src/types/employer.ts`): extend `EmployerCandidate`/`CandidatePassport` with `consent: CandidateConsent | null` and `revealed: RevealedIdentity | null`. New `CandidateConsent` (`status`/`expired`/timestamps) and `RevealedIdentity` (`name`/`email`/`institute`/`city`).
- **Hooks** (`hooks/useEmployerCandidates.ts`): `useRevealMutations(driveId)` — `requestReveal` / `remind` / `withdraw` (jobseekerId param), each invalidating `['employer-candidates', driveId]` + `['candidate-passport', driveId, jsId]` + `['employer-portal']`.
- **`EmployerConsent`** (`/employer/drives/:id/consent`, inside `EmployerShell`) — the Screen-16 page. Reuses `useEmployerCandidates(driveId, { decision: 'Shortlisted' })`. Status filter chips with derived counts (Waiting / Interested / Declined / Expired), and a table: candidate cell (masked code, or the revealed name + email when `consent.status==='granted'`), match ring, consent status pill (derived `expired` → "Expired"), requested-at, response/expiry cell ("Expires in Nh" for waiting, revealed email for interested, respondedAt for declined), and per-row actions: **Request reveal** (Shortlisted + no request), **Send reminder** (waiting/expired), **Withdraw**. Loading/empty/error states. Empty state guides "shortlist candidates to request their consent".
- **`EmployerCandidatePassport`** — add a consent block: the current consent state + a **Request reveal** / **Send reminder** / **Withdraw** control, and the revealed name/email/institute+city when granted (replacing the "Identity hidden" header).
- **Entry + nav**: a gated **"Consent status"** CTA on `EmployerCandidates` (enabled when ≥1 candidate has `decision==='Shortlisted'`) → `/employer/drives/:id/consent`. Route in `App.tsx`. Reuses the ported `.reveal`/`.resp-pill`/`.cand*` CSS.
- **No jobseeker client UI** (decision 2).

## Error handling
`{ error: { message, code } }` throughout. zod → `400 validation`; role guards → `401`/`403`; missing approved registration → `400 registration_not_approved`; a jobseeker outside the drive's pool / bad id → `404 not_found` (5a discipline preserved). New codes: `not_shortlisted`, `already_responded`, `not_remindable`, `not_withdrawable`, `request_expired`. Foreign/unknown Application on the jobseeker respond path → uniform `404 not_found` (no enumeration oracle). Reveal identity is emitted **only** via the `granted`-gated `revealed` block — a server test asserts identity is absent for `requested`/`declined`/`expired`/none and present for `granted`.

## Testing

### Server
- Model test: the `consent` sub-doc persists and accepts the enum; absence = never requested.
- Employer route tests (`employer-consent.route.test.ts`): request-reveal gated on Shortlisted (`not_shortlisted` for undecided/Hold/Rejected), on an approved registration, and on pool membership; request sets `requested`+`expiresAt`; remind re-arms a requested/expired request; withdraw clears (and deletes a now-empty Application); terminal guards (`already_responded` after grant/deny); cross-employer consent isolation (employer B never sees A's consent/reveal); **reveal gating** — `revealed` is null for none/requested/declined/expired and populated+correct for granted; `401`/`403`.
- Jobseeker route tests (`seeker-reveal.route.test.ts`): list returns only this jobseeker's requests with the company name; respond grant → `granted` + reveal flips on for that employer; respond deny → `declined`; foreign/unknown applicationId → `404` (no oracle); already-responded → `400`; expired `requested` → `400 request_expired`; `401`/`403` (employer token).
- Derived-expiry unit test: a `requested` Application with `expiresAt` in the past reads as `expired` and blocks respond.

### Client
- `EmployerConsent`: renders masked Shortlisted rows; a granted row shows the revealed name/email; Request reveal / Send reminder / Withdraw fire the right mutations; status filter narrows; empty state when no Shortlisted.
- `EmployerCandidatePassport`: the consent block renders per state; Request reveal fires; granted shows revealed identity.
- The candidates-page "Consent status" CTA is disabled with no Shortlisted and enabled + routes with one.

## Verification
Full server + client suites green, both `tsc --noEmit` clean, client build OK. Live E2E on an isolated DB (`matchday_employer5b_smoke`, dropped after; shared `matchday` untouched): an employer with an approved registration Shortlists a pool candidate → `reveal-request` → `requested` (identity still masked, `revealed:null`); the jobseeker `GET reveal-requests` shows it with the company name → `respond grant` → the employer's passport now returns `revealed` with the real name/email/institute (grep the payload: masked before, present after); a second candidate `respond deny` → stays masked; an expired request reads `expired` and blocks respond; employer B (approved for the same drive) sees `consent:null`/`revealed:null` for the same candidate (isolation); admin token → 403.

## Follow-ups / known stubs
- No email/push — a reveal request reaches the jobseeker only via their portal API (polled). A real notification channel is Slice 10.
- Reminder/expiry are timestamp-only (no scheduled job); `expired` is purely derived. If a scheduled reminder is ever needed, it is out of scope here.
- `declined` is terminal in 5b (no re-request); if the product later wants a cooling-off re-request, it extends this same sub-doc.
- The revealed set is name/email/institute+city only (the real fields); phone/resume do not exist on the model.
- Withdraw after grant is intentionally disallowed (identity, once revealed with consent, stays revealed to that employer for the engagement); revisit if a revoke flow is needed.
