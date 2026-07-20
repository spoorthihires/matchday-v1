# Employer Portal — Slice 4: Slot Management (design)

**Date:** 2026-07-20
**Status:** Approved
**Builds on:** Slices 1–3 (merged to `main` @6822c44). Fourth of ~10 employer-portal slices; the second employer **write** flow.
**Prototype:** `Matchday_Employer.html` Screen 11 — "Slot Booking" (markup ~3159–3188, JS ~5324–5511; CSS already ported into `client/src/styles/employer.css`).

## Summary

A logged-in employer, for a drive they have an **Approved** registration for, creates and manages their own interview **slot windows** — real `Slot` documents keyed to `employerId = self`. Create + view + reschedule + cancel. This reuses the existing `Slot` model verbatim (no schema change) and feeds the employer dashboard calendar/KPIs that already read `Slot.find({ employerId })`. It rewires the Slice-2 drive-detail "View slots" CTA (currently a `/employer/coming-soon/slots` dead-end).

**Decisions locked during brainstorming:**
1. **Model semantics** — the employer **creates & manages their own `Slot` docs** (write flow), rather than claiming an admin-pre-created pool or a read-only view.
2. **Panel** — **dropped this slice.** A slot is date/time/capacity/meeting-link only. Real interviewer assignment waits for Slice 10 (team access), which introduces the team-member entity a picker needs. No `panel` field is added.
3. **Date/time** — **anchored to the drive's real schedule.** A slot's `date` must be one of `drive.eventDates` (fallback: `drive.primaryEventDate` when `eventDates` is empty); `start`/`end` are free `HH:MM` (regex-validated, `end > start`); `capacity` is 1–50.
4. **Actions + gate** — **full lifecycle** (create/view/reschedule/cancel), gated to drives the employer has an **Approved** `RegistrationRequest` for (matches the prototype, where "Book slot" appears once a registration is Approved).

## Non-goals (later slices)

- Candidate-into-slot booking (`SlotBooking` / candidate rosters) — Slice 5. The candidate `SlotBooking` flow (admin-gated `Jobseeker`↔`Slot`) is **untouched** here.
- Real interview panel / interviewers — Slice 10 (team access).
- Interview-day scheduling (prototype Screen 17, `#page-interviews`).
- Real meeting-link generation infrastructure — the `auto` link mode produces an honest **stub** link (like the Slice-1 MFA/verify stubs).

## Architecture — reuse `Slot`, no schema change

`Slot` (`server/src/models/Slot.ts`) already models exactly what an employer interview window is:

```
driveId    ObjectId ref Drive   (required)
employerId ObjectId ref Employer (nullable; SET to the auth'd employer here)
date       Date                 (required)
start      String 'HH:MM'       (required)
end        String 'HH:MM'       (required)
capacity   Number               (default 10; validated 1–50)
status     'Scheduled'|'Completed'|'Cancelled'  (default 'Scheduled')
link       String               (default '')
attended   Number               (default 0; not touched by the employer)
noShow     Number               (default 0; not touched by the employer)
```

- `employerId` is **server-authoritative** — set from `req.userId` (JWT `sub` = the Employer `_id`), never from the request body. Identical to the Slice-3 identity discipline.
- No `panel` field is added (decision 2).
- `booked`/`held` are **derived, never stored** — counted from `SlotBooking` by `slotId` (reusing the existing aggregation pattern in `slots.service.ts`). They are 0 today (no candidate bookings created this slice) but computed so the "seats left" display is correct once Slice 5 lands.
- `Drive.slotCap` is a drive-level ceiling on how many `Slot` docs may exist; used as a light per-employer guard (see below). Distinct from `Slot.capacity` (per-window seat count).

## Server — 4 endpoints under the existing `/employer` gate

All added to the existing `employerPortalRoutes`, which is path-scoped: `.use('/employer', requireAuth, requireRole('employer'))`. A new slot route inherits that gate; no new unscoped middleware. The auth'd employer is resolved via `Employer.findById(req.userId)`. Admin `/api/slots` and the candidate `SlotBooking` module are untouched.

If the employer-portal service file grows past ~250 lines with these additions, split the slot logic into a focused `employerSlots.service.ts` (+ matching controller/schemas) mounted the same scoped way — keeping each file single-responsibility.

