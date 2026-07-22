# Jobseeker Portal — Slice JS-D (Slot Self-Booking) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** A seeker can view an eligible drive's interview slots and book / cancel their own booking — deriving identity from the JWT (today only an admin route creates a `SlotBooking`).

**Tech:** Express/Mongoose (ESM), Zod; React + React Query. Vitest.

## Global Constraints
- Branch `feat/jobseeker-portal-completion` (base `751412d`). Endpoints on the existing `/api/me` seeker gate; `jobseekerId` from `req.userId` (NEVER the body). **Reuse the existing validation core** `createBooking(slotId, jobseekerId, status)` from `server/src/modules/slotBookings/slotBookings.service.ts` (it already enforces Match-Ready + drive-eligibility + not-already-booked + capacity) — the seeker route just supplies `req.userId` as the jobseekerId. Cross-drive/ineligible → 404 (no oracle). Error envelope `{error:{message,code}}`; ESM `.js`.

## Prereq
Baseline: `npm test -w server -- --run test/seeker-account.route.test.ts` green. Read `slotBookings.service.ts` first — reuse `createBooking` and its error codes; do NOT reimplement its validation.

---

## Task 1: Server — eligible-slot listing + book/cancel

**Files:** Modify `seekerPortal.service.ts`, `seekerPortal.controller.ts`, `seekerPortal.routes.ts`; Create `server/test/seeker-booking.route.test.ts`.

**Interfaces:** `listDriveSlots(jobseekerId, driveId)`, `bookSlot(jobseekerId, slotId)`, `cancelBooking(jobseekerId, slotId)`; routes `GET /portal/drives/:driveId/slots`, `POST /portal/slots/:slotId/book`, `DELETE /portal/slots/:slotId/book`.

