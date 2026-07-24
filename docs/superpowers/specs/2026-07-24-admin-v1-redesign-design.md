# Admin Console — V1 Design Pass

**Date:** 2026-07-24
**Status:** Approved (scope locked with the user: keep the real password login — reskin only, no OTP/backend change; KEEP & reskin all built modules the prototype parks as "Coming Soon"; SKIP the prototype's persona-switcher + Institute-portal scaffolding).
**Prototype:** `MatchDay_Admin_V1.html` (repo root, committed). **Applies to the already-built admin console** — `client/src/pages/*` (Dashboard, Drives, Institutes, Jobseekers, Employers, Slots, Streams, Templates, Evaluations), `client/src/components/*`, styled by the GLOBAL `client/src/styles/theme.css`. Branch `feat/admin-v1-redesign` (worktree `~/code/matchday-adminv1`), off `main` @b11f086.

## Context / correction
The admin console is **already navy with dark mode** (`theme.css :root { --indigo:#1e3a8a } … :root[data-theme="dark"]{ --indigo:#4c6fe0 }`), from the earlier design-system rebrand. It also already has: the V1-style login (command-center left panel + Wednesday "Match Day" rail + `ThemeToggle`), a MatchDay checkmark logo (`BrandMark` = navy rounded-square + orange `#f57316` checkmark; `BrandLogo` = raster PNG wordmark), a sidebar that **already keeps every built module reachable** (only Recruiters/Reports/Audit/Settings route to `/coming-soon`), sortable/filterable tables, KPI tone variants, and 3 dashboard funnels.

So Admin V1 is **not** a navy recolor and **not** an IA teardown. The one genuinely-new visual system is an **orange accent** (`#FF6F0B`), which the admin console currently has essentially none of (the logo checkmark aside), applied **broadly** as the interactive/attention color layered over navy-the-structural-color — exactly as the prototype does.

## The navy-vs-orange rule (from the prototype)
- **Navy (`--indigo`, unchanged) stays structural:** the **active** sidebar item, default KPI icon/bar, the primary "neutral" button (`.btn-primary`), calendar Wednesday highlight, focus ring, avatar.
- **Orange (`--accent`, new) is the interactive/attention signal:** primary **Create/Add CTAs**, **inactive** nav count pills, accented KPI cards (icon + left bar) on a few metrics, the **Hiring** funnel, active-**tab underline**, toggle **on** state, active **sort-arrow**, "see all"/card-header action links, and warning/attention callouts.

## Scope (what V1 changes vs the built console)
1. **Accent tokens** — add an `--accent` family to `theme.css` `:root` (light) AND `:root[data-theme="dark"]` (dark), mirroring how `--indigo` has two definitions. Exact values in §"Exact values".
2. **Admin scope wrapper** — add `<div className="admin-app">` around the admin shell in `AppShell.tsx` (matching the employer `.employer-app` / jobseeker `.js-landing` convention). This is the scoping vehicle so orange overrides of shared global rules never bleed into the auth screens, the candidate Portal, or the jobseeker landing/signup (all of which share `theme.css`).
3. **`.btn-accent`** — a net-new orange button class; apply it to the primary **Create/Add** CTAs on the list toolbars + the Dashboard "New Drive" button (leave modal Save buttons `.btn-primary` navy).
4. **KPI accents** — add `.ic.i-accent` (orange icon chip) + `.kpi.acc` (orange left-bar) variants; apply to ~3 dashboard KPIs (mirroring the prototype's accented metrics).
5. **Funnel** — repaint the **Hiring** funnel gradient orange (`#FF6F0B → #ff9247`) in `FunnelsSection.tsx` (Supply stays teal, Demand aligns to navy).
6. **Scoped accent overrides** (`.admin-app …`) — inactive nav **count** pill, `.tabbar button.on` underline, `.switch.on`, `.col-sort-btn.active` (+hover), `.card-h .act` / `.act` links, `.attn` warning callouts.
7. **Terminology** — normalize stray admin-facing "Candidate" → "Jobseeker" in visible copy (e.g. "Add Candidate" → "Add Jobseeker", the "All Candidates" view pill, any "Candidate Onboarding" heading). Visible copy only.

## Non-goals (deliberate)
- **No auth/OTP change** — the real email+password login stays; no backend, no OTP screen. The login is already V1-styled; do NOT recolor `#auth-screen` chrome (it's shared with the jobseeker signup — recoloring would bleed).
- **No navy recolor** (already navy) and **no `--indigo`→`--brand` token rename** (pure churn across the whole codebase + all shared apps, zero visible benefit; same call as Employer V1).
- **No mutation of `--indigo` or of bare global selectors** (`.btn-primary`, etc.) — those bleed into auth/Portal/jobseeker. Orange comes from net-new classes + `.admin-app`-scoped rules only.
- **No IA teardown / no module demotion** — the sidebar already keeps built modules reachable; keep it. Do NOT add the prototype's unbuilt "Operators"/"Audit Trail" as real pages (Recruiters/Reports/Audit/Settings keep their existing `/coming-soon` behavior).
- **No persona switcher, no Institute portal** (prototype JS-only scaffold, never rendered).
- **No dark-mode removal** — add dark `--accent` variants so both themes work.
- **No logo overhaul** — the checkmark mark already exists; only align `BrandMark`'s checkmark hex to the accent token. The shared raster `BrandLogo` (also used by the jobseeker Portal shell) is left as-is (changing it would bleed).

## Exact values
From `MatchDay_Admin_V1.html` `:root` (lines 12–27) — light:
```
--accent:#FF6F0B; --accent-600:#E85F00; --accent-050:#FFF3E9; --accent-100:#FFE1C9;
```
Dark variants (`:root[data-theme="dark"]`, mirroring the `--indigo` dark treatment — softened/desaturated for the dark surface):
```
--accent:#ff9a4d; --accent-600:#ffb37a; --accent-050:rgba(255,111,11,.16); --accent-100:rgba(255,111,11,.24);
```
Button: `.btn-accent{ background:var(--accent); color:#fff } .btn-accent:hover{ background:var(--accent-600) }`.
Hiring funnel gradient: `linear-gradient(90deg,#FF6F0B,#ff9247)`.
Logo checkmark: `#FF6F0B` (align `BrandMark`'s current `#f57316`).

## Architecture / approach
**Additive, admin-scoped reskin — no re-port, no token mutation.** theme.css is imported once globally (`main.tsx`) and shared by every role app; isolation is by selector-naming/scoping convention. So: (1) add `--accent` tokens (light+dark) — inert until used; (2) add the `.admin-app` wrapper + define net-new `.btn-accent`/`.ic.i-accent`/`.kpi.acc` and the `.admin-app`-scoped overrides; (3) flip the CTA markup to `.btn-accent`, tag the accented KPIs, repaint the Hiring funnel; (4) copy-only terminology. Every orange rule is either a brand-new class (only admin markup references it) or `.admin-app`-scoped, so the auth/Portal/jobseeker screens are provably untouched.

**Bleed guard (binding):** for any EXISTING theme.css rule this pass edits to use `--accent`, it MUST be `.admin-app`-scoped (a new rule that overrides, leaving the base rule intact) — never edited in place — unless a grep of `client/src/auth`, `client/src/pages/Portal`, `client/src/pages/JobseekerLanding`, `client/src/pages/EmployerPortal` proves the selector is admin-exclusive. Net-new classes need no scoping.

## Testing / verification
Full client suite green (update any test asserting changed copy, e.g. "Add Candidate"→"Add Jobseeker", "All Candidates" pill), `tsc --noEmit` clean, `npm run build` ok. The reskin is CSS + small markup/copy; correctness is covered by existing page tests continuing to pass. No server change → server suite unaffected. Manual dark-mode check that orange tokens resolve in both themes.

## Follow-ups (deferred, non-blocking)
- Optional: replace the raster `BrandLogo` with an inline split-color "Match/Day" + tagline SVG (unifies with Employer V1 but touches the shared jobseeker Portal shell — needs its own scope decision).
- Optional login-screen orange accents (kicker/hero emphasis) — deferred because `#auth-screen` chrome is shared with the jobseeker signup.