Shared helper: `hasApprovedRegistration(employerId, driveId)` → true iff a `RegistrationRequest` exists with that `employerId`, `driveId`, and `status === 'Approved'`.

### `GET /employer/drives/:id/slots`
Returns the employer's slots for the drive: `Slot.find({ driveId: id, employerId: self })` sorted by `date` then `start`, each projected to `{ id, date, start, end, capacity, booked, status, link }` with `booked` derived. **Precondition:** `hasApprovedRegistration(self, id)` → else `400 registration_not_approved`.

### `POST /employer/drives/:id/slots`
Body (zod, `createSlotSchema`): `{ date, start, end, capacity, linkMode: 'auto'|'own', link? }`. Guards, in order:
1. `hasApprovedRegistration(self, id)` → else `400 registration_not_approved`.
2. Resolve the drive; `date` (compared by calendar day) ∈ `drive.eventDates` (or equals `drive.primaryEventDate` when `eventDates` is empty) → else `400 date_not_in_schedule`.
3. `end > start` and `capacity` ∈ [1,50] (zod refine) → else `400 validation`.
4. No existing non-`Cancelled` slot for `{ employerId: self, driveId, date, start }` → else `400 slot_exists`.
5. The employer's own slot count for this drive `< Drive.slotCap` → else `400 slot_cap_reached`.

Meeting link: `linkMode:'auto'` → server sets a stub `https://meet.hiringhood.test/<slotId>` after insert; `linkMode:'own'` → the provided `link` (validated URL). Creates `Slot{ driveId, employerId: self, date, start, end, capacity, link, status:'Scheduled' }`; returns the projected slot. **201.**

