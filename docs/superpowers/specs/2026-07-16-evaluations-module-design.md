# Evaluations Module — MERN Slice Design

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Depends on:** the seven prior slices — reuses auth, app shell, all conventions, and the `Jobseeker`/`Institute` collections (Monitoring derives from `Jobseeker`). Adds one new collection (`EvalConfig`). Does NOT modify the Command Center.
**Source prototype:** `matchday-admin-app_23.html` — Evaluation Management page (lines 1784–1816) + editor modal (1798–1816); Evaluation Monitoring page (1849–1890); runtime: configs (3194–3285), monitoring (3287–3360).

## 1. Goal & Scope

The eighth vertical slice: the **Evaluations** area — two pages replacing the "Coming soon" placeholder at the `Evaluations` nav.
1. **Evaluation Management** (`/evaluations`) — a card-grid CRUD of reusable **assessment configurations** (a new `EvalConfig` collection). No version history (unlike Templates/Streams).
2. **Evaluation Monitoring** (`/evaluations/monitor`) — a **read-only live pipeline dashboard** derived from `Jobseeker`, with a client-side ephemeral "advance" simulation.

### In scope
- **Management page**: search (name/type), type filter (MCQ/Coding/TARA/Assignments), status filter (Active/Inactive = enabled true/false), "Live Monitoring" button → `/evaluations/monitor`, "Create Configuration" button.
  - **Cards** (reuse `.tpl-card`/`.tpl-head`/`.tpl-ic`/`.tpl-sections`/`.tsec`/`.tpl-foot`; disabled cards get `.ev-off`): type icon, name, `.chip dom` type, Active/Inactive badge, an inline `.switch .ev-toggle` (toggles enabled), six `.tsec` tiles (Passing %, Attempts, Retake, Cooldown d, Validity d, Auto-qualify "≥ N%"/"Manual"), footer "Assigned to N contest(s) · {updated}" + Edit / Duplicate / More.
  - **Kebab (More)**: Edit configuration · Duplicate · Enable/Disable · Delete (confirm).
  - **Editor modal** (create/edit): name (required), assessment type, Enabled switch, passing score, max attempts, retake rules, cooldown days, validity days, Auto-qualification switch + threshold row (threshold row shown only when Auto-qualification is on). Save → create/update.
- **Monitoring page**: back-link to Management; filters (contest / employer / institute / date-range); a "Live · updated {ago}" heartbeat; Export CSV; KPI row (In Pipeline / Awaiting Evaluation / Match Ready / Avg Progress); a clickable **stage strip** (10 stage cards with per-stage counts); two funnels — **Evaluation funnel** (cumulative "reached" per stage) and **Pipeline health** (current count per stage); a candidate table (Candidate / Institute / Contest / Current stage / Score / Last update), top 20 by recency, filterable by clicking a stage card. **Client-side ephemeral simulation**: every ~3.5s advance one random not-yet-Match-Ready candidate a stage in LOCAL state and re-render; re-sync to the server on filter change.
- Sidebar "Evaluations" → `/evaluations`.

