# MatchDay Employer Portal — Prototype Analysis & Build Plan

**Prototype analyzed:** `Matchday_Employer.html` (~7634 lines, `<title>Hiringhood MatchDay — For Employers</title>`)
**Compared against:** `matchday-admin-app_23.html` (admin console, already ported to `client/` + `server/`)
**Date:** 2026-07-19 · Read-only analysis — no app code written.

> **Read this first (state correction).** The task brief describes an already-built jobseeker portal (`server/src/modules/seekerPortal/`), a `SlotBooking` model, a multi-role `/api/auth/login`, a `requireRole` middleware, and a `/api/me/portal` aggregate. **None of these exist on disk.** The current branch is `feat/jobseeker-portal`; its only jobseeker-portal artifact is a **design spec** (`docs/superpowers/specs/2026-07-16-jobseeker-portal-design.md`, commit `7a068b1`) — the implementation is not present, and `main` @`73bdb82` is **admin-only**. Auth today (`server/src/modules/auth/auth.service.ts`) logs in the admin `User` collection only. There is **no `SlotBooking` model** (`Slot` carries `booked`/`held` counters, not per-candidate bookings). The employer portal is therefore being planned on top of an **admin-only** backend, and the multi-role auth pattern it is told to "mirror" is itself **spec-only, unbuilt**. The jobseeker spec is nonetheless the correct blueprint — it should be generalized to N roles (admin / jobseeker / **employer**).

---

## 1. Screen inventory of `Matchday_Employer.html`

### Auth / onboarding views (`id="view-*"`)

| View | Purpose | Key UI | Data needed |
|---|---|---|---|
| `view-landing` | Public marketing home for the "hire pre-evaluated AI/ML talent every Wednesday" pitch. | Hero + weekly-cadence rail, sections: What is MatchDay, Streams grid, Process, "what we've already checked", Pricing, testimonials, FAQ, CTA band; top nav links to Available Drives / Login / Signup. | Static marketing copy; stream list; testimonials/FAQ (client-rendered). |
| `view-signup` | Create an **employer (company) account** — 3-step wizard. | Steps: **1 Company** (name, website, industry, size, hiring type Fresher/Lateral/Internship, work-location chips), **2 Contact** (contact name, designation, work email, phone), **3 Review & consent** (optional billing/GST, Terms + Privacy checkboxes). Progress stepper. | Writes a company registration → should feed the admin approval queue. |
| `view-verify` | Email OTP verification after signup. | 6-box OTP, resend timer (demo code `246810`). | Email + verification token. |
| `view-login` | Employer login. | Email + password, remember-me, SSO buttons (Google/Microsoft/SAML), plus an in-panel **forgot-password** view (email → reset link). | Employer credentials. |
| `view-mfa` | Two-factor step after password. | TOTP 6-box OTP, "use backup code" (demo code `135791`). | MFA challenge. |
| `view-app` | Authenticated app shell (sidebar + topbar) that hosts all `page-*` screens. | Sidebar nav, topbar (search, help, notifications bell, user dropdown → company profile / settings / logout). | Logged-in employer + notification count. |

### App pages (`id="page-*"`, rendered inside `view-app`)

