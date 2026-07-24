# Admin Console — V1 Design Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the V1 brand to the built admin console — add an orange `--accent` system (light+dark) and paint the interactive/attention elements orange (Create CTAs, accented KPIs, Hiring funnel, tab underlines, toggles, sort arrows, nav count pills, action links, warning callouts), keep navy structural, normalize stray "Candidate"→"Jobseeker" copy. Client-only; no data/model/auth change; every module stays reachable.

**Architecture:** Additive, admin-scoped reskin. `theme.css` is a GLOBAL stylesheet shared by every role app, so orange is delivered ONLY via (a) net-new classes (`.btn-accent`, `.ic.i-accent`, `.kpi.acc`) that only admin markup references, and (b) rules scoped under a new `.admin-app` wrapper. Never mutate `--indigo` or bare global selectors (`.btn-primary`, `.nav-item.active`, …) — those bleed into the auth screens / candidate Portal / jobseeker signup.

**Tech Stack:** React + Vite; CSS in `client/src/styles/theme.css` (global, with `:root` + `:root[data-theme="dark"]` token blocks). Vitest + Testing Library.

## Global Constraints
- Branch `feat/admin-v1-redesign` (worktree `~/code/matchday-adminv1`), off `main` @b11f086. CSS + small markup/copy only — no new deps, no backend, no route/slug changes.
- Keep dark mode working: every new token gets a value in BOTH the `:root` (light) and `:root[data-theme="dark"]` (dark) blocks.
- **Bleed guard (binding):** any EXISTING theme.css rule edited to use `--accent` MUST instead be added as a NEW `.admin-app`-scoped rule that overrides it (base rule left intact) — never edited in place — UNLESS a grep of `client/src/auth`, `client/src/pages/Portal`, `client/src/pages/JobseekerLanding`, `client/src/pages/EmployerPortal` proves the selector is admin-exclusive. Net-new classes need no scoping.
- Navy stays structural (active nav, `.btn-primary`, KPI default, focus ring, calendar Wed). Orange is the interactive/attention accent only.
- Do NOT touch `#auth-screen` chrome (shared with jobseeker signup). Do NOT change the shared raster `BrandLogo` (used by the jobseeker Portal shell). Do NOT rename `--indigo`. Do NOT demote or add nav modules.
- Exact values (from `MatchDay_Admin_V1.html` `:root`): `--accent:#FF6F0B; --accent-600:#E85F00; --accent-050:#FFF3E9; --accent-100:#FFE1C9;`. Dark: `--accent:#ff9a4d; --accent-600:#ffb37a; --accent-050:rgba(255,111,11,.16); --accent-100:rgba(255,111,11,.24);`.

## Prereq
`cd ~/code/matchday-adminv1 && npm install`. Baseline: `npm test -w client` passes (note the count).

---

## Task 1: Accent tokens + `.admin-app` scope wrapper + `.btn-accent` + logo hex

**Files:**
- Modify: `client/src/styles/theme.css` (`:root` block ~lines 3–31; `:root[data-theme="dark"]` block ~lines 33–58; add `.btn-accent` near `.btn-primary` ~line 245)
- Modify: `client/src/components/AppShell.tsx` (wrap the fragment in `<div className="admin-app">`)
- Modify: `client/src/theme/BrandMark.tsx` (checkmark stroke hex)

**Interfaces:**
- Produces: the `--accent`/`--accent-600`/`--accent-050`/`--accent-100` CSS vars (both themes), the `.admin-app` wrapper class (Task 2 scopes overrides under it), and `.btn-accent` (Task 2 applies it to CTAs).

