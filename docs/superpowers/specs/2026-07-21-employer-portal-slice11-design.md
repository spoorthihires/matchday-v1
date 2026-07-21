# Employer Portal — Slice 11: Notifications

**Date:** 2026-07-21
**Status:** Approved
**Builds on:** 3 (`RegistrationRequest` + admin approval `activity[]`), 4 (`Slot`/`SlotBooking`), 5a (`Application` + `codeFor`), 5b (`Application.consent`). **Stacked** on `feat/employer-portal-slice10` (worktree `~/code/matchday-employer11`).
**Prototype:** `Matchday_Employer.html` — Screen 21 "Notification center" (bell + `#bellDot` topbar `~2687`; dashboard "Recent notifications" card `~2762`; center page `~3275`; JS `NOTIF_CATS`/`NOTIF_CHANNELS`/`notifItems`/`renderNotifCenter`/`markNotifRead`/`notifGo` `~7001–7125`; dashboard `renderNotifs`/`NOTIFS` `~4110`). CSS to port: `.notif-row`/`.notif-ic`/`.nt`/`.ntime` (+ `.ni-cand`/`.ni-ok`/`.ni-warn`); `.notif-list`/`.nc-item`(+`.unread`)/`.nc-ic`/`.nc-main`/`.nc-cat`/`.nc-title`/`.nc-body`/`.nc-meta`/`.nc-time`/`.nc-right`/`.nc-unread-dot`/`.nc-act`/`.notif-empty`; category chips reuse `.cand-summary`/`.cand-sumchip`.

