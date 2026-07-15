# Slots Module — MERN Slice Design

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Depends on:** all five prior slices — reuses auth, app shell, conventions, and the `Slot`/`Drive`/`Employer` collections. Includes a coordinated **Slot schema migration** that touches the Command Center (like the `eventDates[]` migration in the Drives slice).
**Source prototype:** `matchday-admin-app_23.html` — Slot Calendar page (lines 1971–2004) + calendar runtime (lines 3554–3675).

## 1. Goal & Scope

The sixth vertical slice: a **slot calendar** — Month/Week/Day views over interview slot *sessions* with full CRUD and operational quick-actions — replacing the "Coming soon" placeholder at the `Slots` nav. Migrates the `Slot` collection from per-interview-seat docs to **session** docs (one doc per time window with capacity/booked counts), keeping a single source of truth for both the calendar and the Command Center.

### In scope
- **Calendar page** (`/slots`): Month / Week / Day view toggle, prev / Today / next navigation, period title, employer filter, Create Slot.
  - **Month**: 42-cell grid; per day up to 3 slot chips (`start · employer-first-word`, Completed/Cancelled styling) + "+N more" → Day view; click a chip → edit modal; click an empty in-month cell → create modal pre-dated; Wed/Sat cells highlighted.
  - **Week**: 7 day-columns with slot entries; day-header click → Day view.
  - **Day**: rich slot cards — time range, employer, status badge, drive, `booked/capacity` + capacity bar, attended & no-shows (Completed), link availability — with actions **Join** (open link), **Link** (edit/generate), **Reschedule** (date/start/end), **No-shows** (attended → `noShow = booked − attended`, status → Completed), **Edit**.