### Out of scope (deferred)
- Persisting the live simulation (it is purely a client visual, matching the prototype's in-memory `emCands`).
- A `Contest` collection (contests are a seeded string set of 4; the config's `contests` count is a stored stat with nothing to derive it from — same convention as Templates' `usedBy`).
- Any Command Center change (its evaluations numbers already derive from `Jobseeker` and keep working).
- Real MCQ/Coding/TARA sub-stage tracking on `Jobseeker` (the sub-stage granularity is derived — see §4).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Scope | Both pages, full faithful |
| Monitoring data | **Derive from real `Jobseeker`** (deterministic; reconciles KPIs with the CC) |
| Live simulation | **Client-side ephemeral** (no DB writes; re-syncs on refetch) |
| Config versioning | None (the prototype's eval configs have no version history) |
| `contests` on a config | Stored stat (seeded; no `Contest` collection) |
| Contest / employer per candidate | Derived deterministically (`hash(_id) % 4` over seeded string sets) |
| CC integration | None — CC untouched |

## 3. `EvalConfig` collection + `/api/eval-configs`

```ts
EvalConfig {
  name: string;
  type: 'MCQ' | 'Coding' | 'TARA' | 'Assignments';   // zod enum; plain String at model
  enabled: boolean;                 // Active(true) / Inactive(false)
  passing: number;                  // 0–100
  attempts: number;                 // 1–10
  retake: 'Not allowed' | 'After cooldown' | 'Unlimited' | 'Admin approval';
  cooldown: number;                 // days, 0–90
  validity: number;                 // days, 1–365
  autoQual: boolean;
  threshold: number;                // 0–100 (auto-qualify score)
  contests: number;                 // stored stat, default 0
  createdAt: Date; updatedAt: Date; // explicit (no timestamps)
}
```

API (`requireAuth`, standard `{error:{message,code}}` contract):
- **`GET /`** — `q` (name/type contains, case-insensitive, regex-escaped), `type`, `status` (`Active`→enabled true / `Inactive`→enabled false). Returns `{ items: EvalConfigItem[] }` (all matching, newest-updated first). `EvalConfigItem` = the doc fields + `id` + `code` (`EVC-` + last 3 hex of id, uppercased — display-only).
- **`POST /`** — zod (name min 1; type enum; enabled default true; passing int 0–100 default 60; attempts int 1–10 default 2; retake enum default 'After cooldown'; cooldown int 0–90 default 2; validity int 1–365 default 90; autoQual default false; threshold int 0–100 default 70). Creates with `contests: 0`. → 201.
- **`GET /:id`** / **`PATCH /:id`** (partial — also powers the inline enable toggle: `{enabled}`) / **`DELETE /:id`** → `{deleted:true}`. 404 on unknown/malformed id.
- **`POST /:id/duplicate`** — new doc: `name:'{name} (Copy)'`, `enabled:false`, `contests:0`, all other config fields copied. → 201.

Module `server/src/modules/evalConfigs/` (schemas/service/controller/routes). Sub-path `/:id/duplicate` declared before bare `/:id`. New model `server/src/models/EvalConfig.ts`.

## 4. Monitoring — derivation from `Jobseeker` + `/api/eval-monitor`

**Stages (index 0–9), verbatim from the prototype `STAGES`:** Invited, Signed Up, Profile Complete, MCQ Pending, MCQ Completed, Coding Pending, Coding Completed, TARA Pending, TARA Completed, Match Ready — each with its label, short label, and color (ported to a shared constant).

**Seeded string sets (module constants, not collections):**
- `EM_CONTESTS = ['Frontend · Jul cohort', 'Backend · Jul cohort', 'Data/ML Specialists', 'Full-stack · Aug']`
- `EM_EMPLOYERS = ['Nexatech Labs', 'Aetherverse AI', 'Quantbridge', 'Helioserv']`

**Deterministic derivation per jobseeker** (a small stable integer hash of the `_id` hex string; NOT `Math.random` — reproducible across requests):
- **Exclude** `stage === 'DroppedOff'`.
- **Monitoring stage:**
  - `stage ∈ {MatchReady, Shortlisted, Offer, Joined}` → **9** (Match Ready). *(This set equals the CC `matchReady` definition, so the stage-9 total reconciles with the CC's 531.)*
  - else `evaluationStatus === 'completed'` → **8** (TARA Completed).
  - else `evaluationStatus === 'pending'` → **3 + (hash % 5)** (one of MCQ Pending … TARA Pending, stages 3–7).
  - else `profileCompleted === true` → **2** (Profile Complete).
  - else → **hash % 2** (0 Invited / 1 Signed Up).
- **contest** = `EM_CONTESTS[hash % 4]`; **employer** = `EM_EMPLOYERS[hash % 4]` (a second offset hash so contest and employer don't lock-step).
- **score** = stage ≥ 2 ? `45 + (hash % 55)` (45–99) : 0.
- **minsAgo** = `hash % 2880` (0–2 days), deterministic (drives the "Last update" column + table sort).

**`GET /api/eval-monitor`** — query `contest`, `employer`, `institute` (institute name), `date` (Last 30 days | Last 7 days | Today | All time — filters on `minsAgo`: 43200 / 10080 / 1440 / ∞). Returns:
```ts
{
  candidates: MonitorCandidate[],   // derived + filtered; { id, code (C-####), name, institute, contest, employer, stage, score, minsAgo }
  contests: string[],               // EM_CONTESTS (filter options)
  employers: string[],              // EM_EMPLOYERS
  institutes: string[],             // distinct institute names present
}
```
The **client** computes all counts/funnels/KPIs/table from `candidates` (a near-verbatim port of `renderEvalMonitor`) and runs the ephemeral simulation. Returning the full filtered array (≤ ~1.3k lean objects) matches the prototype, which holds all candidates client-side.

Module `server/src/modules/evalMonitor/` (service/controller/routes; service exports the derivation so tests can assert it directly).

## 5. Frontend

Routes `/evaluations` and `/evaluations/monitor` (both protected). Sidebar "Evaluations" → `/evaluations`.

`client/src/pages/Evaluations/`:
- `index.tsx` — `EvaluationsPage`: AppShell (crumb "Supply", title "Evaluation Management"); filters + `.tpl-grid` of `EvalConfigCards`; editor + kebab state; "Live Monitoring" → `navigate('/evaluations/monitor')`.
- `EvalConfigCards.tsx` — presentational card grid (reuse `.tpl-card`/`.ev-off`/`.ev-toggle`; `evTypeMeta` icon map); inline enable toggle fires a `{enabled}` patch; kebab (edit/duplicate/toggle/delete-confirm).
- `EvalConfigModal.tsx` — the editor (fields per §3; the threshold row is shown only when Auto-qualification is on; name required inline). Save → create/patch mutation.
- `monitor/EvalMonitorPage.tsx` — AppShell (crumb "Supply · Evaluations", title "Evaluation Monitoring"); back-link → `/evaluations`; filters; KPI row; stage strip (`.stage-strip`/`.stage-card`); two funnels (`.funnel`/`.fstep`); candidate table (`.dm-table-wrap`); Export CSV; the live heartbeat + ephemeral simulation (a `useEffect` interval over local candidate state).
- `monitor/monitorUtils.ts` — the shared `STAGES` constant, `fmtMins`, and the pure compute helpers (stage counts, reached/cumulative, KPI figures) so they're unit-testable.
- `types/evaluations.ts`; `hooks/useEvalConfigs.ts` + `useEvalConfigMutations.ts` (invalidate `['eval-configs']`); `hooks/useEvalMonitor.ts` (key `['eval-monitor', contest, employer, institute, date]`).

## 6. Seed

`server/src/seed/seed.ts` — add `EvalConfig.deleteMany` to the cleanup group and insert the prototype's **4 configs verbatim** (Standard MCQ round / Coding challenge / TARA AI interview / Take-home assignment, with their passing/attempts/retake/cooldown/validity/autoQual/threshold/contests/enabled values; `updatedAt` offsets so the relative labels read like the prototype). Monitoring needs **no seed** — it derives from the already-seeded jobseekers.

## 7. Testing (TDD)

- **Server**: EvalConfig service (list q/type/status filters + newest-first; create defaults; patch incl. enable-toggle; duplicate semantics '(Copy)'/disabled/contests 0; delete + 404s; zod bounds — passing/threshold 0–100, attempts 1–10); routes (401, 201s, duplicate, patch, delete, 400 bad type, 404). Eval-monitor service: **the derivation** — a jobseeker constructed in each band lands in the expected stage; `DroppedOff` excluded; stage-9 count equals `matchReady` over the same fixtures; derivation is deterministic (same input → same stage/contest/employer across two calls); filters (contest/employer/institute/date) narrow correctly; route 401 + shape.
- **Client**: config cards render tiles/badge from a mocked list + inline toggle fires a patch; editor save fires the right payload + threshold row visibility toggles with Auto-qualify; monitor page renders KPIs/stage counts/funnels from a mocked `candidates` payload, a stage-card click filters the table, and the ephemeral simulation advances local state (fake timers).

## 8. File Structure Additions

```
server/src/
  models/EvalConfig.ts
  modules/evalConfigs/  eval-configs.schemas.ts service.ts controller.ts routes.ts
  modules/evalMonitor/  eval-monitor.service.ts controller.ts routes.ts
  app.ts                # mount /api/eval-configs + /api/eval-monitor
  seed/seed.ts          # 4 configs + cleanup
server/test/
  eval-configs.service.test.ts eval-configs.route.test.ts
  eval-monitor.service.test.ts eval-monitor.route.test.ts
client/src/
  types/evaluations.ts
  pages/Evaluations/
    index.tsx EvalConfigCards.tsx EvalConfigModal.tsx
    monitor/EvalMonitorPage.tsx monitor/monitorUtils.ts
    hooks/useEvalConfigs.ts useEvalConfigMutations.ts useEvalMonitor.ts
  App.tsx components/Sidebar.tsx
client/src/test/
  EvalConfigCards.test.tsx EvalConfigModal.test.tsx
  EvalMonitor.test.tsx monitorUtils.test.ts
```

## 9. Status / stage model notes

- Config "status" is just `enabled` (Active↔Inactive); disabled cards render dimmed (`.ev-off` + `st-draft` badge) and remain editable/duplicable. Delete is permanent (confirm).
- Monitoring stages are a fixed 10-stage sequence; "reached" (funnel) is cumulative (`stage ≥ s`), "health" is the current per-stage count — matching the cumulative-funnel convention used elsewhere.
- The derivation fabricates sub-stage/contest/employer detail deterministically; band boundaries map to real `Jobseeker` fields so the KPIs reconcile with the CC.
