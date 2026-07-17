# Drive → EvalConfig link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real per-stage `Drive.evaluation[].evalConfigId` FK to the `EvalConfig` collection (picked in the drive wizard, record-only) and turn the faked `EvalConfig.contests` stat into a live-derived count of drives referencing each config.

**Architecture:** A nullable `evalConfigId` on each eval-stage subdoc, normalized in the drives service (mirroring `templateId`/`streamId` but applied per-stage across the `evaluation` array). `contests` is derived-on-read in `listEvalConfigs` via one aggregation over `Drive.evaluation.evalConfigId`; the stored `contests` field is removed from the model, seed, and create/duplicate. Client: a per-stage EvalConfig `<select>` in `StepEvaluation`, type-filtered, reusing the existing `useEvalConfigs` hook.

**Tech Stack:** Express 4 + Mongoose 8 + zod (server, TS strict, ESM `.js` suffixes); React 18 + Vite + @tanstack/react-query 5 (client); vitest + mongodb-memory-server (tests).

## Global Constraints

- TS strict; ESM with explicit `.js` import suffixes; `npx -w server tsc --noEmit` AND `npx -w client tsc --noEmit` must stay clean.
- Error contract `{ error: { message, code } }`; zod → 400 via central `errorHandler`; not-found → 404.
- **Derived, never stored:** `contests` is computed on every `listEvalConfigs` read; NO stored `contests` field remains on the `EvalConfig` model. Consistent with Template `usedBy`, Stream `drives`, etc.
- **`evalConfigId` normalization:** each eval stage's `evalConfigId` is `''`/invalid/absent → `null` before it reaches Mongoose (no `''` to an ObjectId path). `createDrive` normalizes the `evaluation` array always (it's a required array); `updateDrive` normalizes only when `'evaluation' in patch`.
- **Record-only:** picking an EvalConfig sets only `stage.evalConfigId` — it never changes the stage's `enabled` flag or inline `config`. No conflict with the template picker (seeds `enabled`) or stream picker.
- **Type matching:** stage `key` → EvalConfig `type`: `KEY_TO_TYPE = { mcq: 'MCQ', coding: 'Coding', tara: 'TARA', assignments: 'Assignments' }`.
- The `contests` count is the number of **distinct drives** referencing a config (via `$addToSet` of the drive `_id`).
- Deterministic seed only (no `Math.random`/`Date.now`); the evalConfigId assignment is a static type→config mapping.
- Commit messages end with exactly:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work exclusively in the worktree `/Users/srinivasarao.kandula/code/matchday-driveeval`. Never run `npm run seed` against the shared DB — the seed RUN happens only in Task 4 against an isolated DB.

---

### Task 1: Server — `Drive.evaluation[].evalConfigId` (model + schema + per-stage normalization) (+ test)

**Files:**
- Modify: `server/src/models/Drive.ts`
- Modify: `server/src/modules/drives/drives.schemas.ts`
- Modify: `server/src/modules/drives/drives.service.ts`
- Test: `server/test/drives.service.test.ts`

**Interfaces:**
- Consumes: `EvalConfig` model (ref target, already registered); the existing `normTemplateId`/`normStreamId`/`createDrive`/`updateDrive`.
- Produces: each `Drive.evaluation[]` stage carries `evalConfigId`; `createDrive`/`updateDrive` normalize it per-stage.

- [ ] **Step 1: Add the subdoc field**

In `server/src/models/Drive.ts`, add to `evaluationStageSchema` (the `{ key, enabled, config }` subschema):
```ts
  evalConfigId: { type: Schema.Types.ObjectId, ref: 'EvalConfig', default: null },
```

- [ ] **Step 2: Add the schema field**

In `server/src/modules/drives/drives.schemas.ts`, add to the `evalStage` object:
```ts
export const evalStage = z.object({
  key: z.enum(['mcq', 'coding', 'tara', 'assignments']),
  enabled: z.boolean(),
  config: z.record(z.number()).default({}),
  evalConfigId: z.string().optional(),
});
```

- [ ] **Step 3: Write the failing service test**