| Page | Purpose | Key UI / actions | Data needed |
|---|---|---|---|
| `page-dashboard` | Home / hiring overview for the week. | KPI grid, **Hiring funnel**, **Active drives** list, **Pending actions**, **MatchDay calendar**, recent notifications. | Employer KPIs, funnel, active drives, calendar of MatchDays, notifications. |
| `page-drives` | **Marketplace** of available drives (aggregate-only, no identities). | Search, stream chips (Data/ML/DataEng/GenAI), level + status filters, drive-card grid. | Published/Active `Drive`s + aggregate pool stats. |
| `page-drive-detail` | Deep view of one drive before registering. | Hero (status, next MatchDay, **Register** CTA, brochure, contact), candidate-pool summary, evaluation coverage, skills/location/experience/CTC distributions, upcoming MatchDays. | Drive + aggregate pool distributions (no PII). |
| `page-registration` | **10-step "register for this drive" wizard** (a role requirement). | Steps: Role info (+JD upload/parse), Hiring requirements, Skills (must/good), Eligibility, Compensation, Location, Interview process (rounds L1–L3), Slot preference (Wednesday + time), Selection rules (min eval score, mandatory skills), Review & confirm → success card with `REG-####` ref. | Writes a `RegistrationRequest`-shaped record scoped to the employer + drive. |
| `page-registrations` | **Registration tracker** — lifecycle of every drive the employer registered for. | Filter chips (all/needs-action/in-progress/completed), master list + detail pane, status pills (Submitted → Under review → Candidates Shared → Shortlisting → Interview Scheduled → Completed). | Employer's registrations + statuses + activity. |
| `page-slot` | **Book a Wednesday slot** for an approved registration. | Month calendar of available Wednesdays, slot panel (time-window pick, confirm). | `Slot`s for the drive (capacity/booked/held), employer booking. |
| `page-candidates` | **Ranked, pre-evaluated candidate recommendations**, redacted. | Drive selector, candidate table (code `HH-XX-####`, score, eval status, skills, location, mode, notice, availability), row actions **Shortlist / Reject / Hold / View passport**. | Redacted candidate projection per registration; **identities hidden until consent**. |
| `page-passport` | Redacted "candidate passport" detail + notes. | Skills/eval breakdown, private notes, actions. | Per-candidate evaluation detail (redacted). |
| `page-shortlist` | Shortlist workspace — finalize/package the shortlist. | Shortlist table, decisions, deadline. | Shortlist decisions on candidates. |
| `page-consent` | **Candidate consent status** before identities are revealed. | Consent list, status filter (sent/interested/declined/expired), sub-copy. | Per-candidate consent state (sent/responded/expires). |
| `page-interviews` | Interview schedule / agenda. | Interview list, confirm/reschedule, assign interviewers, add-interview panel. | Interview records (candidate, round, slot, status, panel). |
| `page-kanban` | Private hiring pipeline (drag candidates across stages). | Board columns: Recommended → Shortlisted → Candidate Confirmed → Scheduled → L1 → L2 → L3 → HR → Offer Sent → Offer Accepted → Joined, plus Rejected / Withdrawn; feedback form per round. | Per-candidate **pipeline stage** state. |
| `page-offers` | **Offer management** — draft to joining. | Offer list (status, terms, candidate response, offer letter). | **Offer** records. |
| `page-notifications` | Notification center + channel preferences. | Grouped notifications by category, channel toggles (email/in-app/etc.). | Notifications + per-category channel prefs. |
| `page-reports` | Post-MatchDay analytics. | Funnel, conversion, quality charts. | Aggregated hiring metrics. |
| `page-settings` | Company profile, team, panels, defaults, privacy. | Settings sections; links to Team access. | Employer profile + config. |
| `page-access` | **Team access management** — roles & assignments. | Role matrix (Admin / Recruiter / Interviewer / Viewer), member list. | Employer team members + roles. |
| `page-support` | Support center — raise requests. | Ticket form / request list. | Support tickets. |
| `page-placeholder` | Generic "not-yet-built section" stub. | Icon + title + "next up" tag. | none. |

### Sidebar nav structure (`data-page` items)

```
Main       → dashboard, drives (Available Drives)
Hiring     → registrations (badge 3), candidates (badge 12), interviews (badge 8), kanban
Insights   → reports
Footer     → settings, user card (Asha Nambala / Northwind Labs) → logout
```

**Contextual (not in top-level nav; reached via buttons/links):** `drive-detail`, `registration`, `slot`, `passport`, `shortlist`, `consent`, `offers`, `notifications`, `access`, `support`, `placeholder`.

### Auth / onboarding flow order

```
landing ─┬─► signup (Company → Contact → Review&consent) ─► verify (email OTP) ─► app (dashboard)
         └─► login ─► mfa (TOTP) ─► app (dashboard)          [login also hosts forgot-password]
```

---

## 2. What's NEW vs the admin app

- **The admin prototype is admin-only.** `matchday-admin-app_23.html` and its port (`client/src/pages/*`: Dashboard, Drives, Employers, Institutes, Jobseekers, Slots, Streams, Templates, Evaluations) are a **platform-admin console**. There is no employer-facing role application in it. The jobseeker spec itself states "the prototype is admin-only." **`Matchday_Employer.html` is a net-new, employer-facing role application** — the second external role after the (still-unbuilt) jobseeker portal.

- **Conceptual overlaps with existing admin/jobseeker features:**

