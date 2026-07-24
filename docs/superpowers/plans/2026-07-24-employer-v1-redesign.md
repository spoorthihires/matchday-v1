# Employer Portal — V1 Design Pass Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Apply the V1 brand/IA to the built employer portal — orange accent tokens, the new checkmark logo, minor palette refinements, and the nav renames (Registered Drives / Live Drive) + JD-prefill banner + Candidate→Jobseeker copy. Client-only; no data/model change; all modules kept reachable.

**Tech:** React + Vite; CSS in `client/src/styles/employer.css` (scoped `.employer-app`, with dark-mode `[data-theme="dark"] .employer-app` overrides). Vitest + Testing Library.

## Global Constraints
- Branch `feat/employer-v1-redesign` (base = the spec commit, on `main` @3faa12b). CSS + markup only — no new deps, no backend, no route changes. Keep dark mode working (add dark variants for new tokens). Reuse the prototype's exact values (spec §"Exact values"). Do NOT demote Reports/Settings/Team. The kanban Withdrawn column already exists — do not touch it.

## Prereq
`cd ~/code/matchday-empv1 && npm install`. Baseline: `npm test -w client -- --run src/test/EmployerShell.test.tsx` passes.

---

## Task 1: Orange tokens + palette refinements + new logo

**Files:** Modify `client/src/styles/employer.css`; `EmployerShell.tsx`, `EmployerLanding.tsx`, `EmployerLogin.tsx`, `EmployerSignup.tsx`, `EmployerVerify.tsx`, `EmployerMfa.tsx` (the brand-bearing chrome). Update any test asserting the old brand text.

- [ ] **Step 1: employer.css tokens.** In the `.employer-app { … }` root block, add the orange family and apply the prototype's palette refinements (keep `--indigo: #1e3a8a` as-is):
```
--orange: #FF6F0B;  --orange-d: #e0600a;  --orange-bg: #fff3ea;
--wash: #e8eef8;    --wash-2: #f2f5fc;
--indigo-d: #162d6e; --indigo-dd: #0f1f4d;
--line: #dde4f0;    --line-2: #c9d3e8;
```
(Set the three `--shadow*` to the navy-tinted rgba(30,58,138,…) values from the prototype `:root` lines 40–42 if they differ.) In the `[data-theme="dark"] .employer-app { … }` block, add dark orange variants: `--orange: #ff9a4d; --orange-d: #ffb37a; --orange-bg: rgba(255,111,11,.16);`.

- [ ] **Step 2: Brand CSS.** In `employer.css`, add (near the existing `.logo-mark`/brand rules): `.employer-app .brand-name { font-weight: 800; letter-spacing: -.03em; line-height: 1; }` `.employer-app .brand-name .match { color: var(--indigo); }` `.employer-app .brand-name .day { color: var(--orange); }` `.employer-app .brand-tagline { display:block; font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--grey-2); margin-top: 2px; }`. Adjust `.employer-app .logo-mark` so it's a plain flex container (the V1 SVG draws its own box/outline — remove any gradient background/`place-items` fill that would sit behind the SVG; keep sizing ~28–32px).

