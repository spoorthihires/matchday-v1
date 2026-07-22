# Jobseeker Portal — Completion Design

**Date:** 2026-07-22
**Status:** Approved (scope self-decided under the user's "complete the rest of the modules without waiting" mandate; the landing design is `MatchDay_Jobseeker_Landing_Page.html`).
**Builds on:** the shipped base jobseeker portal (auth, `requireRole('jobseeker')`, `GET /api/me/portal`, the `pages/Portal/` page) + the now-merged employer portal, which produces the per-(employer×drive×seeker) `Application` (decision/consent/stage/offer), `Interview`, `Slot`, and `SlotBooking` data this completion surfaces. **On `main` @0e9b193.** One branch `feat/jobseeker-portal-completion`; one PR.

## Guiding principles (carried from the base portal)
- **Derive-read where possible; the seeker's own writes are limited to responding** (reveal grant/deny, offer accept/decline) + booking a slot + editing their own account. `jobseekerId`/identity always from `req.userId` (JWT `sub`), never a path/body param.
- **No new employer-facing entity.** Reuse `Application`/`Interview`/`Slot`/`SlotBooking`.
- **Consent direction:** reveal hides the *seeker's* identity from the *employer* until granted; the **company name is never secret to the seeker**. Interviews only exist once consent is granted (employer gate), so an interview's meeting link is always safe to show the seeker.
- Reuse the existing `seekerPortal` router (already `requireAuth`+`requireRole('jobseeker')`), `portal.css`, `usePortal`-style hooks, and `codeFor`/consent helpers.

---

## Slice JS-A — Portal self-tracking (reveal + interviews + offers)

Adds three seeker-facing surfaces for the employer activity that targets them. Reveal endpoints already exist (Slice 5b); interviews + offers need derived read endpoints; offers add one seeker write.

### Server (on the existing `/api/me` seeker gate)
- **Reveal requests** — already live (`GET /portal/reveal-requests`, `POST /portal/reveal-requests/:applicationId/respond`). No server change.
- **`GET /api/me/portal/interviews`** → derive from `Interview.find({ jobseekerId })` joined to `Slot` (date/start/end/link) + `Employer.name` + `Drive.name`. Item: `{ interviewId, company, driveName, date, start, end, time, status, interviewers: string[], link }`. Sorted by date+start. (Interviews exist only for consent-granted seekers, so `link` is always safe.) View-only — the seeker does not mutate interview status this slice.
- **`GET /api/me/portal/offers`** → `Application.find({ jobseekerId, 'offer.status': { $in: ['Sent','Accepted','Declined','Joined'] } })` (Draft offers are the employer's private WIP → excluded). Item: `{ applicationId, company, driveName, status, response, ctc, location, mode, joinDate, declineReason }`.
- **`POST /api/me/portal/offers/:applicationId/respond`** — body `{ response: 'Accepted'|'Declined', declineReason?: string }`. Guards: `Application.findOne({ _id, jobseekerId })` else `404` (no oracle); offer must exist and `offer.status === 'Sent'` else `400 offer_not_actionable` (can't respond to Draft/Accepted/Declined/Joined); on Declined, `declineReason` optional. Sets **only** `offer.response` (Accepted/Declined) — never touches employer-owned `offer.status`/ctc/etc. Returns `{ response }`. (Mirrors the reveal-respond contract.)

### Client (`pages/Portal/`)
- New sections added to the single Portal page, in order after Status cards: **Identity reveal requests**, **My interviews**, **My offers**; then the existing **My Drives**.
- **RevealRequests**: rows of `company · drive` + status; `requested`&!`expired` → Pending with **Grant** (lightweight inline confirm, since it irreversibly shares name+contact) / **Deny**; `expired`/`granted`/`declined` read-only badges. Empty state.
- **Interviews**: rows of `company · drive`, date/time, status badge, a **Join** link (from `link`), interviewers. Empty state.
- **Offers**: rows of `company · drive`, CTC/location/mode/join-date, status + the seeker's `response`; on `status==='Sent'` & `response` not terminal → **Accept** / **Decline** (Decline opens an optional reason) → respond mutation. Empty state.
- Hooks `useRevealRequests`/`useRespondReveal`, `useInterviews`, `useOffers`/`useRespondOffer` (react-query, `apiFetch`, invalidate their keys + `['portal']`). New `types/portal.ts` additions. Reuse `.card`/`.drive`-row/`.tag`/`.btn`; add minimal CSS only if a control has no existing class.

### Testing
Server route tests (interviews derivation incl. link/company/drive; offers filter excludes Draft; respond guards `offer_not_actionable`/404/`already`/role/`401`/`403`; sets only `response`). Client tests (each section renders + empty state; Grant confirm→POST; Deny→POST; Accept/Decline→POST; interview Join link href).

---

## Slice JS-B — Public jobseeker landing + signup

Ports `MatchDay_Jobseeker_Landing_Page.html` as the public jobseeker marketing page and wires its **Log in** / **Join free** CTAs. "Join free" needs a real target → a public jobseeker signup (mirrors the employer signup flow).

### Client — landing (client-only, mostly static)
- **`JobseekerLanding`** page at a public route (`/jobseekers`), rendered outside any auth gate (like `EmployerLanding`). Ports the prototype's sections: nav (Log in / Join free), hero ("Your next job, matched in one week" + the Wednesday rail motif), Why MatchDay, Events (upcoming Wednesdays), Streams grid, How-it-works timeline, The assessment, Companies (`.league` table), Success stories, FAQ, final CTA, footer. Content is **static** (the prototype's copy/arrays) — no new data endpoints; the events/streams/companies are illustrative marketing content (documented as static, like the employer landing).
- **Styling:** a scoped `jobseekerLanding.css` (ported from the prototype's landing-specific styles, scoped under a wrapper class to avoid leaking) reusing the shared indigo/Inter tokens already in the app. No global CSS changes.
- **CTAs:** "Log in" → `/login`; "Join free" / "Register" → `/jobseekers/signup`.
- **Route** in `App.tsx`: `/jobseekers` (public) + `/jobseekers/signup` (public).

### Server + client — jobseeker signup
- **`POST /api/auth/jobseeker-signup`** (public, in the `auth` module, mirrors `employerSignup`): body `{ name, email, password, branch, gradYear, source, instituteId }`. Creates a `Jobseeker` with `passwordHash`, `stage: 'Applied'`, `profileCompleted: false`; `email` unique (400 if taken). Returns `{ token, user }` (role `jobseeker`) so the client logs in immediately (reuses `useAuth().login`). Institute is chosen from a **public institutes list** — add `GET /api/auth/institutes` (or reuse an open read) returning `[{ id, name }]` for the signup select (no auth; names only, no PII).
- **`JobseekerSignup`** client page (`/jobseekers/signup`): a form (name/email/password/branch/gradYear/source/institute-select) → signup mutation → on success, navigate to `/portal`.

### Testing
Server: signup creates a loggable seeker (role jobseeker), duplicate email → 400, institutes list is public. Client: landing renders key sections + CTAs route correctly; signup posts the expected body and navigates to `/portal`.

---

## Slice JS-C — Account self-service (profile + password)

The deferred "edit own profile / password" items — for logged-in seekers.

### Server (seeker gate)
- **`GET /api/me/portal/account`** → the seeker's editable profile (`{ name, email, branch, gradYear, source, institute, cgpa, hasPassword }`) — reuses `req.userId`.
- **`PATCH /api/me/portal/account`** → body `{ name?, branch?, source? }` (a bounded editable set; `email`/`cgpa`/`gradYear`/`institute`/`stage` are NOT self-editable — they're identity/eval-controlled). Updates the seeker's own doc. Returns the updated profile.
- **`POST /api/me/portal/account/password`** → body `{ currentPassword, newPassword }` (min 8). Verifies current via `verifyPassword`, sets new `passwordHash` via `hashPassword`. `400 invalid_password` if current wrong. (A seeker with no existing `passwordHash` — seeded without one — can't reach here since they can't log in.)

### Client
- **Account** page (`/portal/account`, still inside the seeker role gate; a small sub-route or a section reachable from the PortalShell header). Profile form (editable name/branch/source; read-only email/institute/gradYear/cgpa) + a change-password form. PortalShell header gets an **Account** link.

### Testing
Server: PATCH updates only allowed fields (ignores email/cgpa in body); password change verifies current + rejects wrong current; role/401/403. Client: account form renders + PATCH; password form posts.

---

## Slice JS-D — Slot self-booking

Lets a seeker book an employer interview slot for a drive they're eligible for. Net-new booking path deriving identity from `req.userId` (today only an admin route creates `SlotBooking`).

### Server (seeker gate)
- **`GET /api/me/portal/drives/:driveId/slots`** → available `Slot`s for a drive the seeker is eligible for (`isEligible` reused): `{ id, date, start, end, capacity, booked (derived count), mine (does this seeker hold a booking) }`; Cancelled slots excluded. `403`/`404` if the seeker isn't eligible for the drive (no oracle → 404).
- **`POST /api/me/portal/slots/:slotId/book`** → creates a `SlotBooking` for `req.userId`, reusing the existing `createBooking` validation core (Match-Ready + eligible + not-already-booked + capacity), but deriving `jobseekerId` from the token (NOT the body). Guards surfaced: `not_match_ready`, `not_eligible`, `already_booked`, `slot_full`, slot Cancelled → 400/404 as appropriate. Returns the booking.
- **`DELETE /api/me/portal/slots/:slotId/book`** → cancels the seeker's own booking for that slot (`SlotBooking.deleteOne({ slotId, jobseekerId })`); 404 if none.

### Client
- On the **My Drives** entries (or a drive detail), a **Book a slot** affordance opening the slots list for that drive with Book / Cancel per slot. Reuses `portal.css` + minimal additions.

### Testing
Server: eligible-only slot listing; book derives identity from token (a body `jobseekerId` is ignored), enforces capacity/eligibility/duplicate; cancel removes own booking; role/401/403/404-no-oracle. Client: slots render, Book→POST, Cancel→DELETE.

---

## Cross-slice / global
- All new seeker endpoints live under the existing `seekerPortal` router (`/api/me`, `requireAuth`+`requireRole('jobseeker')`) except the two PUBLIC auth endpoints (`jobseeker-signup`, `institutes` list). No existing endpoint's authorization changes.
- Error envelope `{ error:{message,code} }`; ESM `.js`. Reuse `codeFor`, `isExpired`, `isEligible`, `createBooking` core, `hashPassword`/`verifyPassword`.
- **No PII leak beyond the seeker's own data + company names** (which are already non-secret to the seeker).
- Verification per slice: server + client suites green, tsc x2, build; a final isolated-DB E2E smoke covering the seeker flows (respond reveal, view interviews/offers, accept offer, signup+login, edit profile, book a slot) + confirm no regression to employer/admin.

## Non-goals
- No seeker-side interview reschedule/cancel (employer-managed); no offer negotiation beyond Accept/Decline; no editing eval/stage/institute; no admin-approval gate for jobseeker signup (immediate active, like a self-serve candidate); landing content is static (no CMS/real-events feed).