- [ ] **Step 1: Add accent tokens (light).** In the `:root { … }` block of `theme.css`, after the `--indigo…` line, add:
```
--accent:#FF6F0B; --accent-600:#E85F00; --accent-050:#FFF3E9; --accent-100:#FFE1C9;
```
- [ ] **Step 2: Add accent tokens (dark).** In the `:root[data-theme="dark"] { … }` block, after its `--indigo…` line, add:
```
--accent:#ff9a4d; --accent-600:#ffb37a; --accent-050:rgba(255,111,11,.16); --accent-100:rgba(255,111,11,.24);
```
- [ ] **Step 3: Add `.btn-accent`.** In `theme.css` immediately after the `.btn-primary` rules (~245–246), add:
```
.btn-accent{background:var(--accent);color:#fff}
.btn-accent:hover{background:var(--accent-600)}
```
(`.btn-accent` is net-new — no scoping needed; only admin markup will use it.)
- [ ] **Step 4: Add the `.admin-app` wrapper.** In `AppShell.tsx`, wrap the returned fragment in a single div so all admin pages get a scope root (a plain div does not affect `.sidebar{position:fixed}` or `.main{margin-left}`):
```tsx
return (
  <div className="admin-app">
    <Sidebar />
    <div className="scrim" id="scrim" />
    <div className="main">
      <Topbar crumb={crumb} title={title} />
      {children}
    </div>
  </div>
);
```
- [ ] **Step 5: Align the logo checkmark hex.** In `BrandMark.tsx`, change the checkmark path `stroke="#f57316"` → `stroke="#FF6F0B"` (align to the accent hex; leave the navy square `stroke="#1e3a8a"`).
- [ ] **Step 6: Verify + commit.** `npm test -w client && npx -w client tsc --noEmit && npm run -w client build` (all green — no test should change yet). `git add client/src/styles/theme.css client/src/components/AppShell.tsx client/src/theme/BrandMark.tsx && git commit -m "feat(client): admin V1 — accent tokens (light+dark) + .admin-app scope + .btn-accent + logo hex"`

---

## Task 2: Apply the orange accents (CTAs, KPIs, funnel, scoped overrides)

**Files:**
- Modify (markup): `client/src/pages/Drives/DrivesToolbar.tsx`, `client/src/pages/Institutes/InstitutesToolbar.tsx`, `client/src/pages/Employers/EmployersToolbar.tsx`, `client/src/pages/Jobseekers/JobseekersToolbar.tsx`, `client/src/pages/Streams/index.tsx`, `client/src/pages/Templates/index.tsx`, `client/src/pages/Evaluations/index.tsx`, `client/src/pages/Dashboard/index.tsx` (Create/Add/New-Drive CTAs)
- Modify: `client/src/pages/Dashboard/KpiSection.tsx` (tag ~3 KPIs accent) + `client/src/styles/theme.css` (`.ic.i-accent`, `.kpi.acc` CSS)
- Modify: `client/src/pages/Dashboard/FunnelsSection.tsx` (hiring gradient)
- Modify: `client/src/styles/theme.css` (`.admin-app`-scoped overrides)

**Interfaces:**
- Consumes: `--accent*`, `.admin-app`, `.btn-accent` (Task 1).

- [ ] **Step 1: Create/Add CTAs → `.btn-accent`.** In each toolbar file, change the primary create button's `className="btn btn-primary"` → `className="btn btn-accent"`:
  - `DrivesToolbar.tsx:~90` ("Create Drive"), `InstitutesToolbar.tsx:~54` ("Create Institute"), `EmployersToolbar.tsx:~54` ("Create Employer"), `JobseekersToolbar.tsx:~87` ("Add Candidate" — text handled in Task 3), `Streams/index.tsx:~64` ("Create Stream"), `Templates/index.tsx:~65` ("Create Configuration"), `Evaluations/index.tsx:~44` ("Create Configuration"), `Dashboard/index.tsx:~27` ("New Drive"). Change ONLY these top-level primary create CTAs. Do NOT change modal Save buttons (`btn-primary btn-lg`) — they stay navy.