## Scope note (decomposition)
The original "Slice 10" bundled Notifications + Reports + Team-access + Support. Reports shipped as Slice 10 (PR #35). This slice builds **Notifications**; **Team-access/RBAC** (an auth/identity change) and **Support** (thin/static) remain their own future slices.

## Summary
A **derived, in-app notification feed** of the asynchronous events an employer must react to — events triggered by *someone else* (admin approves a registration; a jobseeker grants/declines an identity reveal; a candidate books a slot). Everything is **computed on read** from state the portal already stores, each item carrying its real event timestamp; there is **no new entity, no write-path hooks in the producing services, and no PII** (candidate codes only). The **only** persisted state is a single per-employer **read cursor**.

**Decisions locked during brainstorming:**
1. **Architecture = derived feed + read cursor** (not a stored `Notification` entity + event hooks). Fits the codebase's derived-never-stored ethos; zero coupling into other slices' write paths.
2. **Events = async high-value only:** registration status changes (admin), consent granted/declined (jobseeker), slot bookings (candidate). All have real derivable timestamps.
3. **In-app only** — the prototype's per-category preferences matrix + delivery channels (email/calendar) are **dropped** (there is no email/calendar delivery backend; they would be fabricated UI).

## Non-goals (deliberate)
- No stored `Notification` collection; no event hooks in `employerConsent`/`employerInterviews`/`employerOffers`/admin services.
- No preferences/channels UI; no email/calendar/push delivery.
- No **per-item** read state — a single per-employer cursor gives the unread badge + "mark all as read". (Clicking an item deep-links; it does not persist an individual read flag.)
- Offer status + decision/stage change events are **excluded** — they have no per-event timestamp (only `Application.updatedAt`), so deriving accurate event times would be fabrication. (They are also the employer's *own* actions, not async.)
- No PII in any notification (candidate `code`, drive names, dates only) — even a granted-consent event names the candidate by code, not identity.

## Architecture

### Model change (the entire persistence footprint)
Add `notificationsReadAt?: Date` (optional, no default) to the `Employer` schema. Harmless in the existing `toJSON`/`toObject` transform (which strips `passwordHash`); it is the employer's own cursor.

### Server — derivation + endpoints (on the existing `/employer` gate)
New `server/src/modules/employerPortal/employerNotifications.service.ts`.

**`buildNotifications(employerId) → NotificationItem[]`** — derives the feed, sorted by `at` descending. Three sources, all scoped by `employerId`, all PII-free:

| Category | Source query | Event time | Title / body (illustrative) | Deep-link |
|---|---|---|---|---|
| `registration` | `RegistrationRequest.find({ employerId })`; for each, its `activity[]` entries whose `action ∈ {Approved, Rejected, Changes requested}` | `activity.at` | "Registration {action}" / `Your registration for "{driveName}" ({role}) was {action}.` | `/employer/registrations` |
| `candidate` | `Application.find({ employerId, 'consent.status': { $in: ['granted','declined'] } })` | `consent.respondedAt` (fallback `consent.requestedAt` if missing) | "Identity reveal {granted\|declined}" / `Candidate {code} {granted\|declined} your reveal request for "{driveName}".` | `/employer/drives/{driveId}/consent` |
| `slot` | this employer's slots (`Slot.find({ employerId }).select('_id driveId date start')`) → `SlotBooking.find({ slotId: { $in } })` | `booking.createdAt` | "New slot booking" / `Candidate {code} booked a slot on {date} at {start} for "{driveName}".` | `/employer/drives/{driveId}/slots` |

- `code = codeFor(jobseekerId)` (reuses 5a's `C-<last6>`). Drive names via one batched `Drive.find({ _id: { $in: driveIds } }).select('name')`.
- **Stable id** per item, deterministic (React key; forward-compatible with per-item read later): `reg:{regId}:{activityIndex}`, `consent:{applicationId}`, `booking:{bookingId}`.
- **`read`** = `at ≤ (employer.notificationsReadAt ?? new Date(0))`. **`unreadCount`** = number of unread items.

**`notificationsSummary(employerId) → { unreadCount, recent }`** (recent = top 5 of `buildNotifications`) — used by the dashboard aggregate so the shell badge + dashboard card cost no extra round-trip. Share the single derivation (compute once, slice for `recent`, count for `unreadCount`).

**Endpoints:**
- **`GET /api/me/employer/notifications`** → `{ items, unreadCount, lastReadAt }` (`lastReadAt` = the cursor or null).
- **`POST /api/me/employer/notifications/read`** → sets `Employer.notificationsReadAt = new Date()`; returns `{ lastReadAt, unreadCount: 0 }`.

**Aggregate extension** (`/api/me/employer`, `employerPortal.service.ts`): add `notificationsUnread: number` + `notifications: NotificationItem[]` (top 5) to the response (via `notificationsSummary`). The shell already loads this aggregate.

### Cross-slice notes
Reads only (`RegistrationRequest`, `Application`, `Slot`, `SlotBooking`, `Drive`) + reuses `codeFor`; the sole write is the employer's own `notificationsReadAt` cursor. **No producing service is modified** — the derived feed is decoupled from every other slice's write path. Admin modules untouched.

## Client — bell, page, dashboard card, hooks
- **Types** (`client/src/types/employer.ts`): `EmployerNotification` (`{ id, category: 'registration'|'candidate'|'slot', title, body, at, link, read }`), `EmployerNotificationsResponse` (`{ items, unreadCount, lastReadAt }`). Extend the portal aggregate type with `notificationsUnread` + `notifications`.
- **Hooks** (`hooks/useEmployerNotifications.ts`): `useEmployerNotifications()` (key `['employer-notifications']`) + `useMarkNotificationsRead()` (POST; invalidates `['employer-notifications']` + `['employer-portal']`).
- **Topbar bell** (`EmployerShell.tsx`): a bell icon in the existing `.tb-actions`, with a `.ndot` badge shown when `notificationsUnread > 0` (read from the `useEmployerPortal()` aggregate the shell already loads). Click → `navigate('/employer/notifications')`. (Ported from the prototype's `openNotifications()` bell.)
- **`EmployerNotifications` page** (`/employer/notifications`, in `EmployerShell`, `.page-wrap`): a `.dash-greet`-style heading; category filter chips (only `registration`/`candidate`/`slot`, "All" default) reusing `.cand-summary`/`.cand-sumchip`; the notification list (`.notif-list` of `.nc-item` rows — icon chip `.nc-ic` (per-category tint), `.nc-cat` label, `.nc-title`, `.nc-body`, `.nc-meta` with relative time, `.nc-right` unread-dot + "View →" `.nc-act` deep-link); a **"Mark all as read"** button (calls the mutation); loading / empty (`.notif-empty`) / error states. No preferences tab; no channel chips.
- **Dashboard "Recent notifications" card** (`EmployerDashboard.tsx`): render the aggregate's `notifications` (top 5) as ported `.notif-row` items with a "See all" link → `/employer/notifications`; empty state when none.
- **Route** (`App.tsx`): `/employer/notifications` wrapped in `RoleRoute role="employer" > EmployerShell > EmployerNotifications` (matching sibling routes). No sidebar nav item — the bell is the entry (as in the prototype).

## Error handling
`{ error: { message, code } }`. Role guards → 401 (no token) / 403 (non-employer). The notifications endpoints take no path params and no per-drive gate (the employer's own aggregate data), so there is no 400/404 surface beyond auth. Deep-link targets are existing employer routes.

## Testing

### Server (`employer-notifications.route.test.ts`)
- Seed one employer with: an approved (and a rejected) `RegistrationRequest` (`activity[]` entries), an `Application` with `consent.status='granted'` (+ one `declined`), and a `SlotBooking` on one of the employer's slots. Assert `GET .../notifications` returns the three categories, newest-first, with the expected `at` values and PII-free bodies (grep the payload for the seeded jobseeker name/email → absent; candidate `code` present).
- `read` flags: with `notificationsReadAt` unset → all `unread`, `unreadCount = items.length`. After `POST .../read` → `unreadCount = 0`, all items `read: true`, `lastReadAt` set; a re-fetch confirms persistence.
- Employer-scoping: employer B's registrations/consents/bookings never appear in employer A's feed.
- Aggregate: `GET /api/me/employer` includes `notificationsUnread` (matches the feed) + `notifications` (≤ 5, newest-first).
- `401` no token / `403` admin token on both endpoints.

### Client (`EmployerNotifications.test.tsx` + shell/dashboard)
- Renders the list + category chips from a mocked feed; a category chip filters the visible rows; unread rows show the dot; "View →" carries the item's `link`; "Mark all as read" fires the mutation and the badge/rows update; empty state when `items: []`.
- Shell: the bell badge shows when `notificationsUnread > 0` and is hidden at 0; clicking navigates to `/employer/notifications`.

## Verification
Full server + client suites green, both `tsc --noEmit` clean, client build ok. Live E2E on an isolated DB (`matchday_employer11_smoke`, dropped after; shared untouched): an employer with a seeded approval + consent response + slot booking → `GET notifications` returns the three items newest-first with real timestamps and no PII; `POST read` zeroes the unread count and persists; the aggregate exposes `notificationsUnread`/`notifications`; employer B's data is excluded; admin → 403; shared `matchday` untouched.

## Follow-ups / known stubs
- Offer/decision/stage events omitted (no per-event timestamp); if per-event history is ever added (offer status timestamps, or an event log), those categories can join the feed.
- No per-item read state (single cursor) — a later slice could add per-item read if needed.
- No delivery channels/preferences (in-app only); if email/calendar delivery is ever built, the dropped preferences matrix can return.
- Feed recomputed on read (no caching) — fine at prototype scale.
- Team-access (RBAC) and Support remain as future slices.