| Employer screen | Overlaps with existing | Reuse verdict |
|---|---|---|
| Signup (company account) | Admin **RegistrationRequest → approve → upsert `Employer`** flow (`registrations.service.ts`, `upsertEmployerFrom`) | **Reuse the queue** — employer signup should create the same pending record the admin already approves. |
| Available Drives / Drive detail | Admin `Drive` model + Drives module | **Reuse `Drive`**; add employer-scoped, identity-free read + aggregate pool derivation (net-new derivation). |
| Register-for-drive wizard | `RegistrationRequest` (company, role, driveId, openings, ctcRange, skills, slot, panel, jd) | **Strong reuse** — the wizard maps almost field-for-field; needs an `employerId` link (net-new field). |
| Registration tracker | `RegistrationRequest.status` lifecycle | **Reuse**, employer-scoped read. |
| Slot booking | `Slot` model (`employerId`, `capacity`, `booked`, `held`) | **Reuse `Slot`**; add employer booking endpoint. No per-candidate `SlotBooking` exists — net-new if per-candidate booking is required. |
| Candidates / passport / shortlist / consent | `Jobseeker` (incl. `consent`, `evaluationStatus`, `stage`) + EvalConfig | **Partial** — a **redacted** candidate projection is net-new; prototype currently fabricates a synthetic pool (`buildPool`), not real `Jobseeker` rows. |
| Interviews | `Slot` (time windows) | Slot timing reusable; **Interview entity is net-new**. |
| Kanban / Offers | — (nothing equivalent admin-side) | **Fully net-new** (pipeline stage state + Offer entity). |
| Notifications / Reports / Team access / Support | Admin `AuditLog`, dashboard aggregation | Aggregation patterns reusable; **notification, team-role, and ticket entities are net-new**. |

---

## 3. Backend reuse assessment