Extend `server/test/drives.service.test.ts` (keep existing). Reuse `baseInput()`/imports; add an `EvalConfig` import and a describe:
```ts
import { EvalConfig } from '../src/models/EvalConfig.js';
// ... existing imports (createDrive, updateDrive, Drive, Types)

describe('drives.service — stage evalConfigId link', () => {
  async function cfg(type = 'MCQ') { return EvalConfig.create({ name: 'C', type }); }
  function evalWith(evalConfigId?: string) {
    return [
      { key: 'mcq', enabled: true, config: {}, ...(evalConfigId ? { evalConfigId } : {}) },
      { key: 'coding', enabled: false, config: {} },
      { key: 'tara', enabled: false, config: {} },
      { key: 'assignments', enabled: false, config: {} },
    ];
  }
  it('createDrive persists a stage evalConfigId', async () => {
    const c = await cfg();
    const d = await createDrive({ ...baseInput(), evaluation: evalWith(String(c._id)) } as never, 'Admin');
    const mcq = d.evaluation.find((s) => s.key === 'mcq');
    expect(String(mcq!.evalConfigId)).toBe(String(c._id));
  });
  it('normalizes empty/invalid stage evalConfigId to null', async () => {
    const d1 = await createDrive({ ...baseInput(), evaluation: evalWith('') } as never, 'Admin');
    expect(d1.evaluation.find((s) => s.key === 'mcq')!.evalConfigId).toBeNull();
    const d2 = await createDrive({ ...baseInput(), evaluation: evalWith('not-an-id') } as never, 'Admin');
    expect(d2.evaluation.find((s) => s.key === 'mcq')!.evalConfigId).toBeNull();
  });
  it('updateDrive sets and clears a stage evalConfigId via the evaluation array', async () => {
    const c = await cfg();
    const d = await createDrive({ ...baseInput(), evaluation: evalWith() } as never, 'Admin');
    const set = await updateDrive(String(d._id), { evaluation: evalWith(String(c._id)) } as never);
    expect(String(set.evaluation.find((s) => s.key === 'mcq')!.evalConfigId)).toBe(String(c._id));
    const cleared = await updateDrive(String(d._id), { evaluation: evalWith('') } as never);
    expect(cleared.evaluation.find((s) => s.key === 'mcq')!.evalConfigId).toBeNull();
  });
  it('a patch omitting evaluation preserves existing stage links', async () => {
    const c = await cfg();
    const d = await createDrive({ ...baseInput(), evaluation: evalWith(String(c._id)) } as never, 'Admin');
    const patched = await updateDrive(String(d._id), { name: 'Renamed' } as never);
    expect(String(patched.evaluation.find((s) => s.key === 'mcq')!.evalConfigId)).toBe(String(c._id));
  });
});
```

- [ ] **Step 4: Run — expect FAIL**

Run: `npm test -w server -- drives.service`
Expected: FAIL (evalConfigId not persisted; `''` may throw a Mongoose CastError).

- [ ] **Step 5: Add per-stage normalization in the service**

In `server/src/modules/drives/drives.service.ts`:
- Add helpers next to `normStreamId`:
```ts
function normEvalConfigId(v: unknown): Types.ObjectId | null {
  return typeof v === 'string' && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null;
}
function normEvaluation<T>(stages: T): T {
  if (!Array.isArray(stages)) return stages;
  return stages.map((s) => ({ ...s, evalConfigId: normEvalConfigId((s as { evalConfigId?: unknown }).evalConfigId) })) as unknown as T;
}
```
- In `createDrive`, override the spread `evaluation` with the normalized array:
```ts
export async function createDrive(input: DriveInput, createdBy: string) {
  return Drive.create({
    ...input,
    templateId: normTemplateId(input.templateId),
    streamId: normStreamId(input.streamId),
    evaluation: normEvaluation(input.evaluation),
    createdBy,
  });
}
```
- In `updateDrive`, normalize the evaluation array when present (after the streamId line):
```ts
  if ('evaluation' in p) p.evaluation = normEvaluation(p.evaluation);
```

- [ ] **Step 6: Run — expect PASS + tsc**

Run: `npm test -w server -- drives.service` then `npx -w server tsc --noEmit`
Expected: PASS + clean. Then full `npm test -w server` → all green (additive; nothing breaks).

- [ ] **Step 7: Commit**

```bash
git add server/src/models/Drive.ts server/src/modules/drives/drives.schemas.ts server/src/modules/drives/drives.service.ts server/test/drives.service.test.ts
git commit -m "feat(server): add per-stage Drive.evaluation[].evalConfigId link (normalized)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server — derive `EvalConfig.contests` + remove stored field + seed (+ test)

**Files:**
- Modify: `server/src/models/EvalConfig.ts`
- Modify: `server/src/modules/evalConfigs/service.ts`
- Modify: `server/src/seed/seed.ts`
- Test: `server/test/eval-configs.service.test.ts`

**Interfaces:**
- Consumes: `Drive.evaluation[].evalConfigId` (Task 1). `EvalConfigItem` keeps `contests: number` (now derived).
- Produces: `listEvalConfigs` overlays a derived `contests` count keyed by config id.

- [ ] **Step 1: Write the failing test**

Extend `server/test/eval-configs.service.test.ts` (keep existing; read its top for `createEvalConfig`/`listEvalConfigs` imports + any `input(...)` helper style). Add a `Drive` import and:
```ts
import { Drive } from '../src/models/Drive.js';

