# Drive → Template Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `Drive.templateId` link; a Drive-wizard "Start from a template" picker that seeds the drive's evaluation stages from the template + records the link; and derive `DriveTemplate.usedBy` from real drive usage (deleting the stored fake).

**Architecture:** `Drive` gains a nullable `templateId` ref; `drives.service` normalizes/persists it; `templates.service` derives `usedBy` from a `Drive` aggregation (stored field removed from model + seed); the wizard's `StepEvaluation` gains a template `<select>` that maps `template.sections.assessment` → the drive's four eval toggles. No new collection. Command Center untouched.

**Isolation:** Runs in an isolated git worktree at `/Users/srinivasarao.kandula/code/matchday-drivetpl` (branch `feat/drive-template-link`, off `origin/main`). The user works in parallel in the main checkout — do NOT touch it, do NOT `git checkout`/`switch`/`branch`. node_modules symlinked. `git commit` in the worktree. Do NOT run `npm run seed` (shared DB) — verify seed edits with `tsc`; the controller runs the seed against an isolated DB in the E2E task.

## Global Constraints

- Error contract `{error:{message,code}}`; ESM (.js); strict TS; `tsc --noEmit` MUST pass each task.
- **`templateId` normalization:** the client sends `''` when no template; the service normalizes `'' | invalid | undefined` → `null`, a valid ObjectId → itself. Never pass `''` to Mongoose for an ObjectId path (it throws on cast).
- **`usedBy` is derived-on-read**, never stored — removed from the `DriveTemplate` model, the create/clone literals, and the seed. Derived in `listTemplates` via one `Drive` aggregation (mirrors the Institute `assignedDrives` / Employer `activeDrives` pattern).
- **Apply-seeds-eval:** picking a template sets `templateId` AND overwrites each eval stage's `enabled` from `template.sections.assessment[key]`; stage `config` is preserved. One-way at pick time (later manual toggles win).
- **CC untouched.** No new CSS.

## File Structure

```
server/src/
  models/Drive.ts                                 # T1 + templateId
  modules/drives/drives.schemas.ts                # T1 + templateId (create; partial/draft inherit)
  modules/drives/drives.service.ts                # T1 normalize + persist templateId
  models/DriveTemplate.ts                          # T2 - usedBy field
  modules/templates/templates.service.ts           # T2 derive usedBy; drop usedBy:0 literals
  seed/seed.ts                                     # T2 drop usedBy seed; assign templateId to drives
server/test/
  drives.service.test.ts                           # T1 templateId round-trip
  templates.service.test.ts                        # T2 derived usedBy
client/src/
  types/drives.ts                                  # T3 + templateId on DriveInput
  pages/Drives/wizard/DriveWizard.tsx              # T3 blankDriveModel + mapDocToInput
  pages/Drives/wizard/StepEvaluation.tsx           # T3 template picker + apply
client/src/test/
  StepEvaluation.test.tsx                          # T3 picker sets templateId + seeds eval
```

---

## Task 1: Server — `Drive.templateId` (model + schema + service) (+ test)

**Files:** Modify `server/src/models/Drive.ts`, `drives.schemas.ts`, `drives.service.ts`; Test `server/test/drives.service.test.ts`.

- [ ] **Step 1: Model** — in `server/src/models/Drive.ts`, add to the schema (after `evaluation`):
```ts
  templateId: { type: Schema.Types.ObjectId, ref: 'DriveTemplate', default: null },
```
(Ensure `Schema` is imported — it is.)

- [ ] **Step 2: Schema** — in `server/src/modules/drives/drives.schemas.ts`, add to `createDriveSchema`'s object (any position, e.g. after `evaluation`):
```ts
  templateId: z.string().optional(),
```
(`updateDriveSchema = createDriveSchema.partial()` and `draftDriveSchema = createDriveSchema.extend({...})` inherit it automatically. Client sends `''` for none; the service normalizes.)

