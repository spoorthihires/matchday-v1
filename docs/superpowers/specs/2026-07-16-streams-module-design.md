# Streams Module — MERN Slice Design

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Depends on:** the eight prior slices — reuses auth, app shell, all conventions, and the versioning model from Templates. Adds two new collections (`Stream`, `StreamRules`). Does NOT modify the Command Center. Built stacked on `feat/evaluations-module` (Evaluations is on unmerged PR #1).
**Source prototype:** `matchday-admin-app_23.html` — Stream Configuration page (1439–1504) + editor modal; Stream Selection Rules page (1711–1781); runtime: streams (2992–3147), selection rules (3149–3190).

## 1. Goal & Scope

The ninth (final) vertical slice: the **Streams** area — two pages replacing the "Coming soon" placeholder at the `Streams` nav. Completes the prototype port.
1. **Stream Configuration** (`/streams`) — a sortable table of hiring streams with a rich editor and version history. New `Stream` collection (versioned, mirroring the Templates model).
2. **Stream Selection Rules** (`/streams/rules`) — a global singleton settings page. New `StreamRules` collection (one document).

### In scope
- **Configuration page**: search (name/parent/label/skills), parent-category filter (Engineering/Data Science/Business/Design/Product), status filter (Active/Disabled), "Selection Rules" button → `/streams/rules`, Export CSV, Create Stream.
  - **Table** (`.dm` table, `min-width:1080`): sortable columns Stream (name) / Parent Category / Cutoff (`data-ssort` name|parent|cutoff, asc/desc toggle); plus Skills (first-3 `.skill-pill` + "+N"), Evaluation Flow (chevron-joined), Branches, Employer Label, Version (`.vbadge`), Status (`.badge-st` Active→st-active, Disabled→st-archived), Actions. Footer shows "N streams" count (no pagination — the prototype has none).
  - **Row actions / kebab**: Edit · Version history · Enable/Disable (toggle). **No delete, no clone** (the prototype's kebab has none).
  - **Editor modal** (create/edit, `.modal.wide`, scrollable `.se-grid`): name (required), parent category, employer-visible label, skills (tag input, Enter/comma to add, × to remove), good-to-have skills (tag input), evaluation flow (`.flow-chips` toggle, canonical MCQ→Coding→TARA→Assignment order), cutoff slider (0–100 with live %), min CGPA, max backlogs, graduation years / allowed branches / candidate sources (`.schips` chip groups), status. Save → create/update.
  - **Version history modal** (`.ver-item`): entries (v / note / date / by), current marked; Restore on older entries → bump + "Restored vX".
  - **Export CSV**: the filtered rows (head: Stream Name, Parent Category, Employer Label, Skills Required, Good To Have, Evaluation Flow, Cutoff Score, Min CGPA, Max Backlogs, Graduation Years, Allowed Branches, Candidate Sources, Version, Status).
- **Selection Rules page** (`/streams/rules`, `max-width:860`): back-link to Streams; a live "Current policy" summary sentence; seven setting cards — Number of Streams Allowed (`numAllowed` 1/2/3/Unlimited pick), Primary Stream (`requirePrimary` switch + `defaultPrimary` select), Secondary Streams (`allowSecondary` switch + `maxSecondary` number), Stream Change Policy (`changePolicy` select + `cooldown` days), Evaluation Reusability (`reuseEval` switch + `reuseScope` pick), Evaluation Validity (`validityExpires` switch + `validityDays`), Auto Stream Suggestion (`autoSuggest` switch + `suggestBasis` pick + `confidence` slider); dependent-row disabling (a dependent row greys via `.disabled` when its switch is off); an unsaved-changes indicator (`.sr-dirty`); Save rules; Reset to defaults (confirm).
- Sidebar "Streams" → `/streams`.

### Out of scope (deferred)
- Deleting/cloning streams (the prototype offers neither).
- Any link between a `Stream` and Drives/Jobseekers/eval-configs (none exists in the prototype — `flow` values are plain strings, not FK refs to eval configs; the Drive `stream` field is a *degree* stream, a different concept).
- Any Command Center change.

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Scope | Both pages, full faithful |
| `Stream` versioning | Yes — mirrors Templates (`bumpVersion`, `versions[]`, restore) |
| Version bump rule | Editor save always bumps + logs "Edited stream configuration"; a **status-only** PATCH (kebab toggle) does NOT bump |
| Delete / clone | Neither (not in the prototype) |
| `flow` ordering | Canonicalized to MCQ→Coding→TARA→Assignment on save |
| `StreamRules` | A single global document; GET creates-from-defaults if absent; PUT upserts; Reset = client PUTs `SR_DEFAULTS` |
| CC integration | None |

## 3. `Stream` collection + `/api/streams`

```ts
Stream {
  name: string;
  parent: string;             // Engineering | Data Science | Business | Design | Product (zod enum)
  label: string;              // employer-visible label
  skills: string[];
  good: string[];             // good-to-have
  flow: string[];             // ordered subset of ['MCQ','Coding','TARA','Assignment']
  cutoff: number;             // 0–100
  cgpa: number;               // 0–10
  backlogs: number;           // >= 0
  grad: string[];             // subset of ['2024','2025','2026','2027']
  branches: string[];         // subset of ['CSE','IT','ECE','EEE','MECH','MCA','MBA']
  sources: string[];          // subset of ['Institutes','Resume Vault','Referrals','Direct Apply','Recruiter Uploads']
  status: 'Active' | 'Disabled';
  version: string;            // '1.3'
  versions: { v: string; date: Date; by: string; note: string }[];   // newest first
  createdAt: Date; updatedAt: Date;   // explicit (no timestamps)
}
```

API (`requireAuth`, standard `{error:{message,code}}` contract):
- **`GET /`** — `q` (name/parent/label/skills contains, regex-escaped), `parent`, `status`, `sort` (`name`|`parent`|`cutoff`, default `name`), `order` (`asc`|`desc`, default `asc`). Returns `{ items: StreamItem[] }` (all matching; no pagination). `StreamItem` = doc fields + `id` + `code` (`STR-` + last 3 hex of id, uppercased).
- **`POST /`** — zod: name (min 1), parent (enum), label (default ''), skills/good (string[] default []), flow (array of the flow enum, canonicalized), cutoff (int 0–100 default 65), cgpa (0–10 default 6.5), backlogs (int ≥0 default 1), grad/branches/sources (string[]), status (enum default 'Active'). Creates v1.0 + `versions:[{v:'1.0', date:now, by:'Platform Admin', note:'Initial stream'}]`. → 201.
- **`GET /:id`** — 404 on unknown/malformed.
- **`PATCH /:id`** — partial. **If the patch contains any config field other than `status` alone** → `version = bumpVersion` + unshift `{note:'Edited stream configuration'}`; a `{status}`-only patch does NOT bump. `flow` re-canonicalized. Always sets `updatedAt`.
- **`POST /:id/restore`** — `{ v }` (must exist, else 400 validation) → bump + `{note:'Restored v{v}'}`; sections NOT rolled back (ledger-only, matching Templates).

Module `server/src/modules/streams/` (schemas/service/controller/routes). New model `server/src/models/Stream.ts`. Actor = `'Platform Admin'`. `bumpVersion` shared logic (increment minor; identical to Templates).

## 4. `StreamRules` collection + `/api/stream-rules`

```ts
StreamRules {   // singleton
  numAllowed: string;         // '1' | '2' | '3' | 'Unlimited'
  requirePrimary: boolean;
  defaultPrimary: string;     // 'First selected stream' or a stream name
  allowSecondary: boolean;
  maxSecondary: number;       // 0–5
  changePolicy: string;       // Anytime | Before evaluation only | Requires admin approval | Locked after drive assignment
  cooldown: number;           // days 0–365
  reuseEval: boolean;
  reuseScope: string;         // Any stream | Same domain only | Exact match only
  validityDays: number;       // 1–720
  validityExpires: boolean;
  autoSuggest: boolean;
  suggestBasis: string;       // Skills | Past evaluations | Skills + evaluations
  confidence: number;         // 0–100
  updatedAt: Date;
}
```
`SR_DEFAULTS` (verbatim from the prototype): `{numAllowed:'2', requirePrimary:true, defaultPrimary:'First selected stream', allowSecondary:true, maxSecondary:2, changePolicy:'Before evaluation only', cooldown:14, reuseEval:true, reuseScope:'Same domain only', validityDays:90, validityExpires:true, autoSuggest:true, suggestBasis:'Skills + evaluations', confidence:70}`.

API (`requireAuth`):
- **`GET /`** — returns the single doc; if none exists, creates one from `SR_DEFAULTS` and returns it.
- **`PUT /`** — zod-validated full rules object; upsert (there is exactly one doc). Returns the saved doc. (Reset-to-defaults is the client PUT-ing `SR_DEFAULTS`.)

Module `server/src/modules/streamRules/` (schemas/service/controller/routes).

## 5. Frontend

Routes `/streams` and `/streams/rules` (both protected). Sidebar "Streams" → `/streams`.

`client/src/pages/Streams/`:
- `index.tsx` — `StreamsPage`: AppShell (crumb "Configuration", title "Stream Configuration"); filters + `StreamTable`; editor/version/kebab state; Selection Rules → `navigate('/streams/rules')`; Export CSV of the current filtered rows.
- `StreamTable.tsx` — sortable table (click header toggles sort/dir), `.skill-pill` first-3 + "+N", chevron-joined flow, status badge, `.vbadge`; per-row kebab (edit/version/toggle) using the positioned-container pattern.
- `StreamEditorModal.tsx` — the rich editor: `.taginput` skills/good (Enter/comma add, × remove), `.flow-chips` (canonical-order toggle), cutoff `.cutoff-row` slider, `.schips` chip groups for grad/branches/sources, CGPA/backlogs/status. Local draft; name required inline; Save → create/patch mutation.
- `StreamVersionHistoryModal.tsx` — `.ver-item` list + restore (mirrors Templates' version modal; stream-scoped).
- `rules/StreamRulesPage.tsx` — AppShell (crumb "Configuration · Streams", title "Stream Selection Rules"); back-link; the seven `.set-card`s (`.pick` option groups, `.switch` buttons, selects/number inputs, `.confidence` slider); live summary (`streamRulesSummary(cfg)` pure helper); dependent-row `.disabled` toggling; `.sr-dirty` indicator; Save (`useStreamRulesMutation`); Reset-to-defaults (confirm → sets form to `SR_DEFAULTS`, saves).
- `rules/streamRulesUtils.ts` — `SR_DEFAULTS`, `streamRulesSummary(cfg): string` (the "Current policy" sentence, pure/testable).
- `streamsConstants.ts` — `PARENTS`, `ALL_FLOW`, `ALL_GRAD`, `ALL_BRANCHES`, `ALL_SOURCES`, and the canonical-order `orderedFlow` helper.
- `types/streams.ts`; `hooks/useStreams.ts` + `useStreamMutations.ts` (create/update/restore → invalidate `['streams']`); `hooks/useStreamRules.ts` + `useStreamRulesMutation.ts` (invalidate `['stream-rules']`).

## 6. Seed

`server/src/seed/seed.ts` — add `Stream.deleteMany` + `StreamRules.deleteMany` to cleanup; insert the prototype's **5 streams verbatim** (Frontend Engineering, Backend Engineering, Data / ML, Full-stack, Business Analytics — with their skills/good/flow/cutoff/cgpa/backlogs/grad/branches/sources/status/version/versions, version dates via `D(y,m,d)` UTC, `updatedAt` via `daysAgo`); insert one `StreamRules` doc at `SR_DEFAULTS`. Deterministic.

## 7. Testing (TDD)

- **Server**: streams service (list q/parent/status filters + sort name/parent/cutoff asc-desc; create v1.0+entry; **PATCH with config bumps + "Edited stream configuration", status-only PATCH doesn't**; restore bump + note; flow canonicalization to MCQ→Coding→TARA→Assignment; zod bounds — cutoff 0–100, bad parent → 400); routes (401, CRUD, restore, 400, 404). streamRules service (GET creates defaults when empty; PUT upsert round-trip; only ever one doc); route (401, GET default shape, PUT).
- **Client**: StreamTable renders rows + a header click re-sorts; StreamEditorModal (add/remove a skill tag, toggle a flow chip keeps canonical order, save fires the right payload); StreamRulesPage (toggling a switch greys its dependent row + marks dirty; the summary sentence reflects the config; Save fires the full payload; Reset restores defaults); StreamVersionHistoryModal restore fires.
- `streamRulesUtils.test.ts` — `streamRulesSummary` for a couple of configs (on/off branches).

## 8. File Structure Additions

```
server/src/
  models/Stream.ts  models/StreamRules.ts
  modules/streams/      streams.schemas.ts service.ts controller.ts routes.ts
  modules/streamRules/  stream-rules.schemas.ts service.ts controller.ts routes.ts
  app.ts                # mount /api/streams + /api/stream-rules
  seed/seed.ts          # 5 streams + 1 rules doc + cleanup
server/test/
  streams.service.test.ts streams.route.test.ts
  stream-rules.service.test.ts stream-rules.route.test.ts
client/src/
  types/streams.ts
  pages/Streams/
    index.tsx StreamTable.tsx StreamEditorModal.tsx StreamVersionHistoryModal.tsx streamsConstants.ts
    rules/StreamRulesPage.tsx rules/streamRulesUtils.ts
    hooks/useStreams.ts useStreamMutations.ts useStreamRules.ts useStreamRulesMutation.ts
  App.tsx components/Sidebar.tsx
client/src/test/
  StreamTable.test.tsx StreamEditor.test.tsx StreamRules.test.tsx streamRulesUtils.test.ts
```

## 9. Status / version notes

- Stream `status` is `Active`↔`Disabled` (kebab toggle, no version bump); Disabled rows render `st-archived`. Streams are never deleted (disable only) — faithful to the prototype.
- Version ledger identical to Templates: create → 1.0; editor save → minor bump + "Edited stream configuration"; restore → bump + "Restored vX" (ledger-only, sections not rolled back); status toggle → no bump.
- `flow` canonical order (MCQ→Coding→TARA→Assignment) enforced on every write so the table's chevron-joined display and CSV export read consistently.
