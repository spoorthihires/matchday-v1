# Drive → EvalConfig link — MERN Slice Design

**Date:** 2026-07-17
**Status:** Approved design, pending implementation plan
**Depends on:** the completed port + the five prior real-link slices (Institute↔Drive, Employer↔Drive, Drive↔Template, Candidate↔Slot, Drive↔Stream) — all on `origin/main` @ad821fd. Reuses `Drive`, `EvalConfig`, the drives module + wizard (`StepEvaluation`), and the eval-configs list. NO new collection.
**Context:** Sixth and **final** "real cross-entity link" slice — the last of the two deferred Drive sub-links.

## 0. What exists today

- **`EvalConfig`** is a reusable **per-stage-type** ruleset: `type ∈ { MCQ, Coding, TARA, Assignments }`, plus `passing/attempts/retake/cooldown/validity/autoQual/threshold`. It carries a stored `contests: Number` stat — client label **"Assigned to N contests"** (`EvalConfigCards.tsx:74`), where a "contest" means a drive. It is seeded to `8/6/5/0` and **always reset to 0** on `createEvalConfig`/`duplicateEvalConfig` — i.e. a pure faked stat, never derived, never wired to drives.
- **`Drive.evaluation`** is a per-stage subdoc array `{ key, enabled, config }` where `key ∈ { mcq, coding, tara, assignments }` maps 1:1 to an EvalConfig `type`. The inline `config` (`Record<string, number>`: e.g. `questions`, `durationMin`, `problems`, `deadlineDays`) holds **this drive's quantities** — a different axis from the EvalConfig's reusable **rules** (passing/attempts/threshold). They complement, not replace, each other.
- No link between the two exists.

## 1. Goal & Scope

Make Drive→EvalConfig a real link: each `Drive.evaluation` stage optionally references an `EvalConfig` of its matching type, picked in the drive wizard; and the EvalConfig `contests` stat becomes a live-derived count of drives referencing each config (the stored fake removed).

### In scope
- **`Drive.evaluation[].evalConfigId`** (ObjectId → `EvalConfig`, nullable) — persisted, normalized (`''`/invalid/absent → `null`; omit-preserves on update).
- **Per-stage EvalConfig picker** in `StepEvaluation`: each of the four stage rows gets a `<select>` of Active EvalConfigs whose `type` matches that stage's `key`; on select records `stage.evalConfigId`. **Record-only** — coexists with the inline quantity fields; does NOT modify the stage's `config`.
- **Derived `EvalConfig.contests`** = count of distinct drives referencing each config in their `evaluation` array, computed live in `listEvalConfigs` (one aggregation). The stored `contests` field is **removed** from the model, the seed, and the create/duplicate literals.
- **Seed** assigns each seeded drive's eval stages an `evalConfigId` of the matching type, deterministically, so `contests` derives to real non-zero counts.

### Out of scope (deferred)
- **Apply/pre-fill** — picking an EvalConfig does NOT copy its rules onto the stage's inline `config` (record-only; the two are different axes).
- **The eval-monitor "Contest" filter** — a separate concept derived from `Jobseeker` data in `evalMonitor`; untouched. (Killing the stored `EvalConfig.contests` does not affect it — `eval-monitor` never reads that field.)
- **Single-resource `getEvalConfig` derivation** — the eval-configs **list** (cards/table) is the binding consumer of `contests`; `getEvalConfig` (single) is left as-is (list-only, like Templates' `usedBy`, Streams' `drives`).
- Command Center — has no eval-config metric; untouched.
- The stage's inline `config` fields and the template/stream pickers — untouched.

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Link granularity | Per-stage: `Drive.evaluation[].evalConfigId` |
| Pick behavior | Record-only (store `evalConfigId`); no auto-fill of inline `config` |
| Derived stat | `contests` = distinct drives referencing the config, derived-on-read; stored field removed |
| Type matching | Stage `key` → EvalConfig `type`: `mcq→MCQ, coding→Coding, tara→TARA, assignments→Assignments` |
| Wizard surface | A per-stage `<select>` in each `StepEvaluation` row |

## 3. Server changes

- **`server/src/models/Drive.ts`:** add to `evaluationStageSchema`: `evalConfigId: { type: Schema.Types.ObjectId, ref: 'EvalConfig', default: null }`.
- **`server/src/modules/drives/drives.schemas.ts`:** the `evalStage` object gains `evalConfigId: z.string().optional()` (so the `evaluation` array in create/draft/update carries it).
- **`server/src/modules/drives/drives.service.ts`:** when writing the `evaluation` array, normalize each stage's `evalConfigId` (`''`/invalid/absent → `null` via a helper mirroring `normTemplateId`/`normStreamId`). Apply in `createDrive` (always, if `evaluation` present) and `updateDrive` (only when `'evaluation' in patch`). No `''` reaches the subdoc's ObjectId path. `getDrive`/list unchanged (raw stages now carry `evalConfigId`).
- **`server/src/models/EvalConfig.ts`:** remove the stored `contests` field.
- **`server/src/modules/evalConfigs/service.ts`:** in `listEvalConfigs`, after building `items`, derive `contests` via `Drive.aggregate([{ $unwind: '$evaluation' }, { $match: { 'evaluation.evalConfigId': { $ne: null } } }, { $group: { _id: '$evaluation.evalConfigId', drives: { $addToSet: '$_id' } } }, { $project: { n: { $size: '$drives' } } }])` → `Map<configIdStr, n>`; overlay `it.contests = map.get(it.id) ?? 0`. Import `Drive`. Keep `contests: number` on `EvalConfigItem`; `toItem` sets placeholder `contests: 0`. Remove the `contests: 0` literal from `createEvalConfig` and `duplicateEvalConfig` (the field no longer exists on the model).
- **`server/src/seed/seed.ts`:** remove the hardcoded `contests: N` from the 4 `evalConfigDocs`; capture `const createdEvalConfigs = await EvalConfig.insertMany(evalConfigDocs);`; build a `type → configId` map; after the drives are created, for each seeded drive set each eval stage's `evalConfigId` to the matching-type config, deterministically (via `Drive.updateOne`/`Drive.updateMany` or by setting on the drive docs before insert — whichever fits the existing seed structure), so `contests` derives to real non-zero counts.