- [ ] **Step 3: Service normalize + persist** — in `server/src/modules/drives/drives.service.ts`:
  - Add a helper near the top:
    ```ts
    function normTemplateId(v: unknown): Types.ObjectId | null {
      return typeof v === 'string' && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null;
    }
    ```
  - `createDrive`: change to normalize:
    ```ts
    export async function createDrive(input: DriveInput, createdBy: string) {
      return Drive.create({ ...input, templateId: normTemplateId((input as { templateId?: unknown }).templateId), createdBy });
    }
    ```
  - `updateDrive`: normalize `templateId` in the patch only when the key is present (so a patch that omits it doesn't null an existing link):
    ```ts
    export async function updateDrive(id: string, patch: Partial<DriveInput> & { status?: string }) {
      assertObjectId(id);
      const p: Record<string, unknown> = { ...patch };
      if ('templateId' in p) p.templateId = normTemplateId(p.templateId);
      const d = await Drive.findByIdAndUpdate(id, p, { new: true, runValidators: true });
      if (!d) throw new HttpError(404, 'Drive not found', 'not_found');
      return d;
    }
    ```
  (`getDrive` already returns the raw doc, so it now includes `templateId` — the wizard's edit prefill reads it. No `DriveListItem` change needed.)

- [ ] **Step 4: Failing test** — extend `server/test/drives.service.test.ts` (keep existing tests). Add `DriveTemplate` import and:
```ts
import { DriveTemplate } from '../src/models/DriveTemplate.js';
// (createDrive, getDrive, updateDrive already imported by the suite)

describe('drives.service — templateId link', () => {
  const baseInput = () => ({
    name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', status: 'Active' as const, candType: 'Freshers' as const,
    mode: 'Hybrid' as const, frequency: 'One-time' as const, eventDay: 'Wednesday' as const,
    eventDates: [new Date('2026-07-15T00:00:00.000Z')], candCap: 100, empCap: 5, slotCap: 20,
    eligibility: { sources: ['Institutes'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    evaluation: [{ key: 'mcq' as const, enabled: true, config: {} }],
    visibility: { employerReg: 'Invite-only' as const, instituteVis: 'Selected institutes' as const, candidateAccess: 'Eligible only' as const },
  });
  async function tpl() {
    return DriveTemplate.create({ name: 'Data Analyst', domain: 'Data / Analytics', status: 'Active', sections: { assessment: { mcq: true, coding: true, tara: true, assignments: false }, weightage: {}, matching: {}, kanban: ['Applied'], notifications: [], privacy: {} }, version: '1.0', versions: [] });
  }

  it('persists a templateId on create and returns it', async () => {
    const t = await tpl();
    const d = await createDrive({ ...baseInput(), templateId: String(t._id) } as never, 'Admin');
    expect(String(d.templateId)).toBe(String(t._id));
  });
  it('normalizes empty/invalid templateId to null', async () => {
    const d1 = await createDrive({ ...baseInput(), templateId: '' } as never, 'Admin');
    expect(d1.templateId).toBeNull();
    const d2 = await createDrive({ ...baseInput(), templateId: 'not-an-id' } as never, 'Admin');
    expect(d2.templateId).toBeNull();
  });
  it('update sets and clears templateId', async () => {
    const t = await tpl();
    const d = await createDrive(baseInput() as never, 'Admin');
    const set = await updateDrive(String(d._id), { templateId: String(t._id) } as never);
    expect(String(set.templateId)).toBe(String(t._id));
    const cleared = await updateDrive(String(d._id), { templateId: '' } as never);
    expect(cleared.templateId).toBeNull();
  });
});
```

- [ ] **Step 5: Run — RED then GREEN** — `npm test -w server -- drives.service` (from the worktree). Then `npx -w server tsc --noEmit`.
- [ ] **Step 6: Commit** (worktree)

```bash
git add server/src/models/Drive.ts server/src/modules/drives/drives.schemas.ts server/src/modules/drives/drives.service.ts server/test/drives.service.test.ts
git commit -m "feat(server): add Drive.templateId link (normalized, persisted)"
```

---

## Task 2: Server — derive `DriveTemplate.usedBy` from drives; remove stored field + seed (+ test)

**Files:** Modify `server/src/models/DriveTemplate.ts`, `server/src/modules/templates/templates.service.ts`, `server/src/seed/seed.ts`; Test `server/test/templates.service.test.ts`.

- [ ] **Step 1: Failing test** — extend `server/test/templates.service.test.ts` (keep existing; but NOTE: existing tests may assert `usedBy` on create/clone — see Step 5). Add `Drive` import and:
```ts
import { Drive } from '../src/models/Drive.js';

describe('templates.service — derived usedBy', () => {
  async function drive(templateId?: unknown) {
    return Drive.create({ name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15')], evaluation: [{ key: 'mcq', enabled: true, config: {} }], ...(templateId ? { templateId } : {}) });
  }
  it('usedBy = count of drives referencing the template (0 when none)', async () => {
    const a = await createTemplate(input({ name: 'Used' }));
    const b = await createTemplate(input({ name: 'Unused' }));
    await drive(a._id); await drive(a._id); await drive();   // 2 ref a, 1 refs nothing
    const { items } = await listTemplates({});
    const byName = Object.fromEntries(items.map((i) => [i.name, i.usedBy]));
    expect(byName.Used).toBe(2);
    expect(byName.Unused).toBe(0);
  });
});
```
(Reuse the file's existing `input(...)` helper + `createTemplate`/`listTemplates` imports.)

- [ ] **Step 2: Run — expect FAIL** — `npm test -w server -- templates.service`.

- [ ] **Step 3: Derive in the service** — in `server/src/modules/templates/templates.service.ts`:
  - Add import: `import { Drive } from '../../models/Drive.js';`
  - In `listTemplates`, after building `items` from `rows.map(toItem)`, derive + overlay:
    ```ts
    const items = rows.map((r) => toItem(r as never));
    const usedAgg = await Drive.aggregate([
      { $match: { templateId: { $ne: null } } },
      { $group: { _id: '$templateId', n: { $sum: 1 } } },
    ]);
    const usedBy = new Map<string, number>(usedAgg.map((r) => [String(r._id), r.n as number]));
    for (const it of items) it.usedBy = usedBy.get(it.id) ?? 0;
    return { items };
    ```
    (Adjust to the current structure of `listTemplates` — it currently does `return { items: rows.map((r) => toItem(r as never)) };`; split into the `const items` form above.)

- [ ] **Step 4: Remove the stored field** — in `server/src/models/DriveTemplate.ts`, delete the `usedBy: { type: Number, default: 0 },` line.

- [ ] **Step 5: Drop the `usedBy` literals** — in `templates.service.ts`:
  - `toItem`: change `usedBy: d.usedBy ?? 0` → `usedBy: 0` (a placeholder; `listTemplates` overlays the real value. Non-list callers don't surface `usedBy`.)
  - `createTemplate` + `cloneTemplate`: remove `usedBy: 0,` from the created objects (the field no longer exists on the model).
  - If any existing test asserts `usedBy` on the return of `createTemplate`/`cloneTemplate` (raw doc), update it (those docs no longer carry `usedBy`; the clone test that asserted "usedBy stays 0" should assert via `listTemplates` instead, or drop that line). Keep other assertions.

- [ ] **Step 6: Seed** — in `server/src/seed/seed.ts`:
  - Remove the hardcoded `usedBy: <n>,` from each of the 5 template objects.
  - After BOTH the drives and the templates are created (find the template `insertMany`/create that returns the template docs, and the drives array), assign `templateId` across the seeded drives deterministically so `usedBy` derives non-zero. E.g.:
    ```ts
    // assign each seeded drive a template (round-robin) so template usedBy derives to real counts
    for (let i = 0; i < drives.length; i++) {
      await Drive.updateOne({ _id: drives[i]._id }, { $set: { templateId: templateDocs[i % templateDocs.length]._id } });
    }
    ```
    (Use the actual variable names from `seed.ts` — the drives collection variable and the created-templates variable. If templates are inserted via `insertMany`, capture the returned docs. Templates are created later in the file than drives, so place this assignment loop after the template insert.)

- [ ] **Step 7: Run — GREEN + tsc** — `npm test -w server -- templates.service && npx -w server tsc --noEmit`. Do NOT run `npm run seed`.
- [ ] **Step 8: Full server suite** — `npm test -w server`.
- [ ] **Step 9: Commit**

```bash
git add server/src/models/DriveTemplate.ts server/src/modules/templates/templates.service.ts server/src/seed/seed.ts server/test/templates.service.test.ts
git commit -m "feat(server): derive DriveTemplate.usedBy from drive usage (drop stored stat)"
```

---

## Task 3: Client — DriveInput `templateId` + wizard template picker (apply-seeds-eval) (+ test)

**Files:** Modify `client/src/types/drives.ts`, `client/src/pages/Drives/wizard/DriveWizard.tsx`, `client/src/pages/Drives/wizard/StepEvaluation.tsx`; Test `client/src/test/StepEvaluation.test.tsx`.

- [ ] **Step 1: Type** — in `client/src/types/drives.ts`, add to `DriveInput`: `templateId?: string;` (a string id, or `''`/absent for none).

- [ ] **Step 2: Wizard model** — in `client/src/pages/Drives/wizard/DriveWizard.tsx`:
  - `blankDriveModel()`: add `templateId: ''` to the returned object.
  - `mapDocToInput(doc)`: add `templateId: doc.templateId ? String(doc.templateId) : ''` (so edit pre-selects the drive's template). (`DriveDocResponse extends DriveInput`, so `doc.templateId` is available; cast/String it since it serializes as a string.)

- [ ] **Step 3: Failing test** — `client/src/test/StepEvaluation.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { StepEvaluation } from '../pages/Drives/wizard/StepEvaluation.js';
import { blankDriveModel } from '../pages/Drives/wizard/DriveWizard.js';
import type { DriveInput } from '../types/drives.js';

const TEMPLATE = {
  id: 'tpl-1', code: 'TPL-1', name: 'Data Analyst', domain: 'Data / Analytics', status: 'Active', usedBy: 0,
  sections: { assessment: { mcq: true, coding: false, tara: true, assignments: true }, weightage: {}, matching: {}, kanban: [], notifications: [], privacy: {} },
  version: '1.0', versions: [], createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};

function renderStep(onChange: (p: Partial<DriveInput>) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><AuthProvider>
      <StepEvaluation model={blankDriveModel()} onChange={onChange} errors={[]} />
    </AuthProvider></QueryClientProvider>,
  );
}

describe('StepEvaluation — template picker', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/templates')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [TEMPLATE] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('selecting a template sets templateId and seeds the eval toggles from sections.assessment', async () => {
    const onChange = vi.fn();
    renderStep(onChange);
    const user = userEvent.setup();
    const select = await screen.findByLabelText(/Start from a template/i);
    await user.selectOptions(select, 'tpl-1');
    // onChange fired with templateId + an evaluation array matching the template's assessment
    const call = onChange.mock.calls.find((c) => c[0].templateId === 'tpl-1');
    expect(call).toBeTruthy();
    const evalPatch = call![0].evaluation as { key: string; enabled: boolean }[];
    const byKey = Object.fromEntries(evalPatch.map((e) => [e.key, e.enabled]));
    expect(byKey).toEqual({ mcq: true, coding: false, tara: true, assignments: true });
  });
});
```

- [ ] **Step 4: Run — expect FAIL**.

- [ ] **Step 5: The picker** — in `client/src/pages/Drives/wizard/StepEvaluation.tsx`:
  - Import: `import { useTemplates } from '../../Templates/hooks/useTemplates.js';`
  - Inside `StepEvaluation`, add: `const { data: tplData } = useTemplates({ status: 'Active' });` and `const templates = tplData?.items ?? [];`
  - Add a picker block at the top of the returned JSX (right after the `<div className="wh">…</div>`, before `<div id="w-eval">`):
    ```tsx
    <div className="wfld full" style={{ marginBottom: 12 }}>
      <label htmlFor="tplPick">Start from a template</label>
      <select
        id="tplPick"
        className="select"
        style={{ appearance: 'auto' }}
        value={model.templateId ?? ''}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) { onChange({ templateId: '' }); return; }
          const t = templates.find((x) => x.id === id);
          if (!t) { onChange({ templateId: id }); return; }
          const a = t.sections.assessment;
          onChange({
            templateId: id,
            evaluation: model.evaluation.map((s) => ({ ...s, enabled: !!a[s.key as keyof typeof a] })),
          });
        }}
      >
        <option value="">No template</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <span className="fnote" style={{ fontSize: 11.5, color: 'var(--faint)' }}>Applying a template pre-fills the evaluation stages below.</span>
    </div>
    ```
  (`t.sections.assessment` keys are `mcq/coding/tara/assignments`, matching the eval stage `key`s — the map sets each stage's `enabled` from the template. Existing `config` is preserved via `...s`.)

- [ ] **Step 6: Run — GREEN + tsc** — `npm test -w client -- StepEvaluation && npx -w client tsc --noEmit`.
- [ ] **Step 7: Full client suite** — `npm test -w client`.
- [ ] **Step 8: Commit**

```bash
git add client/src/types/drives.ts client/src/pages/Drives/wizard/DriveWizard.tsx client/src/pages/Drives/wizard/StepEvaluation.tsx client/src/test/StepEvaluation.test.tsx
git commit -m "feat(client): Drive wizard 'Start from a template' picker (applies eval + links)"
```

---

## Task 4: Full-suite verification + live E2E smoke

**Files:** none (verification only). Controller runs the seed + smoke against an ISOLATED DB.

- [ ] **Step 1: Full suites** (worktree) — `npm test -w server && npm test -w client`.
- [ ] **Step 2: Type-check both + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Seed + smoke against an isolated DB** (controller): `MONGODB_URI=mongodb://localhost:27017/matchday_drivetpl_smoke npm run seed -w server` (verifies the seed runs clean without the removed `usedBy` and with the templateId assignment); start the worktree server on a spare port + that DB; fresh admin token:
  - `GET /api/templates` → each `usedBy` = the derived drive count (compare to `Drive.countDocuments({templateId})` in the DB); non-zero for templates with assigned drives.
  - `POST /api/drives` with a `templateId` → drive persists it; then `GET /api/templates` shows that template's `usedBy` incremented by 1.
  - Create a drive without a template / with `templateId:''` → stored null; that template's count unchanged.
  - Confirm no `usedBy` field persists on template docs.
  - Stop server, drop `matchday_drivetpl_smoke`.
- [ ] **Step 4: No commit** (verification task).

---

## Self-Review Notes (author)

- **Spec coverage:** `Drive.templateId` → T1; wizard picker + apply-seeds-eval → T3; derived `usedBy` (stored field + seed removed) → T2; seed assigns templateId → T2; E2E → T4.
- **`templateId` normalization** (`'' | invalid → null`) is in the service (both create and update), so Mongoose never gets `''` for an ObjectId path. Update only normalizes when the key is present (a patch omitting `templateId` won't null an existing link).
- **Edit prefill:** the wizard fetches the drive via `getDrive` (raw doc), which now includes `templateId`; `mapDocToInput` maps it → the picker pre-selects. No `DriveListItem` change (the table doesn't show it — YAGNI).
- **Derived usedBy** overlays the real count in `listTemplates`; `toItem`'s `usedBy` is a placeholder `0`; `getTemplate` (single) returns the raw doc whose `usedBy` is gone — unconsumed by the client for that field (cards use the list). Consistent with the derived-never-stored principle.
- **Apply is one-way at pick time** (later manual toggles win); `templateId` drives `usedBy` regardless of subsequent toggle edits.
- **Existing-test note (T2 Step 5):** the templates suite may assert `usedBy` on `createTemplate`/`cloneTemplate` raw-doc returns; those assertions must be updated (the field is gone) — keep the rest.
- **Type note:** `t.sections.assessment[s.key as keyof typeof a]` — the eval stage keys (`mcq/coding/tara/assignments`) exactly match the assessment keys, so the cast is safe; `!!` coerces to boolean.
