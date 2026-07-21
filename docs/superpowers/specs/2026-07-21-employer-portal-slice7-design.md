# Employer Portal — Slice 7: Interviews

**Date:** 2026-07-21
**Status:** Approved
**Builds on:** Slice 4 (`Slot` — date/window/link), 5a (`Application` + candidate pool), 5b (consent/reveal), 6 (shortlist). **Stacked** on `feat/employer-portal-slice6` (main←5a←5b←6←7); the PR bases on the 6 branch and retargets down the stack as PRs merge.
**Prototype:** `Matchday_Employer.html` — Screen 17 "Interview schedule" (markup ~3239, JS ~6404–6563). CSS already ported into `client/src/styles/employer.css` (`.reveal`/`.day-head`/`.mlink`/`.ip`/`.intv-*`/`.status-pill`). The prototype's interviewer panel, times, and meeting links are fabricated — real ones come from the `Slot` (link + window) and free-text interviewer names.

## Summary

A per-drive **interview agenda**. For a candidate who has **consented** (identity revealed, 5b) and been shortlisted (6), the employer schedules an **interview** into one of their existing **Slots** (Slice 4) at a time within the slot's window, optionally naming interviewers; then confirms / reschedules / cancels / completes it. Interviews persist as a net-new **`Interview`** entity; the meeting link is the slot's link.

