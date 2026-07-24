# Employer Dashboard — V1 Full Rebuild

**Date:** 2026-07-24
**Status:** Approved (scope locked with the user: FULL match to the `MatchDay_Employer_V1.html` dashboard, populated by REAL portal data only; omit the prototype's demo-only cards that have no real data source — no fabricated stats).
**Prototype:** `MatchDay_Employer_V1.html` `#page-dashboard` (markup ~lines 2691–2760; demo render JS ~3996–4145). **Applies to** the built `client/src/pages/EmployerPortal/EmployerDashboard.tsx`, styled by `client/src/styles/employer.css` (scoped `.employer-app`). Branch `feat/employer-dashboard-v1` (worktree `~/code/matchday-empdash`), off `main` @665ffd3.

## Context
The Employer V1 brand pass (PR #41) reskinned brand/nav/copy but did NOT rebuild dashboards. The current `EmployerDashboard` is the Slice-1 simplified version: 3 KPIs (activeDrives/upcomingInterviews/totalSlots) + basic Registrations/Shortlist/Interviews/Notifications cards. The prototype dashboard is far richer: an 8-tile KPI grid, a Hiring funnel, an Active-drives list, a Pending-actions list, a MatchDay month-grid calendar, and Recent notifications.

**Everything the prototype shows maps to real data the portal already derives** — the `/api/me/employer/reports` service (`employerReports.service.ts` `getReport`) already computes the exact funnel (Recommended→Shortlisted→Confirmed→Interviewed→Offered→Accepted→Joined) + KPIs, and the `/api/me/employer` aggregate already has registrations/calendar/notifications. And **all prototype dashboard CSS classes already exist in `employer.css`** (funnel-row/ffill/flbl/fpct, action-row/action-ic/action-btn, cal-grid/cal-day/cal-dow/cal-head/cal-legend/matchday, drive-ic/dmeta/dcount, kdelta/ktop/kic, status-pill/st-shared/st-short/st-booked). So this is a data-plumbing + markup rebuild with no new CSS.

## Scope
1. **Server: extend the aggregate.** Add real, derived, PII-free fields to the `dashboard` object returned by `getEmployerPortal` (`employerPortal.service.ts`), reusing `getReport` for the funnel/KPIs:
   - `funnel`: the 7-stage funnel for scope=all (`getReport(employerId,'all').funnel` — `{stage,count,conversionPct}[]`).
   - `kpis` (ADDITIVE — keep the existing `activeDrives`/`upcomingInterviews`/`totalSlots`, add): `activeRegistrations` (count of this employer's registrations), `upcomingMatchDays` (count of distinct future event dates across their registered drives), `jobseekersShared` (funnel Recommended = report `recommended`), `shortlisted`, `offersSent`, `joined` (funnel Joined count).
   - `activeDrives`: `{id,name,status,primaryEventDate,sharedCount}[]` for the employer's registered drives (Approved first), `sharedCount` = `poolSeekers(drive).length` (reuse the exported helper).
   - `pendingActions`: derived to-dos `{id,text,kind,urgency}[]` from cheap real rules (see §Pending actions).
   - `calendarEvents`: `{date,driveName,status}[]` = the event dates (Wednesdays) of the employer's registered drives, for the month grid to highlight.
   - Keep `calendar`/`registrations`/`shortlist`/`notifications`/`notificationsUnread` unchanged (additive change — no existing consumer breaks).
2. **Client: rebuild `EmployerDashboard`** to the prototype layout consuming the extended aggregate:
   - **KPI grid** (`.kpi-grid`, 4-col): 8 real tiles (icon chip + label + number) — Active registrations, Upcoming MatchDays, Jobseekers shared, Shortlisted, Interviews scheduled (`upcomingInterviews`), Total slots, Offers sent, Joined. **No `.kdelta` line** (the app has no historical/time-series data — omit deltas rather than fabricate them).
   - **Hiring funnel** card (`.funnel-row`/`.ffill`/`.flbl`/`.fpct`) from `dashboard.funnel`, with a "View reports" link to `/employer/reports`.
   - **Active drives** card (`.drive-row`/`.drive-ic`/`.dmeta`/`.dcount`/status-pill) from `dashboard.activeDrives`, link to `/employer/registrations`.
   - **Pending actions** card (`.action-row`/`.action-ic`/`.action-btn`) from `dashboard.pendingActions`, with a count pill.
   - **MatchDay calendar** card — month grid (`.cal-head`/`.cal-grid`/`.cal-day`/`.cal-dow`/`.cal-legend`) highlighting the registered event dates from `dashboard.calendarEvents`, with prev/next month nav.
   - **Recent notifications** card — keep the existing rendering from `dashboard.notifications`.
   - Keep the "Pending review" banner (status==='Pending') and the greeting.
3. **Terminology:** use "Jobseeker(s)" (not "Candidate") in all new copy (consistent with the shipped Employer V1 sweep).

## Pending actions (derived, real, cheap)
Derive from state already loaded; cap at a small list. Rules:
- Registration with `status` = 'Pending review' → `{text:"Registration under review — {driveName}", urgency:'soon'}`.
- Approved registration with **0 slots** created (`Slot.countDocuments({employerId,driveId})===0`) → `{text:"Book a Wednesday slot — {driveName}", urgency:'today'}`.
- Approved registration whose pool has jobseekers but **0 decisions** (`Application.countDocuments({employerId,driveId, decision:{$ne:null}})===0` while `poolSeekers>0`) → `{text:"Shortlist jobseekers — {driveName}", urgency:'soon'}`.
Empty list → the card shows a "You're all caught up" empty state. No fabricated "feedback overdue" items (no feedback entity exists).

## Non-goals (deliberate)
- **No fabricated data.** Omit the prototype's demo-only cards with no real source: **candidate-pool summary, evaluation-coverage, skills-distribution** (dropped), and the **KPI delta lines** (no history). No fake counts anywhere.
- No PII on the dashboard (counts/derived only — the funnel/KPIs already emit no identities; `activeDrives`/`calendarEvents` are drive-level).
- No new endpoint (extend the existing aggregate); no data-model change; no change to `getReport`'s own return shape or the reports page; no change to other portal screens.
- No calendar click-popup / booking from the calendar (the prototype's popup is demo interaction) — the month grid highlights registered Wednesdays and supports prev/next nav only.
- No auth/role change. Dark mode must keep working (reuses existing `.employer-app` tokens/classes).

## Architecture
Server-authoritative aggregate: the dashboard makes ONE call (`useEmployerPortal` → `/api/me/employer`); the extended `dashboard` object carries everything. `getEmployerPortal` reuses `getReport(employerId,'all')` for funnel/KPIs and the exported `poolSeekers` for per-drive counts. All derived-never-stored, no PII. Client composes the presentation (icons/tones/labels) over the raw real numbers. `EmployerDashboard` renders inside `EmployerShell` (provides `.employer-app`) — no re-wrap.

## Testing / verification
Server: extend the employer-portal route test to assert the new `dashboard` fields (funnel array, expanded kpis, activeDrives, pendingActions, calendarEvents) on a seeded employer with an approved registration + pipeline. Client: update `EmployerDashboard.test.tsx` for the new sections (KPI tiles, funnel, active drives, pending actions, calendar, notifications) driven by a mock aggregate. Full client suite + server suite green, `tsc --noEmit` ×2 clean, `npm run build` ok. Live smoke on an isolated DB optional (client-visible reskin over existing derivations).

## Follow-ups (deferred)
- KPI deltas / trends would need a time-series/history store (none exists today).
- The dropped pool/eval/skills cards could return if/when real aggregations exist.