### `PATCH /employer/drives/:id/slots/:slotId`
Body (zod, `updateSlotSchema` = create fields `.partial()`, `linkMode` optional). Guards:
1. The slot must belong to this employer **and** this drive (`Slot.findOne({ _id: slotId, employerId: self, driveId: id })`) → else `404 not_found` (**indistinguishable** from a nonexistent id — cross-employer isolation, same as Slice 3's registration detail).
2. On the merged doc: `date` still in schedule; `end > start`; `capacity` not below current derived `booked` (reuse the `slots.service` guard) → else `400`.
3. Cannot edit a `Cancelled` slot → `400 slot_cancelled` (moot for the hard-delete path, but guards a manually-cancelled admin slot).

Returns the updated projected slot.

### `DELETE /employer/drives/:id/slots/:slotId`
Ownership guard → `404` as above. **No candidate `SlotBooking` references it** (`SlotBooking.countDocuments({ slotId }) === 0`) → else `400 slot_has_bookings`. Then **hard-deletes** the `Slot` (keeps the dashboard calendar clean; reversible-history is a non-goal). Returns **200 `{ ok: true }`** (a JSON body, so the client mutation's `apiFetch` parses uniformly with the other endpoints).

## Client — page + hooks + CTA rewire

### Types (`client/src/types/employer.ts`)
- `EmployerSlot`: `{ id, date, start, end, capacity, booked, status, link }`.
- `SlotInput`: `{ date, start, end, capacity, linkMode: 'auto'|'own', link? }`.

### Hooks (`client/src/pages/EmployerPortal/hooks/useEmployerSlots.ts`)
- `useEmployerSlots(driveId)` — `useQuery`, key `['employer-slots', driveId]`, `enabled: !!token && !!driveId`. Returns `{ items: EmployerSlot[] }` (consumed as `data?.items ?? []`, matching the tracker convention).
- `useSlotMutations(driveId)` — `create` / `update` / `delete` mutations. Each `onSuccess` invalidates `['employer-slots', driveId]` **and** `['employer-portal']` (the dashboard calendar/KPIs read `Slot`). Mirrors `useBookingMutations`' fan-out invalidate shape.

### `EmployerSlots.tsx` (`/employer/drives/:id/slots`)
Renders **inside** `EmployerShell` (route-wrapped) — **no** `.employer-app` re-wrap (matches `EmployerDriveDetail`). Uses `useEmployerDrive(id)` for the drive name and `eventDates` (the pickable dates). Layout:
- **Existing slots** list — per row: date, time window, capacity + seats-left (`capacity - booked`), meeting link, status; per-row **Reschedule** (opens the row in edit mode → PATCH) and **Cancel** (→ DELETE, with a confirm).
- **Add slot** form — `date` is a `<select>` constrained to `drive.eventDates` (each option a real event date); `start`/`end` time inputs; `capacity` number input (1–50); meeting-link mode as two radio cards (auto vs own-URL, own reveals a URL input), reusing the ported `.link-opt` styles. Per-field validation uses the `.show-err` toggle on `.field` wrappers (the established convention; `.err-msg` is `display:none` without it). Submit disabled / blocked until required fields valid.
- Loading / error / empty states (mirror `EmployerDrives`/`EmployerRegistrations`).
- Surfaces `ApiError.message` inline for server-side rejects (e.g. `slot_exists`, `date_not_in_schedule`).

### CTA rewire (`EmployerDriveDetail.tsx`)
The "View slots" button (currently ungated → `/employer/coming-soon/slots`) becomes: enabled only when `useEmployerRegistrations()` contains an item with `driveId === id` **and** `status === 'Approved'` (the tracker rows already carry `driveId` + `status`); on click → `navigate('/employer/drives/${id}/slots')`. When not approved, the button is disabled with a hint (e.g. tooltip/subtext "available after approval"). Route added to `App.tsx` under `<RoleRoute role="employer"><EmployerShell><EmployerSlots/></EmployerShell></RoleRoute>`, distinct from `/employer/drives/:id` and `/employer/drives/:id/register`.

## Error handling

`{ error: { message, code } }` throughout. zod → `400 validation`; `requireRole` → `403 forbidden`; no token → `401`; foreign/nonexistent slot on PATCH/DELETE → `404 not_found` (no enumeration oracle); business preconditions → `400` with distinct codes: `registration_not_approved`, `date_not_in_schedule`, `slot_exists`, `slot_cap_reached`, `slot_has_bookings`, `slot_cancelled`.

## Testing

### Server — `server/test/employer-slots.route.test.ts`
- Create success: `Slot` persisted with `employerId = self`, `driveId`, a `date` in the drive's schedule, `status:'Scheduled'`; `auto` link → stub URL, `own` link → the given URL.
- Gate: no approved registration → `400 registration_not_approved`; a Pending-only registration does **not** unlock it.
- `date` not in `drive.eventDates` → `400 date_not_in_schedule`.
- `end <= start` → `400`; `capacity` out of [1,50] → `400`.
- Duplicate (same date+start) → `400 slot_exists`; `slotCap` reached → `400 slot_cap_reached`.
- **List scoped to the employer** — employer B cannot see employer A's slots; foreign `slotId` on PATCH/DELETE → `404` (indistinguishable from not-found).
- Reschedule (PATCH) success updates date/time; capacity below derived booked → `400` (0 today, assert the guard path).
- DELETE removes the slot; a slot with a candidate `SlotBooking` → `400 slot_has_bookings` (seed one booking to assert the guard).
- The new slot surfaces in the dashboard aggregate (`GET /api/me/employer` calendar/KPIs).
- `401` no token / `403` admin token on the slot routes.
- Admin `/api/slots` + candidate `SlotBooking` behavior unchanged (a regression touch-test).

### Client — `client/src/test/EmployerSlots.test.tsx`
- List renders existing slots (date/time/capacity/status).
- Add-form: empty required `date` blocks submit and shows `.show-err`; a valid submit POSTs the expected body (`date`, `start`, `end`, `capacity`, `linkMode`) and refreshes the list.
- The `date` dropdown is limited to the drive's `eventDates`.
- Cancel removes the row (DELETE fires; list refreshes).
- Detail-page CTA test: "View slots" is disabled without an Approved registration and enabled + routes to `/employer/drives/:id/slots` with one.

## Verification

Full server + client suites green, both `tsc --noEmit` clean, client build OK. Live E2E on an isolated DB (`matchday_employer4_smoke`, dropped after; shared `matchday` untouched): employer with an approved registration → create a slot (date in schedule) → 201 with `employerId` set → appears in the per-drive list AND the dashboard calendar; a date not in the schedule → 400; a second employer cannot see the slot; reschedule + delete; admin token → 403.

## Follow-ups / known stubs

- The `auto` meeting link is a stub URL (no real conferencing integration).
- `booked`/`held` derive to 0 until Slice 5 wires candidate `SlotBooking`s; the "seats left" math is already correct for that future.
- Reschedule/cancel guards against candidate bookings are present but exercise a moot path this slice (asserted via a seeded booking).
