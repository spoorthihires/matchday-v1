# Employer Portal — V1 Design Pass

**Date:** 2026-07-24
**Status:** Approved (scope locked with the user: Employer V1 first; KEEP & reskin all built modules — no "Coming Soon" demotions; SKIP the prototype's persona/Institute-portal scaffolding).
**Prototype:** `MatchDay_Employer_V1.html` (repo root / committed in this branch). **Applies to the already-built employer portal** on `main` (`client/src/pages/EmployerPortal/*`, styled by `client/src/styles/employer.css`, scoped `.employer-app`). Branch `feat/employer-v1-redesign` (worktree `~/code/matchday-empv1`), off `main` @3faa12b.

## Context / correction
The employer portal is **already navy** on `main` (`employer.css .employer-app { --indigo: #1e3a8a }`, with dark-mode overrides) — the earlier rebrand recolored it. So V1 is **not** a navy recolor; it is a light brand/IA pass. The one genuinely new visual element is an **orange accent** (`#FF6F0B`), which the portal currently has none of, applied narrowly (logo only, per the prototype).

## Scope (what V1 actually changes vs the built portal)
1. **Orange accent tokens** — add `--orange`/`--orange-d`/`--orange-bg` to `.employer-app` (+ dark-mode variants). The prototype uses orange in exactly two spots: the logo checkmark and the "Day" wordmark (+ a small tagline accent). No broad orange repaint of buttons/KPIs (that's Admin V1, not Employer V1).
2. **New logo** — the V1 brand mark (navy rounded-square outline + orange checkmark) + wordmark "**Match**(navy)**Day**(orange)" + tagline "AI/ML & Data Hiring Drive", replacing the current "Hiringhood / MatchDay" cube brand across the shell, landing, and auth pages.
3. **Minor palette refinements** — `--wash #e8eef8`, `--wash-2 #f2f5fc`, `--indigo-d #162d6e`, `--indigo-dd #0f1f4d`, `--line #dde4f0`, `--line-2 #c9d3e8`, navy-tinted shadows (per V1 `:root`).
4. **Nav renames + reorder** (`EmployerShell`) — "Registrations" → **"Registered Drives"**, "Kanban" → **"Live Drive"**, ordered Registered Drives → Live Drive → Interviews. All nav items stay reachable (per the keep decision); Reports/Settings/Team are NOT demoted.
5. **Kanban Withdrawn column** — the board renders a terminal **Withdrawn** column (the `KANBAN_TERMINAL` set already includes it; ensure the board shows it).
6. **Register-wizard JD-prefill banner** — an informational banner ("Fields pre-filled from your JD — review and edit before saving") on the registration wizard steps.
7. **Terminology** — employer-facing "Candidate" copy → "Jobseeker" where the prototype does (labels/headings; not identifiers/routes).

## Non-goals (deliberate)
- No navy recolor (already done). No broad orange repaint (Employer V1 keeps orange to the logo).
- **No module demotion** — Reports & Settings/Team stay built + reachable (the prototype parks them as "Coming Soon"; the user chose keep-and-reskin).
- **No candidates-per-registration IA restructure** — the current nav model (Candidates → drive list; Live Drive/Interviews → the resolver added by PR #40) is kept; the prototype's move of Candidates out of the global nav is deferred (it would fight the just-shipped resolver + the keep-reachable decision). Documented follow-up.
- No persona switcher, no Institute portal, no auth-flow change (OTP), no dark-mode removal.
- No new backend / no data-model change — this is a client-only design pass.

## Exact values (from `MatchDay_Employer_V1.html` `:root`, lines 18–46)
```
--orange: #FF6F0B;  --orange-d: #e0600a;  --orange-bg: #fff3ea;
--wash: #e8eef8;    --wash-2: #f2f5fc;
--indigo-d: #162d6e; --indigo-dd: #0f1f4d;   (--indigo #1E3A8A unchanged)
--line: #dde4f0;    --line-2: #c9d3e8;
--shadow-sm/shadow/shadow-lg: navy-tinted rgba(30,58,138,…)
```
Logo markup (from the prototype, e.g. line 2214):
```html
<span class="logo-mark"><svg viewBox="0 0 36 36" width="28" height="28" fill="none">
  <rect x="2" y="2" width="32" height="32" rx="5" stroke="#1E3A8A" stroke-width="2.5" fill="white"/>
  <polyline points="8,18 15,25 28,11" stroke="#FF6F0B" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg></span>
<span class="brand-text"><span class="brand-name"><span class="match">Match</span><span class="day">Day</span></span><span class="brand-tagline">AI/ML & Data Hiring Drive</span></span>
```
Brand CSS: `.brand-name .match{color:var(--indigo)}`, `.brand-name .day{color:var(--orange)}`, plus `.brand-tagline` styling.

## Architecture / approach
**Token-level reskin, not a re-port.** The V1 prototype's class vocabulary already matches the shipped `employer.css` (both descend from the same prototype). So: (1) add the orange tokens + palette tweaks + brand classes to `employer.css` (+ dark-mode orange), (2) swap the brand markup in the shell/landing/auth to the V1 logo, (3) apply the nav renames + the two small IA additions (Withdrawn column, JD banner) + terminology. No component rewrites.

## Testing / verification
Full client suite green (update any test asserting the old nav labels "Registrations"/"Kanban" or the old brand text), `tsc --noEmit` clean, `npm run build` ok. The reskin is CSS + markup; correctness is covered by the existing page tests continuing to pass plus updated shell/nav assertions. No server change → server suite unaffected.

## Follow-ups (deferred, non-blocking)
- Candidates-per-registration IA (drop Candidates from global nav, enter per registered drive) — deferred to keep the PR #40 resolver + keep-reachable intact.
- Admin V1 design pass (next, after this ships).