- [ ] **Step 3: Swap the logo markup.** In EACH of the 6 brand-bearing files, find the current brand block (a `.logo-mark` span wrapping a cube `<svg>` followed by a wordmark like `Hiringhood<small>MatchDay</small>`) and replace the `.logo-mark` SVG + wordmark with the V1 mark + wordmark (keep each file's outer `<a>/<span>` wrapper + its className):
```tsx
<span className="logo-mark">
  <svg viewBox="0 0 36 36" width="28" height="28" fill="none">
    <rect x="2" y="2" width="32" height="32" rx="5" stroke="#1E3A8A" strokeWidth="2.5" fill="white" />
    <polyline points="8,18 15,25 28,11" stroke="#FF6F0B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
</span>
<span className="brand-text"><span className="brand-name"><span className="match">Match</span><span className="day">Day</span></span><span className="brand-tagline">AI/ML &amp; Data Hiring Drive</span></span>
```
(JSX: `strokeWidth`/`strokeLinecap`/`strokeLinejoin`, not the HTML kebab forms. Read each file first; the wrapper element differs — sidebar `.sb-brand`, landing nav `.brand`, auth card brand — keep the wrapper, swap only the mark + wordmark.) If a file shows just `Hiringhood` text with no `.brand-text` structure, replace it with the `.brand-text` block above.

- [ ] **Step 4: Fix tests.** Any test asserting the old brand text (e.g. `getByText('Hiringhood')`) → update to the new wordmark (e.g. assert `getByText('Match')` / `getByText('Day')`, or the tagline). Run the affected suites.

- [ ] **Step 5: Verify + commit.** `npm test -w client && npx -w client tsc --noEmit && npm run -w client build` (all green). `git add client/src/styles/employer.css client/src/pages/EmployerPortal/Employer{Shell,Landing,Login,Signup,Verify,Mfa}.tsx client/src/test && git commit -m "feat(client): employer V1 brand — orange accent tokens + new checkmark logo"`

---

## Task 2: Nav renames + JD-prefill banner + terminology

**Files:** Modify `EmployerShell.tsx` (nav labels + order), `EmployerRegister.tsx` (JD banner), and employer pages with "Candidate" copy; update `EmployerShell.test.tsx` (+ any label-asserting test).

- [ ] **Step 1: Nav renames + reorder.** In `EmployerShell.tsx` `NAV_SECTIONS`: change the `registrations` item label `'Registrations'` → `'Registered Drives'`; the `kanban` item label `'Kanban'` → `'Live Drive'`. Reorder the Hiring section so it reads **Registered Drives → Live Drive → Interviews** (Live Drive above Interviews). Do NOT change slugs, paths, or icons — labels + order only. Keep Candidates/Reports/Settings/Team items unchanged and reachable.

- [ ] **Step 2: Update shell/label tests.** `EmployerShell.test.tsx` asserts the presence of `'Registrations'` and `'Kanban'` (and clicks them). Update those label strings to `'Registered Drives'` and `'Live Drive'`. Check `EmployerRegistrations.test.tsx` / `EmployerPipelineEntry.test.tsx` / `EmployerKanban.test.tsx` for asserted page headings/labels that use "Registrations"/"Kanban" and update only where the label text actually changed (do not change slugs/routes). Keep all assertions meaningful (no weakening).

- [ ] **Step 3: JD-prefill banner.** In `EmployerRegister.tsx` (the registration wizard), add an informational banner shown on the input steps (not the first role step / not the final review): a muted note — "Fields pre-filled from your JD — review and edit anything before saving." Use an existing hint/banner class (e.g. `.hint` or the `.rd-banner`/`.val-summary` style already in employer.css); keep it purely informational (no logic). Confirm the wizard tests still pass (add a lightweight assertion that the banner renders on an input step if trivial).

- [ ] **Step 4: Terminology (Candidate → Jobseeker) — employer-facing copy only.** In employer-portal page copy where the user-visible word "Candidate"/"Candidates" appears as a heading/label (e.g. section titles, button labels), change to "Jobseeker"/"Jobseekers" to match V1. Do NOT rename routes, slugs, variable names, types, test IDs, or the `candidates` nav slug — visible copy only. Grep the EmployerPortal pages for the visible strings and update conservatively. Update any test asserting the old copy.

- [ ] **Step 5: Verify + commit.** `npm test -w client && npx -w client tsc --noEmit && npm run -w client build`. `git add -A client/src && git commit -m "feat(client): employer V1 IA — Registered Drives/Live Drive nav, JD-prefill banner, jobseeker copy"`

---

## Task 3: Full-suite verification

**Files:** none.
- [ ] Full client suite `npm test -w client` (all green), `npx -w client tsc --noEmit` clean, `npm run -w client build` ok. Server suite unaffected (no server change) — optionally `npm test -w server` for confidence. Report counts. No commit.

---

## Notes for the executor
- Navy (`--indigo:#1e3a8a`) is ALREADY the portal's color — do NOT recolor to navy; only ADD orange + refine washes/lines/shadows. Orange appears ONLY in the logo (checkmark + "Day") per Employer V1 — do not repaint buttons/KPIs orange.
- The kanban Withdrawn column already exists (`KANBAN_ALL`) — leave it.
- Do NOT demote Reports/Settings/Team (keep reachable). Do NOT change routes/slugs. This is a brand + copy + nav-label pass.
- Scope the logo swap to EMPLOYER chrome (shell + employer landing + employer auth). The jobseeker landing keeps its own brand (out of scope for Employer V1).
- Dark mode must keep working — add dark variants for the orange tokens.