**Decisions locked during brainstorming:**
1. **Git base** — stacked on `feat/employer-portal-slice6` (4-deep).
2. **Attached to a Slot** — an interview references an existing `Slot`; it inherits the slot's `date`/`start`/`end`/`link`. No standalone datetime/link.
3. **Consent = granted required to schedule** — only candidates whose Application `consent.status === 'granted'` can be scheduled (you can only interview someone who's revealed + can be contacted). Since grant is terminal (5b), the agenda is always identity-revealed.
4. **`Interview` entity** — distinct from `SlotBooking` (the candidate-side reservation). Interviewers are **free-text** (no team entity until Slice 10). Statuses `Scheduled/Confirmed/Cancelled/Completed`; **reschedule resets status → Scheduled**.
5. **`slot_time_taken` uniqueness guard** (no two non-cancelled interviews at the same time in a slot); **no per-slot capacity cap** this slice.

## Non-goals (later slices / deliberate)
- A team/interviewer entity — Slice 10 (interviewers stay free-text strings).
- Interview rounds / feedback / scorecards (not in Screen 17).
- Per-slot capacity enforcement (only time-uniqueness this slice; capacity is a possible follow-up).
- Auto-generating an agenda (the employer schedules explicitly; the prototype's auto-fill is fabricated).
- Linking to `SlotBooking` (the candidate-side booking is a separate concept; an interview does not require one).

## Architecture

### New model: `Interview` (`server/src/models/Interview.ts`)
```
employerId   ObjectId → Employer   (required; server-set from JWT sub, never body)
driveId      ObjectId → Drive      (required; route param)
jobseekerId  ObjectId → Jobseeker  (required)
slotId       ObjectId → Slot       (required)
time         String                (required; 'HH:MM', within the slot's start–end)
interviewers [String]              (default [])
status       String enum ['Scheduled','Confirmed','Cancelled','Completed'] (default 'Scheduled')
```
`{ timestamps: true }`; unique compound index `(employerId, driveId, jobseekerId)`. The meeting link is **not stored** — it derives from `slot.link` on read.

### Interview projection (read)
For each interview: `{ id, jobseekerId, code, name, email, time, status, interviewers, slot: { id, date, start, end, link } }`. Because scheduling requires `consent==='granted'`, the candidate identity (`name`/`email`, loaded from `Jobseeker`) is always present — no masked case. `code` = `codeFor(jobseekerId)` (kept for continuity with the other screens).

### Server — endpoints (on the existing `/employer` gate + `hasApprovedRegistration`)
All in a focused `employerInterviews.service.ts` (+ controller + schemas), mounted the same scoped way; `employerId` from `req.userId`.

- **`GET /employer/drives/:id/interviews`** — gate + `Drive.findById`; loads this employer's `Interview`s for the drive, joins each slot (`date`/`start`/`end`/`link`) and each jobseeker (`name`/`email`), projects as above; sorted by slot `date` then `time`. `{ items }`.
- **`POST /employer/drives/:id/interviews`** — `{ jobseekerId, slotId, time: 'HH:MM', interviewers?: string[] }`. Guards, in order:
  - `requirePoolMember(employerId, driveId, jobseekerId)` (reused; 404 no-oracle for out-of-pool/bad id).
  - `consent_required` (400) unless the Application `(employerId, driveId, jobseekerId)` exists with `consent.status === 'granted'`.
  - `slot_invalid` (400) unless the `Slot` exists, `slot.driveId === driveId`, `slot.employerId === employerId`, and `slot.status !== 'Cancelled'`.
  - `time_out_of_window` (400) unless `slot.start ≤ time < slot.end` (zero-padded `HH:MM` lexical compare) and `time` matches `/^\d{2}:\d{2}$/`.
  - `slot_time_taken` (400) if another non-`Cancelled` interview in that slot already holds `time`.
  - `already_scheduled` (400) if an interview for `(employerId, driveId, jobseekerId)` already exists.
  - Creates `Interview` (`status:'Scheduled'`, `interviewers: interviewers ?? []`). Returns the projected interview.
- **`PATCH /employer/drives/:id/interviews/:interviewId`** — discriminated action body:
  - `{ action:'confirm' }` → `Confirmed` (from `Scheduled`); `{ action:'complete' }` → `Completed`; `{ action:'cancel' }` → `Cancelled` (from any non-`Cancelled`).
  - `{ action:'reschedule', slotId, time }` → re-runs `slot_invalid`/`time_out_of_window`/`slot_time_taken`; updates `slotId`/`time`; resets `status → 'Scheduled'`.
  - `{ action:'set-interviewers', interviewers: string[] }` → replaces the array.
  - The interview is looked up by `{ _id, employerId }` — a foreign/unknown id → uniform `404 not_found` (no oracle). Returns the projected interview.

### Cross-slice notes
- Reuses `requirePoolMember`, `hasApprovedRegistration`, `codeFor`. Reads `Application.consent` (5b) and `Slot` (Slice 4) but modifies neither. Admin modules untouched.
- No `SlotBooking` coupling: an interview is the employer's scheduled event, independent of whether the candidate self-booked a seat.

## Client — pages, hooks, entry
- **Types** (`client/src/types/employer.ts`): `EmployerInterview` (the projection) + `InterviewSlotRef`; `ScheduleInterviewInput` (`{ jobseekerId, slotId, time, interviewers? }`); `InterviewAction` union.
- **Hooks** (`hooks/useEmployerInterviews.ts`): `useEmployerInterviews(driveId)` (key `['employer-interviews', driveId]`), `useScheduleInterview(driveId)`, `useInterviewAction(driveId)` — mutations invalidate `['employer-interviews', driveId]` + `['employer-portal']`.
- **`EmployerInterviews`** (`/employer/drives/:id/interviews`, in `EmployerShell`, `.page-wrap`) — a **schedule** form: a candidate `<select>` populated from `useEmployerCandidates(driveId,{decision:'Shortlisted'})` filtered client-side to `consent?.status==='granted'` (with an empty-state hint when none are consented yet); a slot `<select>` from `useEmployerSlots(driveId)` (Slice 4); a time input; an interviewers chip/text input → `useScheduleInterview`. An **agenda** grouped by slot date: each row shows the revealed candidate (name + code), time, the slot's meeting link (Join `<a>` + copy), interviewer chips (+ an add control), a status pill, and Confirm / Reschedule / Cancel / Complete. `.show-err` validation on the form. Reuses the ported `.reveal`/`.day-head`/`.mlink`/`.ip`/`.status-pill` CSS. Loading/empty/error states.
- **Entry + nav**: an **"Interviews"** CTA on `EmployerCandidates` (alongside "Shortlist workspace"/"Consent status") → `/employer/drives/:id/interviews`; route in `App.tsx`.

## Error handling
`{ error: { message, code } }` throughout. zod → `400 validation`; role guards → `401`/`403`; missing approved registration → `400 registration_not_approved`; out-of-pool/bad id → `404 not_found`. New codes: `consent_required`, `slot_invalid`, `time_out_of_window`, `slot_time_taken`, `already_scheduled`. PATCH on a foreign/unknown interview → uniform `404 not_found`.

## Testing

### Server (`employer-interviews.route.test.ts`)
- **schedule**: succeeds for a consent-granted pool candidate into a valid slot+time (returns the revealed name + the slot link); each guard fires — `consent_required` (candidate not granted), `slot_invalid` (foreign/cancelled/other-drive slot), `time_out_of_window`, `slot_time_taken` (second candidate, same slot+time), `already_scheduled` (same candidate twice), pool `404`, approved-reg gate; `401`/`403`.
- **list**: returns the projected interviews with revealed identity + slot fields, sorted by date/time; employer-scoped (employer B sees none of A's).
- **actions**: confirm/complete/cancel transition; reschedule re-validates (rejects a taken time, updates time, resets to `Scheduled`); set-interviewers replaces; foreign interviewId → `404`.

### Client (`EmployerInterviews.test.tsx`)
- The schedule form lists only consent-granted candidates and fires `useScheduleInterview` with `{ jobseekerId, slotId, time }`; the agenda renders a revealed row (name) + status pill + the slot's Join link; Confirm fires the action; the empty-state shows when no interviews.

## Verification
Full server + client suites green, both `tsc --noEmit` clean, client build OK. Live E2E on an isolated DB (`matchday_employer7_smoke`, dropped after; shared `matchday` untouched): an employer with an approved registration + a Slot + a **consent-granted** shortlisted candidate → `POST interviews` → 200 with the revealed name + the slot link; the candidate appears in `GET interviews`; `confirm` → `Confirmed`; `reschedule` to a new time → `Scheduled` at the new time; a second candidate at the **same** slot+time → `slot_time_taken`; a **non-granted** candidate → `consent_required`; `cancel` → `Cancelled`; employer B sees none of A's interviews; admin token → 403.

## Follow-ups / known stubs
- Interviewers are free-text (no team entity until Slice 10); no validation beyond non-empty strings.
- No per-slot capacity cap (only time-uniqueness); a slot could hold more interviews than `slot.capacity`. Revisit with the kanban/capacity work.
- `Completed` is a manual action (no time-based auto-complete).
- The meeting link is the slot's link (shared by all interviews in that slot), matching Slice 4; per-interview links are out of scope.
