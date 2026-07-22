# Employer Portal — Slice 9: Offers

**Date:** 2026-07-21
**Status:** Approved
**Builds on:** 5a (`Application` + pool), 5b (consent), 6 (decision), 7 (interview), 8 (kanban `stage` + `deriveStage`). **Stacked** on `feat/employer-portal-slice8` (main←7←8←9); the PR bases on the 8 branch and retargets down the stack as #32/#33 merge.
**Prototype:** `Matchday_Employer.html` — Screen 20 "Offer management" (markup ~3261, JS ~6833–6992). CSS already ported (`.kpi`/`.kpi-grid`/`.status-pill`/`.resp-pill`/`.reveal`/`.offer-ctc`/`.decline-r`). The offer-letter upload + fabricated CTC formulas are out of scope (see non-goals).

## Summary

A per-drive **offer-tracking dashboard**. For a **consent-granted** candidate, the employer records an **offer** (status Draft/Sent/Accepted/Declined/Joined + the candidate's response, CTC, joining location/mode/date, decline reason). The offer persists as an `Application.offer` sub-doc, and its `status` **feeds Slice 8's `deriveStage`** so the kanban's Offer Sent / Offer Accepted / Joined columns light up automatically. Employer-tracked (no jobseeker-side accept/decline this slice).

**Decisions locked during brainstorming:**
1. **Git base** — stacked on `feat/employer-portal-slice8`.
2. **Offer response is employer-tracked** — the employer records `status` + the candidate's `response`; no jobseeker endpoint.
3. **Offer status derives the kanban offer stages** — extends Slice 8's `deriveStage` (offer takes precedence over consent/decision; a manual pin still overrides).
4. **`Application.offer` sub-doc** (consistent with `consent`/`stage`); **offer requires consent granted** (you can only offer someone whose identity you have); **first-create defaults CTC/location/mode from the employer's registration**.

## Non-goals (deliberate)
- Offer-letter file **upload** (no file-storage infra) — omitted.
- A real **jobseeker-side** accept/decline (employer-tracked, per decision 2) — the candidate does not act on the offer via API this slice.
- Negotiation history / multiple offer versions; offer rescission beyond the status enum.
- Fabricated CTC formulas (the prototype's score-based CTC) — CTC is employer-entered, defaulting from the registration.

## Architecture

### `Application.offer` sub-doc (new)
```
offer: {
  status:        String enum ['Draft','Sent','Accepted','Declined','Joined']  (required)
  response:      String enum ['Pending','Negotiating','Accepted','Declined']  (default 'Pending')
  ctc:           Number   (LPA; default 0)
  location:      String   (default '')
  mode:          String enum ['On-site','Hybrid','Remote']  (default 'Hybrid')
  joinDate:      Date     (default null)
  declineReason: String   (default '')
}   // { _id: false }, whole sub-doc default undefined (absent until an offer is created)
```

### Kanban integration (extends Slice 8's `constants/kanban.ts` + `employerBoard.service.ts`)
`deriveStage` gains an optional **trailing** `offerStatus` argument (so existing Slice-8 callers are unaffected), checked **first in the logic**:
```
deriveStage(decision, consentStatus, hasInterview, offerStatus):
  offerStatus === 'Joined'   → 'Joined'
  offerStatus === 'Accepted' → 'Offer Accepted'
  offerStatus === 'Sent'     → 'Offer Sent'
  offerStatus === 'Declined' → 'Withdrawn'
  // 'Draft' or none → fall through to the existing consent/decision logic
  <existing Slice-8 logic>
```
`boardCard` (Slice 8) passes `app.offer?.status`. A pinned `app.stage` still overrides (checked before derivation, unchanged). So sending/updating an offer moves the card automatically; a Draft offer does not. This is a backward-compatible extension (the new arg is optional; Slice 8 callers that omit it behave exactly as before).

### Server — 2 endpoints (existing `/employer` gate + `hasApprovedRegistration`)
A focused `employerOffers.service.ts` (+ controller + schema); `employerId` from `req.userId`.

- **`GET /employer/drives/:id/offers`** — candidates who have an `Application.offer`, projected as `{ jobseekerId, code, matchScore, revealed: { name, email }, status, response, ctc, location, mode, joinDate, declineReason }`, plus `counts` (per-status KPI). Offers require consent-granted, so identity is always revealed (loaded for the offered set). Sorted by `matchScore` desc. `{ items, counts }`.
- **`PUT /employer/drives/:id/candidates/:jobseekerId/offer`** — body `{ status, response?, ctc?, location?, mode?, joinDate?, declineReason? }` (zod: `status` required + enum, `response`/`mode` enum, `ctc` non-negative number, `joinDate` ISO date string, others strings). Guards: `requirePoolMember` (404 no-oracle); **`offer_requires_consent`** (400) unless the Application `consent.status === 'granted'`. Upserts the `Application.offer`. On **first** create (no existing `offer`), any unspecified `ctc`/`location`/`mode` default from the employer's Approved `RegistrationRequest` for the drive (`ctcMax` → ctc; `details.cities[0]` or the parsed `ctcRange`/city → location; `details.workMode` → mode); on update, only the provided fields change (others preserved). Returns the updated offer row (same projection as a list item).

### Cross-slice notes
Reuses `poolSeekers`/`requirePoolMember`/`candidateScore`/`codeFor`/`hasApprovedRegistration`; reads `RegistrationRequest` (Slice 3) for defaults; reads `consent` (5b). **Modifies Slice 8's `deriveStage` signature + `boardCard` call** (adds the offer signal) — a stacked, backward-compatible change. Never mutates `decision`/`consent`/`interview`/`stage` (the offer only adds a derivation input; a manual pin still wins).

## Client — page, hooks, entry
- **Types** (`client/src/types/employer.ts`): `EmployerOffer` (the row) + `OfferStatus`/`OfferResponse`/`OfferMode` unions + `OfferInput`; `EmployerOffersResponse` (`{ items, counts }`).
- **Hooks** (`hooks/useEmployerOffers.ts`): `useEmployerOffers(driveId)` (key `['employer-offers', driveId]`); `useUpsertOffer(driveId)` (`mutate({ jobseekerId, ...offer })` → the PUT; invalidates `['employer-offers', driveId]` + `['employer-board', driveId]` + `['employer-candidates', driveId]` + `['employer-portal']`).
- **`EmployerOffers`** (`/employer/drives/:id/offers`, in `EmployerShell`, `.page-wrap`) — a KPI row (Draft/Sent/Accepted/Declined/Joined counts, ported `.kpi`); a table of offers (revealed candidate, status pill, CTC, location, mode, join date, response pill, decline reason) with a per-row **Update** control (inline form: status/response/ctc/location/mode/joinDate/declineReason; `.show-err` validation); and a **New offer** control that lists consent-granted candidates without an offer yet (from `useEmployerCandidates(driveId,{decision:'Shortlisted'})` filtered to `consent==='granted'` and not already offered) to create one. Reuses ported `.kpi`/`.status-pill`/`.resp-pill`/`.reveal`/`.decline-r` CSS; errors surfaced (`role="alert"`). Loading/empty/error states.
- **Entry + nav**: an **"Offer management"** CTA on the kanban board (`EmployerKanban`) and on `EmployerCandidates`; route in `App.tsx`.

## Error handling
`{ error: { message, code } }`. zod → `400 validation` (bad status/response/mode enum, negative ctc); role guards → `401`/`403`; missing approved registration → `400 registration_not_approved`; out-of-pool/bad id → `404 not_found`. New code: `offer_requires_consent`.

## Testing

### Server (`employer-offers.route.test.ts`)
- **PUT offer**: creates the sub-doc for a consent-granted candidate; `offer_requires_consent` for a non-granted candidate; enum/ctc validation → 400; **first-create defaults** ctc/location/mode from the drive's Approved registration when omitted; an update changes only the provided fields (others preserved); pool-404; employer-scoped; 401/403.
- **kanban derivation** (in the board test or here): an `offer.status:'Sent'` candidate's board card derives to `Offer Sent`; `Accepted`→`Offer Accepted`; `Joined`→`Joined`; `Declined`→`Withdrawn`; a `Draft` offer does NOT change the derived stage; a manual `app.stage` pin still overrides an offer-derived stage.
- **offers list**: returns only candidates with an offer, revealed identity + fields, and correct `counts`; sorted by matchScore.

### Client (`EmployerOffers.test.tsx`)
- The offers table renders a revealed row + status pill + CTC; Update fires `useUpsertOffer` with the changed fields; the New-offer picker lists only consent-granted, un-offered candidates; the empty state shows when there are no offers.

## Verification
Full server + client suites green, both `tsc --noEmit` clean, client build OK. Live E2E on an isolated DB (`matchday_employer9_smoke`, dropped after; shared untouched): an employer with an approved registration + a consent-granted candidate → `PUT offer {status:'Sent'}` → 200 (ctc/location/mode defaulted from the registration when omitted); the candidate appears in `GET offers` with the revealed name; the kanban `GET board` now shows that card in **Offer Sent**; updating to `Accepted`→`Offer Accepted`, `Joined`→`Joined`, `Declined`→`Withdrawn`; a manual stage pin overrides; a **non-granted** candidate → `offer_requires_consent`; employer B sees none of A's offers; admin → 403; shared DB untouched.

## Follow-ups / known stubs
- Offer-letter upload + a jobseeker-side accept/decline are deferred (no file storage; employer-tracked this slice).
- CTC is a single number (LPA); no currency/structure beyond that; the registration default uses `ctcMax`.
- Offer status feeds the kanban derivation but the board never writes the offer (one-way); a manual pin can still diverge from the offer status (consistent with Slice 8's overlay model).
- Registration-defaulting reads the first Approved registration for the drive; if the employer has none of the optional `details` fields, location/mode fall back to the sub-doc defaults.
