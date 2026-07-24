# Employer Dashboard — V1 Full Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild `EmployerDashboard` to the `MatchDay_Employer_V1.html` layout — 8-tile KPI grid, Hiring funnel, Active drives, Pending actions, MatchDay month-calendar, Recent notifications — populated by REAL portal data only (no fabricated stats).

**Architecture:** Extend the existing `/api/me/employer` aggregate with derived, PII-free dashboard data (no new endpoint, no cycle with the reports service); the client also reuses the existing reports endpoint for the funnel/report-KPIs and composes the presentation. All prototype dashboard CSS already exists in `employer.css` — no new CSS.

**Tech Stack:** Node/Express + Mongoose (ESM, NodeNext, `.js` specifiers), Zod; React + React Query. Vitest + Supertest (server); Vitest + Testing Library (client).

## Global Constraints
- Branch `feat/employer-dashboard-v1` (worktree `~/code/matchday-empdash`), off `main` @665ffd3.
- REAL data only — no fabricated numbers. Omit demo-only cards with no source (pool/eval/skills) and KPI delta lines (no history).
- No PII on the dashboard (counts/drive-level only). No data-model change. Do NOT change `getReport`'s return shape or the reports page. Aggregate changes are ADDITIVE (existing `kpis.{activeDrives,upcomingInterviews,totalSlots}`, `calendar`, `registrations`, `shortlist`, `notifications`, `notificationsUnread` all preserved).
- Do NOT import `getReport` INTO `employerPortal.service.ts` (that service is imported BY `employerReports.service.ts` → would create a cycle). The funnel/report-KPIs come to the dashboard via the client calling the reports endpoint.
- Use "Jobseeker(s)" in all copy. Reuse existing `.employer-app` CSS classes; add no new CSS. Dark mode must keep working. `EmployerDashboard` renders inside `EmployerShell` — no `.employer-app` re-wrap.

## Prereq
`cd ~/code/matchday-empdash && npm install`. Baseline: `npm test -w client` and `npm test -w server` pass (record counts).

---

## Task 1: Server — extend the aggregate `dashboard` with derived dashboard data

**Files:**
- Modify: `server/src/modules/employerPortal/employerPortal.service.ts` (`getEmployerPortal`)
- Modify: the dashboard type for the client — `client/src/types/employer.ts` (the aggregate/`dashboard` type)
- Test: `server/test/employer-portal.route.test.ts` (extend; find the existing `GET /api/me/employer` test)

**Interfaces:**
- Consumes: exported `poolSeekers(drive)` from `employerCandidates.service.js`; models `RegistrationRequest`, `Drive`, `Slot`, `Application`.
- Produces: the extended `dashboard` shape (below) consumed by Tasks 2–3.

Extended `dashboard` object (ADD these; keep all existing keys):
```ts
kpis: {
  activeDrives: number; upcomingInterviews: number; totalSlots: number;  // existing
  activeRegistrations: number;   // count of this employer's RegistrationRequest docs
  upcomingMatchDays: number;     // distinct future event-date count across the employer's registered drives
},
activeDrives: { id: string; name: string; status: string; primaryEventDate: string | null; sharedCount: number }[],
pendingActions: { id: string; text: string; kind: 'register' | 'slot' | 'shortlist'; urgency: 'today' | 'soon' | 'over' }[],
calendarEvents: { date: string; driveName: string; status: string }[],   // ISO date per registered-drive event date
```

