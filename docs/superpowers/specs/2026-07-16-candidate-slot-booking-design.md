# Candidate ↔ Slot booking — MERN Slice Design

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Depends on:** the completed port + the three prior real-link slices (Institute↔Drive, Employer↔Drive, Drive↔Template) — all on `origin/main` @332dc98. Reuses `Slot`, `Jobseeker`, `Drive`, the slots module + calendar UI, the dashboard service, and the `isEligible` matcher from `seekerPortal.service.ts`. Adds ONE new collection (`SlotBooking`).
**Context:** Fourth and biggest "real cross-entity link" slice. `Slot.booked` and `Slot.held` are currently **stored aggregate numbers** with no candidate behind them — the seed tunes them to exactly **cap 360 / booked 288 / held 36** so the Command Center slot donut reads the prototype's **80%** and the readiness score is **84** (deliberate, user-approved). `booked` also feeds the demand funnel ("Slots Booked"), the per-drive schedule prep %, and two KPIs (`slotsBooked`, `slotsAvailable`). There is **no candidate roster or booking UI anywhere** in the prototype: `booked` is a hand-typed number in the slot modal and `held` has no UI at all. This slice introduces a real jobseeker↔slot booking relationship, derives `booked`/`held` from it (removing the stored fakes), and re-seeds real bookings so every tuned CC number stays exact.

## 1. Goal & Scope

Make Candidate↔Slot a real link: a `SlotBooking` collection records which Match-Ready+ candidates are Booked or Held in each slot; `Slot.booked`/`held` become live-derived counts (the stored fakes deleted); an admin roster UI lets you book/hold/confirm/release candidates; and the seed creates real bookings that reproduce the tuned totals.

### In scope
- **`SlotBooking` collection** — `{ slotId, jobseekerId, status: 'Booked' | 'Held', createdAt }`, unique `(slotId, jobseekerId)`.
- **Derived `Slot.booked`/`held`** — computed on read in `listSlots` (one aggregation) and in `dashboard.service` (global counts + per-drive join). The stored `booked`/`held` fields are **removed** from the `Slot` model, the slot schemas, and the seed's slot docs.
- **Booking rules (server-enforced):** candidate must be **Match-Ready+** (stage ∈ MatchReady/Shortlisted/Offer/Joined) **AND** satisfy the slot's drive eligibility (reuse `isEligible`); derived `booked + held < capacity`; unique per (slot, candidate).
- **Booking API** (admin-only, nested under a slot): roster read, eligible-candidate picker, create (book/hold), confirm (Held→Booked), delete (unbook/release).
- **Client `SlotRosterModal`** — Booked + Held rosters, searchable eligible-candidate picker with Book/Hold, per-row Confirm/Remove, live booked/held/capacity header, list invalidation on mutate.
- **`SlotModal`** — the hand-typed `booked` input becomes a read-only derived display.
- **Seed** — real `SlotBooking` docs per slot reproducing cap 360 / booked 288 / held 36.