- [ ] **Step 1: Failing test** — `server/test/seeker-booking.route.test.ts` (mirror `seeker-reveal.route.test.ts`). Seed: Institute; a Jobseeker with `passwordHash`, **stage `MatchReady`**, branch/gradYear/source matching a Drive's eligibility; the Drive (`status:'Active'`, matching eligibility); an Employer; two Slots on that drive (`status:'Scheduled'`, future `date`, `capacity` e.g. 2). Mint `jsToken`. Assert:
  - `GET /api/me/portal/drives/:driveId/slots` → 200, lists the drive's non-Cancelled slots with `{id,date,start,end,capacity,booked,mine:false}`.
  - `POST /api/me/portal/slots/:slotId/book` (with a spoofed `jobseekerId` in the body) → 201/200; a `SlotBooking` now exists for THIS seeker (not the spoofed id); re-GET shows that slot `mine:true`, `booked:1`. Booking the same slot again → `400` (already booked). 
  - Capacity: fill a slot to capacity (book the seeker once; for the cap test either set capacity 1 and have another booking, or assert the guard code path) → over-capacity `400`.
  - Eligibility/oracle: a Drive the seeker is NOT eligible for (different branch) → `GET slots` and `POST book` → `404` (no oracle). A non-MatchReady seeker booking → the guard's 400 (`not_match_ready` or equivalent from `createBooking`).
  - `DELETE /api/me/portal/slots/:slotId/book` → removes the seeker's own booking (re-GET `mine:false`, `booked:0`); deleting when none → `404`.
  - `401` no token; `403` admin token — on all three.

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Service** — append to `seekerPortal.service.ts` (import `SlotBooking` from `../../models/SlotBooking.js`, `createBooking` from `../slotBookings/slotBookings.service.js`; `Slot`/`Drive`/`Jobseeker` already imported; `isEligible` is in-module). Implement:
  - `async function eligibleDriveOr404(jobseekerId, driveId)`: validate ids; load the seeker + drive; if drive missing/not Active-or-Published OR `!isEligible(drive.eligibility, seeker)` → `throw HttpError(404, 'Drive not found', 'not_found')`; return `{ seeker, drive }`.
  - `listDriveSlots(jobseekerId, driveId)`: `eligibleDriveOr404`; `Slot.find({ driveId, status: { $ne: 'Cancelled' } })`; per slot derive `booked = SlotBooking.countDocuments({ slotId })` (batch via one aggregate `$group`), and `mine` = a `SlotBooking` exists for `{ slotId, jobseekerId }`; return `{ items: [{id,date(ISO),start,end,capacity,booked,mine}] }` sorted by date+start.
  - `bookSlot(jobseekerId, slotId)`: validate slotId; load the slot → 404 if missing/Cancelled; `eligibleDriveOr404(jobseekerId, String(slot.driveId))` (ensures the seeker is eligible for the slot's drive — 404 otherwise); then `await createBooking(slotId, jobseekerId, 'Booked')` (reuse — it enforces Match-Ready/eligible/duplicate/capacity and throws the right coded 400s); return the created booking (or `{ ok:true }`). Do NOT accept a body jobseekerId.
  - `cancelBooking(jobseekerId, slotId)`: validate; `const r = await SlotBooking.deleteOne({ slotId, jobseekerId })`; if `r.deletedCount === 0` → `404 not_found`; return `{ ok:true }`.

- [ ] **Step 4: Controllers + routes** — add `driveSlotsController` (`res.json(await listDriveSlots(req.userId, req.params.driveId))`), `bookSlotController` (`res.status(201).json(await bookSlot(req.userId, req.params.slotId))`), `cancelBookingController` (`res.json(await cancelBooking(req.userId, req.params.slotId))`). Routes:
```ts
seekerPortalRoutes.get('/portal/drives/:driveId/slots', asyncHandler(driveSlotsController));
seekerPortalRoutes.post('/portal/slots/:slotId/book', asyncHandler(bookSlotController));
seekerPortalRoutes.delete('/portal/slots/:slotId/book', asyncHandler(cancelBookingController));
```
(No request body is read for book/cancel — identity is `req.userId`.)

- [ ] **Step 5: Green + full server suite + tsc** — targeted + `npm test -w server` + `npx -w server tsc --noEmit`. (If `createBooking`'s error codes differ from the test's expectations, adjust the TEST to assert the ACTUAL codes `createBooking` throws — do not weaken `createBooking`.)

- [ ] **Step 6: Commit** — `git add server/src/modules/seekerPortal server/test/seeker-booking.route.test.ts && git commit -m "feat(server): jobseeker portal slot listing + self-book/cancel"`

---

## Task 2: Client — booking UI on My Drives

**Files:** Create `client/src/pages/Portal/DriveSlots.tsx`, `client/src/hooks/useBooking.ts`; Modify `client/src/pages/Portal/DrivesList.tsx`; Create `client/src/test/PortalBooking.test.tsx`.

- [ ] **Step 1: Failing test** — `client/src/test/PortalBooking.test.tsx` (mirror the Portal harness). Render `DrivesList` (or a small wrapper) with one drive; mock `GET /me/portal/drives/:id/slots` → two slots (one `mine:false` bookable, one `mine:true`). Assert: clicking **View slots** / **Book a slot** on the drive loads + shows the slots; a bookable slot shows **Book** → clicking fires `POST /me/portal/slots/:slotId/book`; the `mine:true` slot shows **Cancel** → clicking fires `DELETE /me/portal/slots/:slotId/book`; a full slot (`booked>=capacity` && `!mine`) shows "Full" and no Book.

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Hooks** — `client/src/hooks/useBooking.ts`: `useDriveSlots(driveId, enabled)` (query `['drive-slots', driveId]` → `/me/portal/drives/${driveId}/slots`, `enabled`), `useBookSlot()` (POST `/me/portal/slots/:slotId/book`, invalidate `['drive-slots']`+`['portal']`), `useCancelBooking()` (DELETE same path, invalidate). Mirror `useActivity.ts`.

- [ ] **Step 4: UI** — `DriveSlots.tsx`: given a `driveId`, renders the slots list (date/start–end, `booked/capacity`, and per slot: **Book** if `!mine && booked<capacity`, **Cancel** if `mine`, "Full" if `!mine && booked>=capacity`). In `DrivesList.tsx`, add a **View slots** / **Book a slot** toggle per drive that mounts `<DriveSlots driveId={drive.id} />` inline (expand/collapse). Reuse `.card`/`.drive`/`.tag`/`.btn`; minimal `portal.css` additions only if unstyled.

- [ ] **Step 5: Green + full client suite + tsc + build** — targeted + `npm test -w client` + `npx -w client tsc --noEmit` + `npm run -w client build`.

- [ ] **Step 6: Commit** — `git add client/src/pages/Portal/DriveSlots.tsx client/src/hooks/useBooking.ts client/src/pages/Portal/DrivesList.tsx client/src/test/PortalBooking.test.tsx && git commit -m "feat(client): jobseeker portal slot self-booking UI"`

---

## Notes
- Booking REUSES `createBooking` (shared Match-Ready/eligibility/duplicate/capacity validation) — the seeker route only supplies `req.userId`. A body `jobseekerId` is never read. Cross-drive/ineligible access → 404 no-oracle. Cancel only removes the seeker's OWN booking. This is the only net-new seeker WRITE that creates a cross-entity row (`SlotBooking`); it flows into the employer's derived slot "booked" counts automatically.