- [ ] **Step 1: Write failing server test.** In `employer-portal.route.test.ts`, extend the aggregate test (or add one) that seeds an employer with an Approved registration + a drive with `eventDates` + a pool, then `GET /api/me/employer` and asserts: `body.dashboard.kpis.activeRegistrations` is a number ≥1, `body.dashboard.activeDrives` is a non-empty array whose items have `{id,name,status,primaryEventDate,sharedCount}`, `body.dashboard.pendingActions` is an array, and `body.dashboard.calendarEvents` is an array with `{date,driveName,status}` items. Run it — expect FAIL (fields undefined).
- [ ] **Step 2: Implement the derivations in `getEmployerPortal`.** After the existing derivations, before the `return`:
  - Load all the employer's registrations: `const allRegs = await RegistrationRequest.find({ employerId: empObjId }).sort({ createdAt: -1 }).lean();` (replaces relying only on the latest-5 `regRows` for the new derivations; keep `registrations` = first 5 mapped as today).
  - `activeRegistrations = allRegs.length`.
  - Load the drives for those regs: `const driveIds = [...new Set(allRegs.map(r => String(r.driveId)).filter(Boolean))];` then `const drives = await Drive.find({ _id: { $in: driveIds } }).lean();` Build a `Map<string, drive>`.
  - `calendarEvents`: for each reg with a drive, for each `eventDate` in the drive → `{ date: new Date(ed).toISOString(), driveName: drive.name, status: reg.status }`. (Dedupe by date+driveName.)
  - `upcomingMatchDays`: count of DISTINCT `calendarEvents` dates that are `>= now` (compare by UTC day).
  - `activeDrives`: Approved regs first (then others), map each to `{ id: driveId, name: drive.name, status: reg.status, primaryEventDate: <next future eventDate ISO or null>, sharedCount: <for Approved: (await poolSeekers(drive)).length; else 0> }`. Cap the list at 6.
  - `pendingActions` (cap 6, apply per the spec's rules): for each reg — (a) status 'Pending review' → `{kind:'register', text:'Registration under review — '+name, urgency:'soon'}`; for each Approved reg — (b) if `await Slot.countDocuments({ employerId: empObjId, driveId }) === 0` → `{kind:'slot', text:'Book a Wednesday slot — '+name, urgency:'today'}`; (c) else if pool non-empty and `await Application.countDocuments({ employerId: empObjId, driveId, decision: { $ne: null } }) === 0` → `{kind:'shortlist', text:'Shortlist jobseekers — '+name, urgency:'soon'}`. Give each a stable `id` (e.g. `\`${kind}:${driveId}\``).
  - Add all four (plus the two new kpi fields) to the returned `dashboard` object.
  - Import `poolSeekers`, `Application` at the top (`Application` from `../../models/Application.js`; `poolSeekers` from `./employerCandidates.service.js`). Do NOT import `getReport`.
- [ ] **Step 3: Run the server test — expect PASS.** `npm test -w server -- employer-portal`
- [ ] **Step 4: Update the client type.** In `client/src/types/employer.ts`, extend the dashboard type with the new `kpis` fields + `activeDrives`/`pendingActions`/`calendarEvents` (types matching the shape above). Keep existing fields.
- [ ] **Step 5: Verify + commit.** `npm test -w server && npx -w server tsc --noEmit && npx -w client tsc --noEmit`. `git add server/src client/src/types && git commit -m "feat(server): employer dashboard aggregate — funnel-adjacent KPIs, activeDrives, pendingActions, calendarEvents (derived, no PII)"`

---

## Task 2: Client — rebuild the dashboard body (KPIs, funnel, active drives, pending actions, notifications)

**Files:**
- Modify: `client/src/pages/EmployerPortal/EmployerDashboard.tsx`
- Reuse: the reports hook (find the hook powering `EmployerReports.tsx` — e.g. `useEmployerReports`; if none is reusable, add a thin `useEmployerReports('all')` in `hooks/`)
- Test: `client/src/test/EmployerDashboard.test.tsx`

**Interfaces:**
- Consumes: extended `dashboard` (Task 1) via `useEmployerPortal`; the reports `{ funnel, kpis }` for scope 'all' via the reports hook.

- [ ] **Step 1: Wire the reports query.** In `EmployerDashboard`, alongside `useEmployerPortal()`, call the reports hook for scope `'all'` to get `{ funnel, kpis }` (funnel = `{stage,count,conversionPct}[]`; kpis = `{recommended,shortlisted,interviewsScheduled,offersSent,offersAccepted,...}`). Handle its loading/empty state (zeros) gracefully.
- [ ] **Step 2: KPI grid.** Replace the current 3-KPI block with a `.kpi-grid` of 8 tiles, each `<div className="kpi"><div className="ktop"><span className="kic">{icon}</span><span className="klabel">{label}</span></div><div className="kn">{value}</div></div>` (NO `.kdelta`). Tiles + sources: Active registrations (`dashboard.kpis.activeRegistrations`), Upcoming MatchDays (`dashboard.kpis.upcomingMatchDays`), Jobseekers shared (`reports.kpis.recommended`), Shortlisted (`reports.kpis.shortlisted`), Interviews scheduled (`dashboard.kpis.upcomingInterviews`), Total slots (`dashboard.kpis.totalSlots`), Offers sent (`reports.kpis.offersSent`), Joined (`reports.funnel` last stage count, or `reports.kpis.offersAccepted`). Reuse the prototype tile SVG icons (copy from `MatchDay_Employer_V1.html` KPIS array, JSX-ified).
- [ ] **Step 3: Two-column `.dash-cols`.** Left `.dash-col`: Hiring funnel card + Active drives card + Pending actions card. Right `.dash-col`: MatchDay calendar (Task 3) + Recent notifications.
  - **Funnel card:** `.card` > `.card-head` (h3 "Hiring funnel" + a `.more`-style `<Link to="/employer/reports">View reports</Link>`) > `.card-body` rendering `reports.funnel.map(f => <div className="funnel-row"><span className="flbl">{f.stage}</span><span className="ftrack"><span className="ffill" style={{width: pct}}>{f.count}</span></span><span className="fpct">{pct}%</span></div>)` where `pct = funnel[0].count>0 ? round(f.count/funnel[0].count*100) : 0` (min width 8% like the prototype). Empty/zero → a "No pipeline data yet" hint.
  - **Active drives card:** `.card-head` h3 "Active drives" + `<Link to="/employer/registrations">All registrations</Link>`; body maps `dashboard.activeDrives` to `.drive-row` (`.drive-ic` icon, `.dn` name, `.dm` = formatted primaryEventDate, `.dmeta` > status-pill(status) + `.dcount` = `{sharedCount} shared`). Empty → hint.
  - **Pending actions card:** `.card-head` h3 "Pending actions" + a `.status-pill` count (`{n} to do`); body maps `dashboard.pendingActions` to `.action-row` (`.action-ic` with urgency class `a-over|a-today|a-soon`, `.at` text, `.ad` due-ish label, an `.action-btn` linking by `kind`→route: slot→`/employer/registrations`, shortlist→`/employer/drives`, register→`/employer/registrations`). Empty → "You're all caught up 🎉" hint.
- [ ] **Step 4: Keep** the Pending-review banner + greeting + Recent notifications card (existing rendering) in the right column.
- [ ] **Step 5: Update the test.** In `EmployerDashboard.test.tsx`, mock BOTH `/api/me/employer` (extended dashboard) and the reports endpoint; assert the KPI labels render with values, the funnel stages render, active-drives rows render, pending-actions render (and the empty states when arrays are empty). Don't weaken existing assertions.
- [ ] **Step 6: Verify + commit.** `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`. `git add -A client/src && git commit -m "feat(client): rebuild employer dashboard — 8-tile KPI grid + hiring funnel + active drives + pending actions"`

---

## Task 3: Client — MatchDay month-calendar

**Files:**
- Modify: `client/src/pages/EmployerPortal/EmployerDashboard.tsx` (add the calendar card + a small `MatchDayCalendar` component, same file or a sibling `EmployerDashboardCalendar.tsx`)
- Test: `client/src/test/EmployerDashboard.test.tsx` (add calendar assertions)

**Interfaces:**
- Consumes: `dashboard.calendarEvents` (`{date,driveName,status}[]`) from Task 1.

- [ ] **Step 1: Calendar component.** Build a month grid using the existing `.cal-head`/`.cal-grid`/`.cal-dow`/`.cal-day`/`.cal-legend` classes (ported in `employer.css`). State: the displayed month (default: current month). Render a 7-col grid: `.cal-dow` header row (S M T W T F S), leading blanks for the first-of-month weekday, then day cells. For each day: mark `.cal-day` `today` if today; mark `.matchday` (registered) if any `calendarEvents` date falls on that day; a plain Wednesday with no event can get a subtle `.wed` class (optional, only if that class exists). Prev/next buttons (`onClick` → shift month) with the `.cal-head` chevron SVGs. Legend: "Registered" swatch (matchday color) — drop the prototype's "Available MatchDay" legend item (no availability data). No click-popup.
- [ ] **Step 2: Slot it into the right `.dash-col`** above Recent notifications, in a `.card` with a `.card-head` h3 "MatchDay calendar".
- [ ] **Step 3: Test.** Assert the calendar renders the current month name and that a registered `calendarEvents` date renders a `.matchday` cell (seed a calendarEvents entry in the mock for a date in the current month). Assert prev/next changes the displayed month label.
- [ ] **Step 4: Verify + commit.** `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`. `git add -A client/src && git commit -m "feat(client): employer dashboard MatchDay month-calendar (registered-Wednesday highlight + month nav)"`

---

## Task 4: Full-suite verification

**Files:** none.
- [ ] `npm test -w client` + `npm test -w server` (all green), `npx -w client tsc --noEmit` + `npx -w server tsc --noEmit` clean, `npm run -w client build` ok. Report counts. No commit.

---

## Notes for the executor
- No new CSS — every class (kpi/ktop/kic/klabel/kn, funnel-row/ffill/flbl/fpct, drive-row/drive-ic/dn/dm/dmeta/dcount, action-row/action-ic/action-btn/at/ad, cal-head/cal-grid/cal-dow/cal-day/matchday/today/cal-legend, status-pill/st-*) already exists in `employer.css`. Read it to confirm exact class names before inventing.
- Do NOT import `getReport` into `employerPortal.service.ts` (cycle). Funnel comes to the client from the reports endpoint.
- REAL data only — no deltas, no pool/eval/skills cards, no fabricated counts. Empty arrays get honest empty states.
- Keep the aggregate change additive; the shell reads `notificationsUnread` and the dashboard reads the rest — don't rename existing keys.