### Out of scope (deferred)
- **Per-booking attendance** — `attended`/`noShow` stay stored aggregates on the slot; the "Track No-Shows" action is unchanged.
- **Candidate self-booking from the jobseeker portal** (the user's parallel work). The portal could later *read* `SlotBooking` to show a seeker's booked slot — not built here.
- **A global one-active-slot-per-candidate limit** — a candidate may hold bookings across multiple slots (different sessions/drives).
- **Reschedule moving bookings** — reschedule changes the slot's date/time; its bookings ride along via `slotId`.
- Command Center layout changes (it reads the same derived values; only the source changes).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Scope | Full: derive + roster + book/unbook action |
| Booking states | Book + Hold, both manageable (create hold; confirm Held→Booked; release) |
| Eligibility | Match-Ready+ **and** matches the drive's eligibility (`isEligible`) |
| Attendance | Keep aggregate on the slot (unchanged) |
| `booked`/`held` | Derived-on-read; stored fields removed from model + schema + seed |
| Uniqueness | Unique `(slotId, jobseekerId)`; cross-slot reuse allowed |
| Cascade | Deleting a slot deletes its bookings |

## 3. Server changes

### 3.1 New model — `server/src/models/SlotBooking.ts`
```
slotId:       ObjectId ref 'Slot', required
jobseekerId:  ObjectId ref 'Jobseeker', required
status:       enum ['Booked','Held'], required
createdAt:    Date, default Date.now
```
Unique compound index: `{ slotId: 1, jobseekerId: 1 }`.

### 3.2 `Slot` model — `server/src/models/Slot.ts`
Remove the `booked` and `held` fields. Keep everything else (`driveId`, `employerId`, `date`, `start`, `end`, `capacity`, `status`, `link`, `attended`, `noShow`, `createdAt`).

### 3.3 Slot schemas — `server/src/modules/slots/slots.schemas.ts`
Remove `booked`/`held` from `slotFields` (so create/update no longer accept them). Remove the `booked + held <= capacity` refine from `createSlotSchema` (capacity is now checked at booking time, not slot-create time). Keep the `attended <= booked` relationship but **move its enforcement to the service** (booked is no longer an input); the create schema keeps only `attended` as an int ≥ 0. `updateSlotSchema` stays `slotFields.partial()`.

### 3.4 Slot service — `server/src/modules/slots/slots.service.ts`
- `SlotItem` keeps `booked`/`held` (now derived, not stored).
- `listSlots`: after the existing employer/drive `$lookup` pipeline, run one `SlotBooking.aggregate([{ $group: { _id: { slotId, status }, n } }])` (or `$match` slotIds in the page), build `Map<slotIdStr, {booked, held}>`, overlay onto items (default 0/0).
- `createSlot`: no booked/held input; the created slot derives to 0/0. A fresh slot has no bookings, so if `attended > 0` is supplied it must 400 (`attended <= derived booked` where booked is 0) — realistically create passes `attended: 0`.
- `updateSlot`: drop the `booked + held <= capacity` check (no longer settable). Keep `attended <= booked` by fetching the **derived** booked count (`SlotBooking.countDocuments({ slotId, status: 'Booked' })`) and comparing to the merged `attended`; 400 on violation. Same derived-booked comparison is applied by `createSlot`.
- `deleteSlot`: `await SlotBooking.deleteMany({ slotId: s._id })` before/after removing the slot (cascade).

### 3.5 New booking module — `server/src/modules/slotBookings/`
`slotBookings.schemas.ts`, `slotBookings.service.ts`, `slotBookings.controller.ts`, `slotBookings.routes.ts`. Mounted under the slots router (or app) as:
- `GET  /api/slots/:id/bookings` → `{ booked: RosterEntry[], held: RosterEntry[] }` where `RosterEntry = { bookingId, jobseekerId, name, institute, branch, stage, status }` (join Jobseeker + its Institute name).
- `GET  /api/slots/:id/eligible-candidates?q=` → `{ items: CandidateOption[] }` — jobseekers that are Match-Ready+ **and** `isEligible(drive.eligibility, seeker)` for the slot's drive **and** not already booked/held in this slot; optional case-insensitive name search `q`; capped (e.g. 50).
- `POST /api/slots/:id/bookings` `{ jobseekerId, status: 'Booked'|'Held' }` → validates all rules → 201 with the created booking. 400 on ineligible / over-capacity / duplicate.
- `PATCH /api/slots/:id/bookings/:bookingId` `{ status: 'Booked' }` → confirm a Held → Booked (seat count unchanged, so no capacity re-check needed; still validates the booking belongs to the slot). 404 if not found.
- `DELETE /api/slots/:id/bookings/:bookingId` → release/unbook → `{ deleted: true }`. 404 if not found.

**Booking-service rules** (`bookCandidate`):
1. Resolve slot → 404 if missing; resolve its `driveId` → drive (for eligibility).
2. Resolve jobseeker → 404 if missing.
3. Reject if `seeker.stage ∉ {MatchReady, Shortlisted, Offer, Joined}` → 400 `not_match_ready`.
4. Reject if `!isEligible(drive.eligibility, seeker)` → 400 `not_eligible`.
5. Capacity: current derived `booked + held` (count of this slot's bookings) must be `< slot.capacity` → else 400 `slot_full`.
6. Create; the unique index turns a duplicate into 409/400 `already_booked` (catch the dup-key error and map to the contract).

All routes `requireRole('admin')` (consistent with every admin router post-jobseeker-portal). Error contract `{error:{message,code}}`; zod → 400.

### 3.6 Dashboard — `server/src/modules/dashboard/dashboard.service.ts`
Replace the stored-field slot aggregation:
- `totalSlots` (capacity) still `Slot.aggregate($sum capacity)`.
- `booked` = `SlotBooking.countDocuments({ status: 'Booked' })`; `held` = `countDocuments({ status: 'Held' })` (global, all slots — matches today's behavior including cancelled slots).
- `available = max(0, totalSlots - booked - held)`.
- Per-drive schedule prep (`events` loop): replace the per-drive `Slot.aggregate($sum booked)` with a join — aggregate `SlotBooking` matched to the drive's slot ids (`Slot.find({driveId}).distinct('_id')` then `countDocuments({ slotId: { $in }, status: 'Booked' })`), keep `driveCap` from the slot capacity sum, `prepPct = pct(driveBooked, driveCap)`.
- Everything downstream (`slotUtilization`, `slotsPct`/readiness pillar, demand funnel "Slots Booked", `slotsBooked`/`slotsAvailable` KPIs) reads these variables unchanged → the tuned 288/360/36 → 80% donut → readiness 84 are preserved by construction.

## 4. Client changes

- **`client/src/types/slots.ts`:** `SlotItem` keeps `booked`/`held` (now derived). Add booking/roster types (`RosterEntry`, `CandidateOption`, `BookingStatus`).
- **New `client/src/pages/Slots/hooks/useSlotBookings.ts`:** React Query hooks — `useSlotRoster(slotId)`, `useEligibleCandidates(slotId, q)`, and mutations `bookCandidate`, `confirmBooking`, `releaseBooking`; all invalidate the roster query AND the `slots` list query on success (so the calendar cells' booked/capacity refresh).
- **New `client/src/pages/Slots/SlotRosterModal.tsx`:** header shows `booked / capacity` + `held`; two sections (Booked, Held) listing candidates (name · institute · branch · stage) with a Remove (release) button each and, for Held rows, a Confirm (→Booked) button; a searchable picker of eligible candidates with **Book** and **Hold** buttons. Reuses the prototype's `.modal`/`.fld`/`.btn` classes; no new CSS.
- **`client/src/pages/Slots/SlotModal.tsx`:** remove the `booked` number input and its validation; show `booked / capacity` as read-only text (derived). Remove `booked` from the submitted `SlotInput`. The `attended <= booked` client hint can read the slot's derived `booked` in edit mode (or be dropped — the server enforces it).
- **Slot cell entry point:** the calendar views (`DayView`/`WeekView`/`MonthView` or the slot action menu) get a "Manage roster" action / the booked count becomes clickable → opens `SlotRosterModal` for that slot. Wire through the page's existing modal state (`index.tsx`).

## 5. Seed — real bookings, identical totals

In `server/src/seed/seed.ts`, after the slot docs are inserted:
1. Keep the existing capacity/booked/held tuning (cap 360, booked 288, held 36 per-slot targets + the sum-check `throw`). These now define **target counts per slot**, not stored values.
2. Remove `booked`/`held` from the inserted slot docs (the fields no longer exist).
3. For each seeded slot: resolve its drive's eligibility; build the pool of Match-Ready+ jobseekers that `isEligible` for that drive; deterministically shuffle (seeded rng); take `target.booked` distinct candidates → `SlotBooking { status: 'Booked' }`, then the next `target.held` → `{ status: 'Held' }` (distinct within the slot; reuse across slots allowed). `insertMany` all bookings.
4. Guard: if any slot's eligible pool `< target.booked + target.held`, `throw` (like the existing sum-check). With 531 Match-Ready+ candidates and broad drive eligibility this is safe; the throw makes any regression loud.

Deterministic (seeded rng, no `Math.random`/`Date.now`). Result: derived `booked` sums to 288, `held` to 36, capacity 360.

## 6. File Structure

```
server/src/
  models/SlotBooking.ts                             # NEW collection + unique index
  models/Slot.ts                                    # - booked, - held
  modules/slots/slots.schemas.ts                    # - booked/held from fields + refine
  modules/slots/slots.service.ts                    # derive booked/held in listSlots; attended check vs derived; delete cascade
  modules/slotBookings/slotBookings.schemas.ts      # NEW
  modules/slotBookings/slotBookings.service.ts      # NEW — book/hold/confirm/release/eligible/roster + rules
  modules/slotBookings/slotBookings.controller.ts   # NEW
  modules/slotBookings/slotBookings.routes.ts       # NEW (requireRole admin)
  modules/dashboard/dashboard.service.ts            # booked/held from SlotBooking counts + per-drive join
  seed/seed.ts                                      # create SlotBooking docs; drop stored booked/held
  app.ts (or slots.routes.ts)                       # mount the nested booking routes
server/test/
  slotBooking.model.test.ts                         # unique index
  slotBookings.service.test.ts                      # rules: eligibility/capacity/dup, hold, confirm, release, eligible-candidates, roster
  slots.service.test.ts                             # listSlots derives booked/held; delete cascade; attended vs derived
  dashboard.route.test.ts / dashboard.service       # derived booked/held preserve totals
client/src/
  types/slots.ts                                    # roster/candidate types; SlotItem booked/held derived
  pages/Slots/hooks/useSlotBookings.ts              # NEW hooks
  pages/Slots/SlotRosterModal.tsx                   # NEW
  pages/Slots/SlotModal.tsx                         # booked input → read-only derived
  pages/Slots/index.tsx (+ Day/Week/MonthView)      # roster entry point
client/src/test/
  SlotRosterModal.test.tsx                          # book/hold/confirm/release + invalidation
  SlotModal.test.tsx                                # no booked in payload
```

## 7. Testing (TDD)

- **Server:**
  - `SlotBooking` model: unique `(slotId, jobseekerId)` rejects a duplicate.
  - `slotBookings.service`: book a Match-Ready+ eligible candidate persists Booked; ineligible stage → `not_match_ready`; drive-eligibility miss → `not_eligible`; at-capacity → `slot_full`; duplicate → `already_booked`; hold creates Held; confirm flips Held→Booked; release deletes; `eligible-candidates` returns only Match-Ready+ & drive-eligible & not-already-in-slot, honoring `q`.
  - `slots.service`: `listSlots` overlays derived booked/held (2 booked + 1 held → `{booked:2, held:1}`; none → 0/0); `deleteSlot` removes the slot's bookings; `updateSlot` rejects `attended > derivedBooked`.
  - `dashboard`: with seeded data, `slotUtilization` = `{booked:288, held:36, total:360, utilizedPct:80}` and `readiness.score` = 84 (reconciliation guard); booking one more candidate raises `booked`.
  - Fixtures via mongodb-memory-server with real `Slot`/`Jobseeker`/`Drive`/`SlotBooking` docs.
- **Client:**
  - `SlotRosterModal`: renders Booked + Held rosters from a mocked roster; Book/Hold/Confirm/Remove fire the right mutations and invalidate the slots list; the picker lists mocked eligible candidates and filters by search.
  - `SlotModal`: the submitted payload no longer contains `booked`; the booked/capacity display is read-only.
- **E2E (isolated DB, in the verification task):** seed → `GET /api/dashboard/overview` shows booked 288 / held 36 / cap 360, donut 80%, readiness 84; `POST /api/slots/:id/bookings` for an eligible Match-Ready candidate → 201, that slot's derived booked +1, CC booked +1; ineligible stage or drive → 400; booking into a full slot → 400; delete a slot → its bookings gone; reconcile CC booked == `SlotBooking.countDocuments({status:'Booked'})`.

## 8. Notes

- **Derived, never stored** — `booked`/`held` computed on every read; nothing to drift. Consistent with Institute `assignedDrives`, Employer `activeDrives`, Template `usedBy`.
- **Tuned numbers preserved by construction** — the seed reproduces the exact per-slot booked/held as real bookings, so every downstream CC number (donut 80%, readiness 84, funnel, KPIs, per-drive prep) is unchanged until an admin actually books/releases through the app.
- **Cancelled slots** still count their bookings toward CC booked (matches today's sum over all slots), so the 288 total holds.
- **Capacity is real config** — stays stored on the slot; only booked/held are derived.
- **`isEligible` reuse** — the booking eligibility rule uses the same matcher as the jobseeker portal (`branches/gradYears/sources`, empty = no constraint), keeping "who can book" consistent with "which drives a seeker sees."
- **Isolation/DB:** built in an isolated worktree (`/Users/srinivasarao.kandula/code/matchday-candslot`, off `origin/main`); the seed RUN + smoke happen against an isolated DB in the E2E task — the shared local `matchday` DB is the user's parallel-work space and must not be touched.