## 4. Client changes

- **`client/src/types/drives.ts`:** `EvaluationStage` gains `evalConfigId?: string`.
- **`client/src/pages/Drives/wizard/DriveWizard.tsx`:** `blankDriveModel()` — each of the four eval stages gains `evalConfigId: ''`; `mapDocToInput(doc)` — map each incoming stage to include `evalConfigId: stage.evalConfigId ? String(stage.evalConfigId) : ''`.
- **`client/src/pages/Drives/wizard/StepEvaluation.tsx`:** add a per-stage EvalConfig `<select>` inside each `evrow` (e.g. within the `evcfg` area). Populate from a `useEvalConfigs({ status: 'Active' })` hook; filter options to configs whose `type` matches the row via a `KEY_TO_TYPE` map (`{ mcq: 'MCQ', coding: 'Coding', tara: 'TARA', assignments: 'Assignments' }`). Blank option `value=""` → "No configuration". On change: set that stage's `evalConfigId` (map over `model.evaluation` like the existing `setConfig`/`toggleEnabled` helpers). Record-only — does not touch `enabled` or `config`.
- **`useEvalConfigs` hook:** reuse if one exists under `client/src/pages/Evaluations/hooks/`; otherwise add a minimal `useEvalConfigs(params)` mirroring `useStreams`/`useTemplates` (GET `/eval-configs`, returns `{ items: EvalConfigItem[] }`, `enabled: !!token`).
- **`EvalConfigCards.tsx`** already renders `c.contests` ("Assigned to N contests") — no change; the number becomes real (now derived). The client `EvalConfigItem` type keeps `contests: number` (still supplied).

No new CSS (reuse the wizard's `.mini-fld`/`.select` and the eval row styling).

## 5. Testing (TDD)

- **Server:**
  - `drives.service`: create a drive whose `evaluation` has a stage with a valid `evalConfigId` → persisted + returned; update sets/clears it; `''`/invalid normalized to null (no cast crash); a patch omitting `evaluation` preserves existing stage links (regression).
  - `evalConfigs` service: `contests` derived — a config referenced by 2 drives → `contests===2`; unreferenced → `0`; `listEvalConfigs` returns derived counts; create/duplicate still work (no stored `contests`).
  - Build fixtures with real `Drive`/`EvalConfig` docs (mongodb-memory-server).
- **Client:** `StepEvaluation` renders a per-stage EvalConfig picker filtered to the row's type from a mocked `useEvalConfigs`; selecting a config sets that stage's `evalConfigId` on the model; the wizard submit payload includes it. (The existing template picker + toggles keep working.)

## 6. File Structure

```
server/src/
  models/Drive.ts                                 # + evaluationStageSchema.evalConfigId
  models/EvalConfig.ts                            # - contests field
  modules/drives/drives.schemas.ts                # evalStage + evalConfigId
  modules/drives/drives.service.ts                # normalize stage evalConfigId on create/update
  modules/evalConfigs/service.ts                  # derive contests from Drive; drop contests:0 literals
  seed/seed.ts                                    # drop contests seed; assign stage evalConfigId by type
server/test/
  drives.service.test.ts                          # stage evalConfigId round-trip + omit-preserves
  eval-configs.service.test.ts                    # derived contests
client/src/
  types/drives.ts                                 # EvaluationStage + evalConfigId
  pages/Drives/wizard/DriveWizard.tsx             # blankDriveModel + edit map
  pages/Drives/wizard/StepEvaluation.tsx          # per-stage EvalConfig picker (type-filtered)
  pages/Evaluations/hooks/useEvalConfigs.ts       # reuse or add
client/src/test/
  StepEvaluation.test.tsx                         # per-stage picker sets stage.evalConfigId
```

## 7. Notes

- **Derived, never stored** — `contests` computed on every `listEvalConfigs` read; nothing to drift. Consistent with Institute `assignedDrives`, Employer `activeDrives`, Template `usedBy`, Slot booked/held, Stream `drives`.
- **Record-only** — a stage's `evalConfigId` names which reusable ruleset applies; it never overwrites the drive's own inline quantities or its enabled flag. No conflict with the template picker (seeds `enabled`) or the stream picker (record-only classification).
- **Distinct-drives count** — a drive has at most one stage per type and a config has one type, so a config is referenced by at most one stage per drive; `$addToSet` of the drive `_id` makes the count robust regardless.
- **Type note:** removing `contests` from `EvalConfig` drops it from the inferred model type; the only reader is `listEvalConfigs`' mapping (now the derived overlay) — `tsc` stays clean. The client `EvalConfigItem` keeps `contests: number` (still supplied, now derived).
- **Seed:** assign `evalConfigId` across the seeded drives' stages so the cards show real non-zero "Assigned to N contests"; the counts intentionally differ from the prototype's hardcoded `8/6/5/0` (now real, drive-count-based).
- **Isolation/DB:** built in an isolated worktree (`/Users/srinivasarao.kandula/code/matchday-driveeval`, off `origin/main`); the seed RUN + smoke happen against an isolated DB in the E2E task — the shared local `matchday` DB is the user's parallel-work space and must not be touched.