- [ ] **Step 2: KPI accent CSS.** In `theme.css`, after the `.ic.i-*` variants (~303–308) add:
```
.ic.i-accent{background:var(--accent-050);color:var(--accent)}
.kpi.acc{position:relative;overflow:hidden}
.kpi.acc::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent)}
```
(`.ic`/`.kpi` are admin-only — these are net-new variants/modifiers, no scoping needed.)
- [ ] **Step 3: Tag accented KPIs.** In `KpiSection.tsx`, mark ~3 metrics as accent to mirror the prototype's accented cards. In the `KPI_ICON` tone map, set the tone for the metrics that correspond to the prototype's accented ones (e.g. an "Upcoming Wednesdays"/"Offers Sent"/"Evaluations Completed"-equivalent) to `i-accent`; and add the `acc` modifier to those cards' `.kpi` className (e.g. `className={\`kpi${accentKeys.has(k.key) ? ' acc' : ''}\`}`). Pick the closest-matching existing KPI keys; if unsure which map to the prototype, choose 3 that read as "attention/outcome" metrics. Keep the other tones (indigo/teal/violet/amber/green/red) intact.
- [ ] **Step 4: Hiring funnel orange.** In `FunnelsSection.tsx` `ACCENTS` (~8–12): set `hiring: 'linear-gradient(90deg,#FF6F0B,#ff9247)'`; set `demand: 'linear-gradient(90deg,#1e3a8a,#3a5bc0)'` (align to navy; was bright `#2f4fe0`); leave `supply` teal.
- [ ] **Step 5: `.admin-app`-scoped accent overrides.** First grep each selector below in `client/src/auth`, `client/src/pages/Portal`, `client/src/pages/JobseekerLanding`, `client/src/pages/EmployerPortal` to note exclusivity; then add these as NEW rules in `theme.css` (scoped under `.admin-app` so no bleed regardless):
```
.admin-app .nav-item .count{background:var(--accent-050);color:var(--accent)}
.admin-app .tabbar button.on{color:var(--accent);border-bottom-color:var(--accent)}
.admin-app .switch.on{background:var(--accent)}
.admin-app .col-sort-btn:hover{background:var(--accent-050);color:var(--accent)}
.admin-app .col-sort-btn.active{color:var(--accent);background:var(--accent-050);border-color:var(--accent)}
.admin-app .card-h .act{color:var(--accent)}
.admin-app .attn .fix{color:var(--accent)}
```
(Leave `.nav-item.active` navy. Leave `.seg button.on` / `.viewpills button.on` navy — those are filled "primary" selectors, not underline accents; keep navy per the navy-structural rule.)
- [ ] **Step 6: Verify + commit.** `npm test -w client && npx -w client tsc --noEmit && npm run -w client build` (all green; update any test asserting a CTA by `btn-primary` class — but tests should query by role/text, so likely none). `git add -A client/src && git commit -m "feat(client): admin V1 — orange accents (CTAs, KPI accents, Hiring funnel, tab/toggle/sort/link/attn)"`

---

## Task 3: Terminology (Candidate → Jobseeker, admin copy)

**Files:** Modify admin page components with visible "Candidate" copy (e.g. `JobseekersToolbar.tsx`, `client/src/pages/Jobseekers/ViewPills.tsx`, any Jobseekers/Dashboard headings/labels); update affected tests.

- [ ] **Step 1: Find visible "Candidate" copy.** Grep `client/src/pages` and `client/src/components` (EXCLUDING `EmployerPortal/`, `Portal/`, `JobseekerLanding/`) for visible "Candidate"/"Candidates" in JSX text, button labels, headings, placeholders, aria-labels. Known: `JobseekersToolbar.tsx` "Add Candidate"; `ViewPills.tsx` "All Candidates" (and possibly other pills/labels); check KPI labels for "Match-Ready Candidates".
- [ ] **Step 2: Swap to Jobseeker.** Change visible "Candidate"→"Jobseeker" / "Candidates"→"Jobseekers", preserving case/plural. Do NOT change identifiers, variable/type/prop names, query keys, routes, slugs, test IDs, or any stored enum value. If a "Candidate" literal is a persisted status/enum value, leave it.
- [ ] **Step 3: Update tests.** Grep `client/src/test` for assertions on the swapped copy (e.g. `getByText(/Add Candidate/)`, "All Candidates") and update to the new copy without weakening assertions or changing test IDs.
- [ ] **Step 4: Verify + commit.** `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`. `git add -A client/src && git commit -m "feat(client): admin V1 — normalize Candidate→Jobseeker visible copy"`

---

## Task 4: Full-suite verification

**Files:** none.
- [ ] Full client suite `npm test -w client` (all green), `npx -w client tsc --noEmit` clean, `npm run -w client build` ok. Report counts. Server suite unaffected (no server change) — optionally `npm test -w server` for confidence. No commit.

---

## Notes for the executor
- Navy (`--indigo`) is ALREADY the console's color and STAYS — only ADD orange. The active nav item stays navy (the prototype keeps it navy too).
- Orange is delivered by net-new classes + `.admin-app`-scoped rules ONLY. Do NOT edit `--indigo`, `.btn-primary`, `.nav-item.active`, or any bare global in place — they bleed into auth/Portal/jobseeker (which share this global stylesheet).
- Dark mode: every accent token has a light AND dark value; scoped rules read the token so both themes resolve.
- Do NOT touch `#auth-screen`, the raster `BrandLogo`, routes/slugs, or the nav module list. Do NOT add Operators/Audit Trail as real pages.