- **Slot modal** (create/edit): date, start, end, capacity (1–50), booked, status (Scheduled/Completed/Cancelled), allocate employer (or Unallocated), drive, meeting link + **Generate**, attended, no-shows; **Delete** on edit.
- **Slot schema migration** (seat → session) + **Command Center aggregation/tests migration** in one coordinated task.
- **Seed rewrite** to sessions (tuning **Option B**: Σcapacity 360 / Σbooked 288 / Σheld 36 → utilization **80%**, matching the prototype's headline; readiness moves **82 → ~84**, accepted).
- Sidebar "Slots" → `/slots`.

### Out of scope (deferred)
- Booking individual candidates into slots (no candidate↔slot link yet).
- Recurring-slot generation, drag-and-drop rescheduling.
- The dashboard "Slot Utilization / Manage" card link-through (can navigate to `/slots` — trivial, included).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Schema | **Migrate `Slot` to sessions** (single source of truth; coordinated CC migration) |
| Views | All three: Month / Week / Day |
| Seed tuning | **Option B** — Σcap 360 / booked 288 / held 36 → donut **288/36/36/360 = 80%**; readiness becomes **~84 "On track"** (accepted). The prototype's own legend (288+36+72≠360) is internally inconsistent; we preserve its headline 80% and the 288/36 figures. |
| "Today" | Real `new Date()` (in-world it is July 2026, matching the seed) |
| Meeting links | Client-generated `https://meet.hiringhood.com/<random8>` (display-only) |
| Held seats | A `held` count field per session (dashboard concept only; not editable in the modal) |

## 3. Schema — `Slot` (MIGRATED — breaking enum change, coordinated)

```ts
Slot {
  driveId: ObjectId → Drive;
  employerId: ObjectId → Employer | null;      // null = Unallocated
  date: Date;                                   // UTC midnight of the session day
  start: string; end: string;                   // 'HH:MM'
  capacity: number;                             // 1–50, default 10
  booked: number;                               // default 0
  held: number;                                 // default 0 (dashboard-only)
  status: 'Scheduled' | 'Completed' | 'Cancelled';   // was 'booked'|'held'|'available'
  link: string;                                 // default ''
  attended: number; noShow: number;             // default 0
  createdAt: Date;                              // explicit (no timestamps)
}
```
The legacy per-seat `status: 'booked'|'held'|'available'` disappears; nothing outside the dashboard + seed reads it, so the migration is contained to model + dashboard service + dashboard tests + seed (one task).

## 4. Command Center migration

`dashboard.service.ts` slot reads become session sums:
- `slotUtilization`: `booked = Σbooked`, `held = Σheld`, `total = Σcapacity`, `available = total − booked − held`, `utilizedPct = round(booked/total·100)` — DTO shape unchanged.
- Demand funnel: `Slots Opened = Σcapacity`, `Slots Booked = Σbooked`.
- Readiness slots pillar: `pct(Σbooked, Σcapacity)`.
- Events list per drive: `slots = Σcapacity(driveId)`, `prepPct = pct(Σbooked(driveId), Σcapacity(driveId))`.
- KPIs `slotsBooked` display `booked / total`; `slotsAvailable = available`.
Fixture tests rewritten with session fixtures preserving asserted values (e.g. two sessions `{cap 5, booked 3, held 1}` ×2 → booked 6 / held 2 / total 10 / **util 60** — same assertions). Live post-seed expectations: utilization **80%**, readiness **~84** (verified in E2E; the exact readiness is recomputed, not pinned).

## 5. API (`/api/slots`, protected by `requireAuth`)

Errors: standard `{ error: { message, code } }` contract.

- **`GET /`** — query `from`, `to` (ISO dates, inclusive day range — the visible month/week/day), optional `employerId`. Returns `{ items: SlotItem[] }` sorted by `date` then `start`. `SlotItem` = the session fields + `id`, `employerName` ('(Unallocated)' when null) and `driveName` via `$lookup`.
- **`POST /`** — zod: `date` (coerce date), `start`/`end` (`/^\d{2}:\d{2}$/`), `capacity` int 1–50, `booked` int ≥0, `held` int ≥0 (default 0), `status` enum (default Scheduled), `employerId` (ObjectId or null/''), `driveId` (ObjectId, required, must resolve), `link` (URL-or-empty), `attended`/`noShow` int ≥0; refine `booked + held ≤ capacity` and `attended ≤ booked`. → 201.
- **`GET /:id`** / **`PATCH /:id`** (partial update — powers edit, reschedule, link save, and no-shows: the client sends `{attended, noShow, status:'Completed'}`) / **`DELETE /:id`** → `{ deleted: true }`. 404 on unknown/malformed id.

Module: `server/src/modules/slots/` (schemas/service/controller/routes). Mounted before `errorHandler`.

## 6. Frontend

Route `/slots` (protected). Sidebar "Slots" → `/slots`.

`client/src/pages/Slots/`:
- `index.tsx` — `AppShell` (crumb "Demand", title "Slot Calendar"); state `view` ('month'|'week'|'day'), `refDate` (Date), `employerId`, `modal` (create/edit), `actionModal` (link/reschedule/noshow). Computes the visible `from`/`to` from view+refDate; `useSlots({from,to,employerId})` (key `['slots', from, to, employerId]`). Toolbar: `.calseg` view toggle, `.cal-nav` prev/Today/next (month steps a month; week ±7d; day ±1d), `.cal-title` per view, employer `<select>` (from `useEmployers({limit:100})`), Create Slot.
- `MonthView.tsx` / `WeekView.tsx` / `DayView.tsx` — ports of the prototype renderers (`.cal-month/.cal-dow/.cal-grid/.cal-cell` dim/event/today, `.cal-chip` done/cancel, `.cal-more`; `.cal-week/.cal-wcol/.wh/.wb/.wslot`; `.cal-dayv/.dslot/.dtime/.dmain/.dl/.cap-bar/.dacts`). 12-hour time helper (`to12`). Status badge map: Completed→st-active, Cancelled→st-archived, Scheduled→st-published.
- `SlotModal.tsx` — the full editor; Generate sets `https://meet.hiringhood.com/<random8>`; Delete (confirm) on edit; client-side validation mirroring zod (`booked+held ≤ capacity`, `attended ≤ booked`, times required). `held` not shown (dashboard-only).
- `SlotActionModal.tsx` — variants: link (input + generate), reschedule (date/start/end), noshow (attended input, max = booked; note "No-shows are calculated as booked − attended").
- `hooks/useSlots.ts`, `hooks/useSlotMutations.ts` (create/update/remove → invalidate `['slots']`; no dashboard invalidation needed — it refetches on load).

## 7. Seed (Option B tuning)

Replace the per-seat block: sessions on Jul 2026 days **1, 4, 8, 11, 15, 18, 22, 25, 29** (Wed/Sat), 2–3 windows/day from `[10:00–12:00, 14:00–16:00, 16:30–18:00]` (~22 sessions). Deterministic construction such that **Σcapacity = 360, Σbooked = 288, Σheld = 36** exactly (capacities ~12–20; booked ~75–85% of capacity with a final adjustment pass to hit the sums; `held` spread over future Scheduled sessions). Days before Jul 15: `Completed` with `attended ≤ booked` and `noShow = booked − attended`; ~2 sessions `Cancelled` (booked counts still contribute to sums — matches the dashboard reading all sessions); future days `Scheduled`, with links on future sessions. Employer/drive per session from the seeded lists (drive[0] weighted for Jul 15 so the next-MatchDay event reads well). Deterministic PRNG; `RegistrationRequest`-style deleteMany already covers Slot.

## 8. Testing (TDD)

- **Server**: slots service (range query incl. boundary days + employer filter + name joins; create with refine guards → 400s; patch round-trips reschedule/link/no-shows; delete + 404s); **migrated dashboard tests** (session fixtures; same asserted utilization/funnel/readiness-pillar semantics); routes (401, CRUD round-trip, invalid body 400).
- **Client**: MonthView renders chips + "+N more" from a mocked payload and a chip click fires the edit callback; DayView renders a card with capacity bar + actions; SlotModal validation blocks `booked > capacity`; a mutation flow with mocked API.

## 9. File Structure Additions

```
server/src/
  models/Slot.ts                              # migrated to sessions
  modules/slots/
    slots.schemas.ts slots.service.ts slots.controller.ts slots.routes.ts
  modules/dashboard/dashboard.service.ts      # session sums
  seed/seed.ts                                # session seeding (Option B sums)
server/test/
  slots.service.test.ts slots.route.test.ts
  dashboard.service.test.ts                   # rewritten slot fixtures
client/src/
  types/slots.ts
  pages/Slots/
    index.tsx MonthView.tsx WeekView.tsx DayView.tsx SlotModal.tsx SlotActionModal.tsx
    hooks/useSlots.ts useSlotMutations.ts
  App.tsx components/Sidebar.tsx              # route + nav
client/src/test/
  MonthView.test.tsx SlotModal.test.tsx
```

## 10. Status Model

`Scheduled` (default; future/active) → `Completed` (session held; attendance recorded) · any → `Cancelled`. No transition enforcement server-side (the modal/actions set status directly, matching the prototype); `Cancelled` chips/cards render struck/danger styling; Join hidden for Cancelled.