### Reusable (with employer scoping)
- **`Employer`** — backs signup/profile/settings. Add a **`passwordHash`** field (mirrors the jobseeker spec's `Jobseeker.passwordHash`) so employers can log in.
- **`RegistrationRequest`** — backs both the company signup queue and the per-drive registration wizard + tracker. Add an **`employerId`** ref (today `upsertEmployerFrom` matches by company **name**, no id link) so an employer sees only its own registrations.
- **`Drive`** — backs marketplace + drive-detail (filtered to `Active`/`Published`, identity-free).
- **`Slot`** — backs the slot-booking calendar (`employerId`, `capacity`, `booked`, `held`).
- **`Jobseeker` + `EvalConfig`** — source for a **redacted** candidate projection (score, skills, eval status) with identity withheld until consent; `Jobseeker.consent` (Granted/Pending/Revoked) maps to the consent screen.
- **`AuditLog`** — activity trails.
- **Auth primitives** — `hashPassword`/`verifyPassword`/`signToken` (bcrypt + JWT), `requireAuth`. Reuse as-is.

### Net-new server pieces
1. **Multi-role auth foundation** (shared, currently spec-only): unify `login()` to try `User` (admin) → `Jobseeker` → **`Employer`**, issuing `role: 'employer'` JWTs; add **`requireRole(...roles)`** and gate every admin router with `requireRole('admin')`. Building the jobseeker spec first (or generalizing it to N roles) is the prerequisite.
2. **`Employer.passwordHash`** + employer login path + seeded demo employer credentials.
3. **`GET /api/me/employer`** aggregate (profile + dashboard KPIs + funnel + upcoming MatchDays + calendar) — the employer analogue of the spec's `/api/me/portal`. New `modules/employerPortal/` module mounted at `/api/me/employer`.
4. **Employer-scoped read endpoints**: marketplace drives + aggregate pool distributions (no PII); employer's registrations/slots.
5. **A per-(employer, candidate, drive) `Application`/`Pipeline` entity** — the **missing join** that candidates, shortlist, consent, interviews, kanban and offers all depend on. The jobseeker spec **explicitly deferred** this ("no Application entity"); the employer portal fundamentally requires it, carrying decision (shortlist/reject/hold), consent, and **kanban stage** (Recommended → … → Joined / Rejected / Withdrawn).
6. **`Offer` entity** — draft → sent → accepted → joined, terms, candidate response, offer letter.
7. **`Interview` entity** — rounds (L1/L2/L3/HR), links a `Slot` + a candidate + panel + status/feedback.
8. **`Notification` entity + per-category channel preferences.**
9. **Employer team members + role model** (Admin / Recruiter / Interviewer / Viewer) for the access page.
10. **Redacted candidate projection service** — decides real-`Jobseeker`-derived vs synthetic, and enforces the "identity revealed only after consent" rule.

---

## 4. Proposed decomposition into vertical-slice sub-projects

Each slice = its own spec → plan → build cycle, mirroring how the admin app was built module-by-module.

| # | Slice | Scope (one line) | Reuses |
|---|---|---|---|
| **1** | **Employer Auth & Onboarding + App Shell + Dashboard** ⭐ **FIRST** | Signup wizard → verify → login → mfa → app shell + dashboard; employer JWT + `/api/me/employer`. | Auth primitives, `Employer` (+`passwordHash`), `RegistrationRequest` queue, `AuditLog`; mirrors the jobseeker-portal multi-role pattern (build/generalize that foundation here). |
| **2** | Drive Marketplace + Drive Detail | Read-only, identity-free browse of Active/Published drives + aggregate pool distributions. | `Drive`; new aggregate-pool derivation. |
| **3** | Drive Registration Wizard + Registration Tracker | 10-step role-requirement wizard writing an employer-scoped registration; lifecycle tracker. | `RegistrationRequest` (+`employerId`); existing admin approval flow. |
| **4** | Slot Booking | Book a Wednesday slot for an approved registration. | `Slot` (`employerId`/`capacity`/`booked`/`held`). |
| **5** | Candidate Recommendations + Passport + Consent | Redacted candidate list/detail; consent gating before reveal. Introduces the **Application/Pipeline** entity. | `Jobseeker` + `EvalConfig` (redacted projection); `Jobseeker.consent`. |
| **6** | Shortlist Workspace | Shortlist/reject/hold decisions + packaging on the Application record. | Slice 5's Application entity. |
| **7** | Interview Scheduling | New `Interview` entity (rounds L1–L3/HR), panel assignment, links Slot + candidate. | `Slot`; Application entity. |
| **8** | Kanban Pipeline | Per-candidate stage board (Recommended → Joined / Rejected / Withdrawn), drag between stages, round feedback. | Application entity (stage field). |
| **9** | Offer Management | New `Offer` entity (draft → joining), terms, response, letter. | Application entity. |
| **10** | Notifications + Reports + Settings/Team Access + Support | Notification entity + prefs, reports aggregation, employer team/roles, support tickets. (Splittable into 10a/10b if large.) | `AuditLog`, dashboard aggregation patterns. |

**Build order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 (foundation → browse → register → book → evaluate → decide → interview → track → offer → cross-cutting). Slice 5 is the pivot: it stands up the Application/Pipeline entity that 6–9 all extend.

**Recommended first slice: #1 — Employer Auth & Onboarding + App Shell + Dashboard**, reusing the jobseeker-portal multi-role auth pattern (generalized to include `employer`). This also delivers, as a byproduct, the shared `requireRole` boundary and the multi-role `login()` the whole portal depends on.

---

## 5. Surprises & ambiguities to flag to the user

1. **The "already-built" jobseeker portal isn't in the code.** Only a design spec exists on `feat/jobseeker-portal`; `main` is admin-only, auth is admin-`User`-only, there's no `requireRole`, no `/api/me/portal`, no `seekerPortal` module, and no `SlotBooking` model. **Decide:** build/merge the jobseeker portal first, or build the multi-role auth foundation as part of employer slice #1 and generalize it to N roles.
2. **No Application/Pipeline entity anywhere.** Six employer pages (candidates, shortlist, consent, interviews, kanban, offers) depend on a per-(employer, candidate, drive) record that does not exist and was explicitly deferred by the jobseeker spec. This is the single largest net-new backbone.
3. **Candidate privacy model.** The prototype shows redacted candidates (`HH-XX-####`) and reveals identity only after consent, but the pool is **synthetic** (`buildPool`), not real `Jobseeker` rows. Product decision: derive from real jobseekers (with redaction + consent gating) vs keep synthetic.
4. **Two colliding "registration" concepts.** Employer **account** signup (company) vs the **per-drive** registration wizard (role requirement → `RegistrationRequest`). And `RegistrationRequest` currently has **no `employerId`** (approval matches by company name) — linkage must be decided.
5. **Dashboard KPIs / `Employer` stats.** `Employer` carries stored stats (`activeDrives`, `shortlistRate`, `offerRate`, …). Per project memory these are being moved to derived values (e.g. `activeDrives` from `Slot` participation). The employer dashboard should derive live metrics rather than read stale stored fields.