describe('eval-configs.service — derived contests', () => {
  async function drive(evalConfigId?: unknown) {
    return Drive.create({
      name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active',
      eventDates: [new Date('2026-07-15')],
      evaluation: [{ key: 'mcq', enabled: true, config: {}, ...(evalConfigId ? { evalConfigId } : {}) }],
    });
  }
  it('contests = count of distinct drives referencing the config (0 when none)', async () => {
    const a = await createEvalConfig({ name: 'Used', type: 'MCQ' } as never);
    const b = await createEvalConfig({ name: 'Unused', type: 'MCQ' } as never);
    await drive(a._id); await drive(a._id); await drive();   // 2 ref a, 1 refs nothing
    const { items } = await listEvalConfigs({});
    const byName = Object.fromEntries(items.map((i) => [i.name, i.contests]));
    expect(byName.Used).toBe(2);
    expect(byName.Unused).toBe(0);
  });
});
```
(Match the file's actual create signature — `createEvalConfig` takes the zod-parsed input; pass a minimal valid object and cast `as never` if the fixture style needs it.)

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -w server -- eval-configs.service`
Expected: FAIL (`contests` not derived — still the stored 0 / undefined).

- [ ] **Step 3: Remove the stored field + drop create/duplicate literals**

- In `server/src/models/EvalConfig.ts`, delete `contests: { type: Number, default: 0 },`.
- In `server/src/modules/evalConfigs/service.ts`, remove `contests: 0,` from the object created in `createEvalConfig` and in `duplicateEvalConfig`.
- In `toItem`, keep `contests: d.contests ?? 0` → change to `contests: 0` (placeholder; `listEvalConfigs` overlays the real value; single-resource callers don't surface it).

- [ ] **Step 4: Derive in `listEvalConfigs`**

In `server/src/modules/evalConfigs/service.ts`:
- Add import: `import { Drive } from '../../models/Drive.js';`
- In `listEvalConfigs`, replace the final `return { items: rows.map((r) => toItem(r as never)) };` with:
```ts
  const items = rows.map((r) => toItem(r as never));
  const agg = await Drive.aggregate([
    { $unwind: '$evaluation' },
    { $match: { 'evaluation.evalConfigId': { $ne: null } } },
    { $group: { _id: '$evaluation.evalConfigId', drives: { $addToSet: '$_id' } } },
    { $project: { n: { $size: '$drives' } } },
  ]);
  const contests = new Map<string, number>(agg.map((r) => [String(r._id), r.n as number]));
  for (const it of items) it.contests = contests.get(it.id) ?? 0;
  return { items };
```

- [ ] **Step 5: Run — expect PASS + tsc**

Run: `npm test -w server -- eval-configs.service` then `npx -w server tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Seed the evalConfigId assignment**

In `server/src/seed/seed.ts`:
- Remove the hardcoded `contests: 8/6/5/0` from each of the 4 `evalConfigDocs`.
- Capture the created configs: change `await EvalConfig.insertMany(evalConfigDocs);` to `const createdEvalConfigs = await EvalConfig.insertMany(evalConfigDocs);`
- After that, assign each seeded drive's ENABLED eval stages the matching-type config, deterministically. The `drives` array holds `HydratedDocument<DriveDoc>`s (created earlier), so mutate + save each:
```ts
  // link each drive's enabled eval stages to the matching-type EvalConfig so `contests` derives real
  const KEY_TO_TYPE: Record<string, string> = { mcq: 'MCQ', coding: 'Coding', tara: 'TARA', assignments: 'Assignments' };
  const cfgByType = new Map(createdEvalConfigs.map((c) => [c.type as string, c._id]));
  for (const d of drives) {
    for (const s of d.evaluation) {
      if (s.enabled && cfgByType.has(KEY_TO_TYPE[s.key])) s.evalConfigId = cfgByType.get(KEY_TO_TYPE[s.key]);
    }
    d.markModified('evaluation');
    await d.save();
  }
```
(Confirm the drive-docs variable is `drives` — the same array the templateId/streamId round-robin loops use. Place this after `EvalConfig.insertMany`. `assignments` stages are seeded `enabled: false`, so that config's `contests` stays 0 — mirroring the prototype's 0.)

- [ ] **Step 7: Type-check + full suite**

Run: `npx -w server tsc --noEmit` (clean), then `npm test -w server` (all green). Do NOT run `npm run seed`.

- [ ] **Step 8: Commit**

```bash
git add server/src/models/EvalConfig.ts server/src/modules/evalConfigs/service.ts server/src/seed/seed.ts server/test/eval-configs.service.test.ts
git commit -m "feat(server): derive EvalConfig.contests from Drive usage (drop stored stat)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Client — `EvaluationStage.evalConfigId` + per-stage picker in StepEvaluation (+ test)

**Files:**
- Modify: `client/src/types/drives.ts`
- Modify: `client/src/pages/Drives/wizard/DriveWizard.tsx`
- Modify: `client/src/pages/Drives/wizard/StepEvaluation.tsx`
- Test: `client/src/test/StepEvaluation.test.tsx`

**Interfaces:**
- Consumes: server stage `evalConfigId` (Task 1) + derived `contests` (Task 2); the existing `useEvalConfigs({ status })` hook (`client/src/pages/Evaluations/hooks/useEvalConfigs.ts`, returns `{ items: EvalConfigItem[] }` each with `type`).
- Produces: `EvaluationStage.evalConfigId?: string`.

- [ ] **Step 1: Type**

In `client/src/types/drives.ts`, add `evalConfigId?: string;` to the `EvaluationStage` interface (alongside `key`/`enabled`/`config`).

- [ ] **Step 2: Wizard model builders**

In `client/src/pages/Drives/wizard/DriveWizard.tsx`:
- `blankDriveModel()`: add `evalConfigId: ''` to each of the four `evaluation` stage literals.
- `mapDocToInput(doc)`: change `evaluation: doc.evaluation` to normalize each stage's id to a string:
```ts
    evaluation: doc.evaluation.map((s) => ({ ...s, evalConfigId: s.evalConfigId ? String(s.evalConfigId) : '' })),
```

- [ ] **Step 3: Write the failing StepEvaluation test**

Extend `client/src/test/StepEvaluation.test.tsx` (it already mocks `useTemplates` via a fetch stub — read the top and match the harness). Make the fetch stub also return eval-configs for `/eval-configs` (an MCQ config), and add:
```tsx
const MCQ_CFG = { id: 'cfg-1', code: 'EVC-1', name: 'Standard MCQ', type: 'MCQ', enabled: true,
  passing: 60, attempts: 2, retake: 'After cooldown', cooldown: 2, validity: 90, autoQual: true,
  threshold: 70, contests: 0, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };
// in the fetch stub: url.includes('/eval-configs') → { items: [MCQ_CFG] }

it('selecting a stage EvalConfig sets that stage.evalConfigId', async () => {
  const onChange = vi.fn();
  renderStep(onChange); // however the file renders StepEvaluation
  const select = await screen.findByLabelText(/MCQ configuration/i);
  await screen.findByRole('option', { name: 'Standard MCQ' }); // wait for async eval-configs fetch
  await userEvent.selectOptions(select, 'cfg-1');
  const call = onChange.mock.calls.find((c) => Array.isArray(c[0].evaluation)
    && c[0].evaluation.find((s: { key: string; evalConfigId?: string }) => s.key === 'mcq')?.evalConfigId === 'cfg-1');
  expect(call).toBeTruthy();
});
```
(Match the file's real `renderStep`/harness + fetch-stub style; the label text must match what Step 5 renders.)

- [ ] **Step 4: Run — expect FAIL**

Run: `npm test -w client -- StepEvaluation`
Expected: FAIL (no per-stage config picker yet).

- [ ] **Step 5: Add the per-stage picker to StepEvaluation**

In `client/src/pages/Drives/wizard/StepEvaluation.tsx`:
- Add imports: `import { useEvalConfigs } from '../../Evaluations/hooks/useEvalConfigs.js';`
- Add a `KEY_TO_TYPE` map near `META`:
```ts
const KEY_TO_TYPE: Record<EvaluationStage['key'], string> = { mcq: 'MCQ', coding: 'Coding', tara: 'TARA', assignments: 'Assignments' };
```
- Inside `StepEvaluation`, add: `const { data: cfgData } = useEvalConfigs({ status: 'Active' });` and `const evalConfigs = cfgData?.items ?? [];`
- Add a setter mirroring `setConfig`:
```ts
  function setStageEvalConfig(key: EvaluationStage['key'], evalConfigId: string) {
    onChange({ evaluation: model.evaluation.map((e) => (e.key === key ? { ...e, evalConfigId } : e)) });
  }
```
- Inside each stage row's `evcfg` block (after the existing `meta.fields` mini-flds), add a config picker mini-fld:
```tsx
                  <div className="mini-fld">
                    <label htmlFor={`evcfg-${meta.key}`}>{meta.title.replace(/ round| AI interview/, '')} configuration</label>
                    <select
                      id={`evcfg-${meta.key}`}
                      className="select"
                      style={{ appearance: 'auto' }}
                      value={stage?.evalConfigId ?? ''}
                      onChange={(e) => setStageEvalConfig(meta.key, e.target.value)}
                    >
                      <option value="">No configuration</option>
                      {evalConfigs.filter((c) => c.type === KEY_TO_TYPE[meta.key]).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
```
(The label text for the MCQ row resolves to "MCQ configuration" — matching the test's `findByLabelText(/MCQ configuration/i)`. Adjust the label expression so each row's label is stable and unique; if the `.replace` is awkward, use a per-meta `cfgLabel` field instead — the test only needs "MCQ configuration" to resolve.)

- [ ] **Step 6: Run — expect PASS + tsc + full client suite**

Run: `npm test -w client -- StepEvaluation` then `npx -w client tsc --noEmit` then `npm test -w client`
Expected: PASS + clean + full suite green. (The existing template-picker test in this file must still pass — don't disturb it.)

- [ ] **Step 7: Commit**

```bash
git add client/src/types/drives.ts client/src/pages/Drives/wizard/DriveWizard.tsx client/src/pages/Drives/wizard/StepEvaluation.tsx client/src/test/StepEvaluation.test.tsx
git commit -m "feat(client): per-stage EvalConfig picker in the drive wizard evaluation step

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full-suite verification + live E2E smoke

**Files:** none (verification only). Controller runs the seed + smoke against an ISOLATED DB.

- [ ] **Step 1: Full suites** — `npm test -w server && npm test -w client`
- [ ] **Step 2: Type-check both + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`
- [ ] **Step 3: Seed + smoke against an isolated DB** (controller): `MONGODB_URI=mongodb://localhost:27017/matchday_driveeval_smoke npm run seed -w server`; start the worktree server on a spare port + that DB; fresh admin token:
  - `GET /api/eval-configs` → each `contests` = the derived count (compare to distinct-drive count per config in the DB via `Drive.evaluation.evalConfigId`); MCQ/Coding/TARA non-zero, Assignments 0 (disabled stage).
  - `POST /api/drives` with an `evaluation` stage carrying an `evalConfigId` → drive persists it; then `GET /api/eval-configs` shows that config's `contests` incremented by 1.
  - Create a drive whose stage has `evalConfigId:''` → stored null; that config's count unchanged.
  - Reconcile: each config's `contests` == distinct drives referencing it in the DB.
  - Stop server, drop `matchday_driveeval_smoke`; confirm the shared `matchday` DB is present and untouched.
- [ ] **Step 4: No commit** (verification task).

---

## Self-Review Notes (author)

- **Spec coverage:** stage `evalConfigId` (model+schema+per-stage normalization) → T1; derived `contests` + remove stored field + seed → T2; client `EvaluationStage.evalConfigId` + wizard picker → T3; E2E → T4.
- **Novel bit vs prior links:** the FK is inside the `evaluation` subdoc array, so normalization maps over the array (`normEvaluation`) rather than a scalar field; applied in create (always) and update (when `'evaluation' in patch`).
- **Record-only:** the picker sets only `stage.evalConfigId`; `enabled`/`config`/template/stream untouched.
- **`contests` semantics:** distinct drives via `$addToSet` — robust even though a config can appear at most once per drive (one stage per type).
- **Seed:** assign matching-type config to ENABLED stages only → MCQ/Coding/TARA get all 12 drives, Assignments stays 0 (disabled), mirroring the prototype's 0; deterministic (static map, no rng). Reuse the `drives` HydratedDocument array; `markModified('evaluation')` before save (subdoc array mutation).
- **Reuse:** `useEvalConfigs` hook already exists — do NOT add a new one.
- **Type consistency:** `EvaluationStage.evalConfigId?: string` (client) ↔ stage `evalConfigId` (server schema/model); `EvalConfigItem.contests: number` unchanged on both sides (now derived).
- **eval-monitor untouched:** it derives its "Contest" list from Jobseeker data, never reads `EvalConfig.contests`.
