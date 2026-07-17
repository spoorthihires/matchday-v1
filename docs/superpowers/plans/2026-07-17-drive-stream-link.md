# Drive → Stream link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `Drive.streamId` FK to the `Stream` eval-config profile (picked in the drive wizard, record-only) and a new derived "Drives" usage count on the Streams table — leaving the existing `Drive.stream` degree field untouched.

**Architecture:** Additive nullable `Drive.streamId` (ObjectId → Stream) normalized in the drives service exactly like the existing `templateId`. `Stream`'s usage count is derived-on-read in `listStreams` via one aggregation over `Drive.streamId` (no stored stat existed). Client: a new "Stream profile" `<select>` in the wizard's StepBasics (from the existing `useStreams` hook) and a new "Drives" column in StreamTable.

**Tech Stack:** Express 4 + Mongoose 8 + zod (server, TS strict, ESM `.js` suffixes); React 18 + Vite + react-router-dom 6 + @tanstack/react-query 5 (client); vitest + mongodb-memory-server (tests).

## Global Constraints

- TS strict; ESM with explicit `.js` import suffixes; `npx -w server tsc --noEmit` AND `npx -w client tsc --noEmit` must stay clean.
- Error contract `{ error: { message, code } }`; zod → 400 via the central `errorHandler`; not-found → 404. `HttpError` from `../../middleware/errorHandler.js`.
- **Derived, never stored:** the Stream usage count is computed on every `listStreams` read; no stored field is added to the `Stream` model. Consistent with Institute `assignedDrives`, Employer `activeDrives`, Template `usedBy`, Slot booked/held.
- **`Drive.streamId`** — nullable ObjectId ref to `Stream`, normalized: `''`/invalid/absent → `null`; `updateDrive` normalizes ONLY when `'streamId' in patch` (an omitting patch must not null an existing link) — the exact contract already used for `templateId`.
- **Record-only:** picking a stream stores `streamId` and nothing else — no auto-fill of eligibility/eval; the degree field (`Drive.stream`), its table column, filter, sort, and CSV are untouched.
- Deterministic seed only: no `Math.random()`/`Date.now()`/argless `new Date()` in seed booking logic — use the existing seeded helpers; the streamId round-robin is index-modulo.
- The new derived field is named **`drives`** (a count) on both the server `StreamItem` and the client `StreamItem`.
- Commit messages end with exactly:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work exclusively in the worktree `/Users/srinivasarao.kandula/code/matchday-drivestream`. Never run `npm run seed` against the shared DB — the seed RUN happens only in Task 4 against an isolated DB.

---

### Task 1: Server — `Drive.streamId` (model + schema + service normalization) (+ test)

**Files:**
- Modify: `server/src/models/Drive.ts`
- Modify: `server/src/modules/drives/drives.schemas.ts`
- Modify: `server/src/modules/drives/drives.service.ts`
- Test: `server/test/drives.service.test.ts`

**Interfaces:**
- Consumes: `Stream` model (ref target, already registered), the existing `normTemplateId`/`createDrive`/`updateDrive`.
- Produces: `Drive.streamId` persisted; `createDrive`/`updateDrive` normalize it via a new `normStreamId`.

- [ ] **Step 1: Add the model field**

In `server/src/models/Drive.ts`, add after the `templateId` line:
```ts
  streamId: { type: Schema.Types.ObjectId, ref: 'Stream', default: null },
```

- [ ] **Step 2: Add the schema field**

In `server/src/modules/drives/drives.schemas.ts`, add to `createDriveSchema` (alongside `templateId: z.string().optional()`):
```ts
  streamId: z.string().optional(),
```
(`draftDriveSchema.extend(...)` and `updateDriveSchema = createDriveSchema.partial()` inherit it automatically.)

- [ ] **Step 3: Write the failing service test**

Extend `server/test/drives.service.test.ts` (keep existing tests). Reuse the file's existing `baseInput()`/imports; add a `Stream` import and a new describe:
```ts
import { Stream } from '../src/models/Stream.js';
// ... existing imports (createDrive, updateDrive, getDrive, Drive, Types)

describe('drives.service — streamId link', () => {
  async function stream() {
    return Stream.create({ name: 'Frontend', parent: 'Engineering', flow: ['MCQ', 'Coding'] });
  }
  it('createDrive persists a valid streamId', async () => {
    const s = await stream();
    const d = await createDrive({ ...baseInput(), streamId: String(s._id) } as never, 'Admin');
    expect(String(d.streamId)).toBe(String(s._id));
  });
  it('normalizes empty/invalid streamId to null on create', async () => {
    const d1 = await createDrive({ ...baseInput(), streamId: '' } as never, 'Admin');
    expect(d1.streamId).toBeNull();
    const d2 = await createDrive({ ...baseInput(), streamId: 'not-an-id' } as never, 'Admin');
    expect(d2.streamId).toBeNull();
  });
  it('updateDrive sets and clears streamId', async () => {
    const s = await stream();
    const d = await createDrive({ ...baseInput() } as never, 'Admin');
    const set = await updateDrive(String(d._id), { streamId: String(s._id) } as never);
    expect(String(set.streamId)).toBe(String(s._id));
    const cleared = await updateDrive(String(d._id), { streamId: '' } as never);
    expect(cleared.streamId).toBeNull();
  });
  it('a patch omitting streamId preserves an existing link', async () => {
    const s = await stream();
    const d = await createDrive({ ...baseInput(), streamId: String(s._id) } as never, 'Admin');
    const patched = await updateDrive(String(d._id), { name: 'Renamed' } as never);
    expect(String(patched.streamId)).toBe(String(s._id));
  });
});
```
(If the file has no `baseInput()` helper, use the existing fixture the other tests use — read the top of the file and match its style.)

- [ ] **Step 4: Run — expect FAIL**

Run: `npm test -w server -- drives.service`
Expected: FAIL (streamId not persisted / normalized yet).

- [ ] **Step 5: Add the service normalization**

In `server/src/modules/drives/drives.service.ts`:
- Add the helper next to `normTemplateId`:
```ts
function normStreamId(v: unknown): Types.ObjectId | null {
  return typeof v === 'string' && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null;
}
```
- In `createDrive`, add `streamId` to the created object (after `templateId`):
```ts
export async function createDrive(input: DriveInput, createdBy: string) {
  return Drive.create({ ...input, templateId: normTemplateId(input.templateId), streamId: normStreamId(input.streamId), createdBy });
}
```
- In `updateDrive`, normalize when present (after the templateId line):
```ts
  if ('streamId' in p) p.streamId = normStreamId(p.streamId);
```
(`DriveInput` gains `streamId?: string` from the schema, so `input.streamId` is typed — no cast needed.)

- [ ] **Step 6: Run — expect PASS + tsc**

Run: `npm test -w server -- drives.service` then `npx -w server tsc --noEmit`
Expected: PASS + clean. Then full `npm test -w server` → all green (additive; nothing should break).

- [ ] **Step 7: Commit**

```bash
git add server/src/models/Drive.ts server/src/modules/drives/drives.schemas.ts server/src/modules/drives/drives.service.ts server/test/drives.service.test.ts
git commit -m "feat(server): add Drive.streamId link (normalized, persisted)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server — derive `Stream.drives` count + seed streamId (+ test)

**Files:**
- Modify: `server/src/modules/streams/service.ts`
- Modify: `server/src/seed/seed.ts`
- Test: `server/test/streams.service.test.ts`

**Interfaces:**
- Consumes: `Drive.streamId` (Task 1). `StreamItem` gains `drives: number`.
- Produces: `listStreams` overlays a derived `drives` count keyed by stream id.

- [ ] **Step 1: Write the failing test**

Extend `server/test/streams.service.test.ts` (keep existing; read the top for its `input(...)`/imports style). Add a `Drive` import and:
```ts
import { Drive } from '../src/models/Drive.js';

describe('streams.service — derived drives count', () => {
  async function drive(streamId?: unknown) {
    return Drive.create({
      name: 'D', domain: 'Web', stream: 'B.Tech', status: 'Active',
      eventDates: [new Date('2026-07-15')],
      evaluation: [{ key: 'mcq', enabled: true, config: {} }],
      ...(streamId ? { streamId } : {}),
    });
  }
  it('drives = count of drives referencing the stream (0 when none)', async () => {
    const a = await createStream(input({ name: 'Used' }));
    const b = await createStream(input({ name: 'Unused' }));
    await drive(a._id); await drive(a._id); await drive();   // 2 ref a, 1 refs nothing
    const { items } = await listStreams({});
    const byName = Object.fromEntries(items.map((i) => [i.name, i.drives]));
    expect(byName.Used).toBe(2);
    expect(byName.Unused).toBe(0);
  });
});
```
(Reuse the file's existing `input(...)` helper + `createStream`/`listStreams` imports.)

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -w server -- streams.service`
Expected: FAIL (`drives` undefined / not derived).

- [ ] **Step 3: Add `drives` to `StreamItem` + `toItem`**

In `server/src/modules/streams/service.ts`:
- Add `drives: number;` to the `StreamItem` interface (e.g. after `status: string;`).
- In `toItem`, add a placeholder `drives: 0,` (the list overlays the real value; single-resource callers don't surface it).

- [ ] **Step 4: Derive in `listStreams`**

In `server/src/modules/streams/service.ts`:
- Add import: `import { Drive } from '../../models/Drive.js';`
- In `listStreams`, replace the final `return { items: rows.map((r) => toItem(r as never)) };` with:
```ts
  const items = rows.map((r) => toItem(r as never));
  const usedAgg = await Drive.aggregate([
    { $match: { streamId: { $ne: null } } },
    { $group: { _id: '$streamId', n: { $sum: 1 } } },
  ]);
  const usedBy = new Map<string, number>(usedAgg.map((r) => [String(r._id), r.n as number]));
  for (const it of items) it.drives = usedBy.get(it.id) ?? 0;
  return { items };
```

- [ ] **Step 5: Run — expect PASS + tsc**

Run: `npm test -w server -- streams.service` then `npx -w server tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Seed streamId round-robin**

In `server/src/seed/seed.ts`:
- Capture the created streams: change `await Stream.insertMany(streamDocs);` to `const createdStreams = await Stream.insertMany(streamDocs);`
- After that line, assign `streamId` round-robin across the seeded drives (the seed already has a `drives` array of created drive docs — the same one the templateId round-robin loop uses; confirm the variable name by reading the templateId loop). Add:
```ts
  // assign each seeded drive a stream profile (round-robin) so stream `drives` derives to real counts
  for (let i = 0; i < drives.length; i++) {
    await Drive.updateOne({ _id: drives[i]._id }, { $set: { streamId: createdStreams[i % createdStreams.length]._id } });
  }
```
(Use the ACTUAL drive-docs variable name from the existing templateId assignment loop. If streams are created AFTER that loop, place this new loop right after the `Stream.insertMany`. Do NOT run `npm run seed`.)

- [ ] **Step 7: Type-check**

Run: `npx -w server tsc --noEmit` (expect clean), then full `npm test -w server` (expect all green).

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/streams/service.ts server/src/seed/seed.ts server/test/streams.service.test.ts
git commit -m "feat(server): derive Stream 'drives' usage count from Drive.streamId

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Client — DriveInput streamId + wizard picker + StreamTable Drives column (+ tests)

**Files:**
- Modify: `client/src/types/drives.ts`
- Modify: `client/src/pages/Drives/wizard/DriveWizard.tsx`
- Modify: `client/src/pages/Drives/wizard/StepBasics.tsx`
- Modify: `client/src/types/streams.ts`
- Modify: `client/src/pages/Streams/StreamTable.tsx`
- Test: `client/src/test/StepBasics.test.tsx`
- Test: `client/src/test/StreamTable.test.tsx`

**Interfaces:**
- Consumes: server `streamId` (Task 1) + `drives` count (Task 2); the existing `useStreams({ status })` hook (returns `{ items: StreamItem[] }`, each with `id`/`name`/`flow`).
- Produces: `DriveInput.streamId?: string`; client `StreamItem.drives: number`.

- [ ] **Step 1: Types**

- In `client/src/types/drives.ts`, add to `DriveInput` (alongside `templateId?: string`): `streamId?: string;`
- In `client/src/types/streams.ts`, add `drives: number;` to `StreamItem` (e.g. after `status: 'Active' | 'Disabled';`).

- [ ] **Step 2: Wizard model builders**

In `client/src/pages/Drives/wizard/DriveWizard.tsx`:
- `mapDocToInput(doc)`: add `streamId: doc.streamId ? String(doc.streamId) : '',` (next to the `templateId` line).
- `blankDriveModel()`: add `streamId: '',` to the returned object.

- [ ] **Step 3: Write the failing StepBasics test**

Create/extend `client/src/test/StepBasics.test.tsx`. Inspect an existing wizard-step client test first for the render harness + fetch-stub mocking (there is NO `vi.mock` in this repo — use `vi.stubGlobal('fetch', ...)`):

Run: `sed -n '1,55p' client/src/test/StepEvaluation.test.tsx`

Then, copying that harness (QueryClientProvider + AuthProvider + `localStorage` auth seed + fetch stub returning `{ items: [STREAM] }` for `/streams`), assert selecting a stream profile calls `onChange` with `streamId`:
```tsx
const STREAM = { id: 'str-1', code: 'STR-1', name: 'Frontend Engineering', parent: 'Engineering', label: '',
  skills: [], good: [], flow: ['MCQ', 'Coding', 'TARA'], cutoff: 65, cgpa: 6.5, backlogs: 1,
  grad: [], branches: [], sources: [], status: 'Active', version: '1.0', versions: [], drives: 0,
  createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };

it('selecting a stream profile sets streamId on the model', async () => {
  const onChange = vi.fn();
  // render <StepBasics model={blankDriveModel()} onChange={onChange} errors={[]} /> inside providers
  const select = await screen.findByLabelText(/Stream profile/i);
  await screen.findByRole('option', { name: 'Frontend Engineering' }); // wait for async streams fetch
  await userEvent.selectOptions(select, 'str-1');
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ streamId: 'str-1' }));
});
```
(Match the exact provider/mocking style of the existing test; `blankDriveModel` is exported from `../pages/Drives/wizard/DriveWizard.js`.)

- [ ] **Step 4: Run — expect FAIL**

Run: `npm test -w client -- StepBasics`
Expected: FAIL (no "Stream profile" control yet).

- [ ] **Step 5: Add the picker to StepBasics**

In `client/src/pages/Drives/wizard/StepBasics.tsx`:
- Add imports: `import { useStreams } from '../../Streams/hooks/useStreams.js';`
- Inside `StepBasics`, add: `const { data: streamData } = useStreams({ status: 'Active' });` and `const streams = streamData?.items ?? [];` and `const picked = streams.find((s) => s.id === model.streamId);`
- Add a new `.wfld full` block after the `.wgrid` (Domain/Stream) div, before the Candidate-type block:
```tsx
      <div className="wfld full">
        <label htmlFor="wStreamProfile">Stream profile</label>
        <select
          id="wStreamProfile"
          className="select"
          style={{ appearance: 'auto' }}
          value={model.streamId ?? ''}
          onChange={(e) => onChange({ streamId: e.target.value })}
        >
          <option value="">No stream profile</option>
          {streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="fnote" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
          {picked ? `Evaluation flow: ${picked.flow.join(' → ')}` : 'Classifies the drive under a reusable stream profile.'}
        </span>
      </div>
```
(`htmlFor="wStreamProfile"`/`id` wire the label so the test's `findByLabelText(/Stream profile/i)` resolves.)

- [ ] **Step 6: Write the failing StreamTable test**

Create `client/src/test/StreamTable.test.tsx`. Inspect an existing plain-component client test for its render style:

Run: `sed -n '1,40p' client/src/test/DrivesTable.test.tsx`

Then render `StreamTable` with one item carrying `drives: 7` and assert the count renders:
```tsx
it('renders the derived Drives count column', () => {
  const item = { /* full StreamItem with drives: 7, flow: [], skills: [], branches: [], etc. */ };
  render(<StreamTable items={[item]} sort="name" order="asc" onSort={() => {}} onAction={() => {}} />);
  expect(screen.getByText('7')).toBeTruthy();
  expect(screen.getByText('Drives')).toBeTruthy(); // the column header
});
```
(Build the `item` from the `StreamItem` type with all required fields; `StreamTable` renders no providers so a plain `render` suffices — match `DrivesTable.test.tsx`.)

- [ ] **Step 7: Run — expect FAIL**

Run: `npm test -w client -- StreamTable`
Expected: FAIL (no Drives column).

- [ ] **Step 8: Add the Drives column to StreamTable**

In `client/src/pages/Streams/StreamTable.tsx`:
- Add a `<th>Drives</th>` header among the non-sortable headers (e.g. after `<th>Version</th>` or before `<th>Status</th>` — pick a sensible position):
```tsx
              <th>Skills Required</th><th>Evaluation Flow</th><th>Branches</th><th>Employer Label</th><th>Version</th><th>Drives</th><th>Status</th><th className="r">Actions</th>
```
- Add the matching cell in the row (in the same position, after the Version cell):
```tsx
                <td className="cap">{s.drives}</td>
```
- Bump the empty-state `colSpan` from `10` to `11` (a column was added).

- [ ] **Step 9: Run — expect PASS + tsc + full client suite**

Run: `npm test -w client -- StepBasics StreamTable` then `npx -w client tsc --noEmit` then `npm test -w client`
Expected: PASS + clean + full suite green. (Fix any existing client test that builds a `StreamItem` literal without `drives` — add `drives: 0`, minimal edit.)

- [ ] **Step 10: Commit**

```bash
git add client/src/types/drives.ts client/src/pages/Drives/wizard/DriveWizard.tsx client/src/pages/Drives/wizard/StepBasics.tsx client/src/types/streams.ts client/src/pages/Streams/StreamTable.tsx client/src/test/StepBasics.test.tsx client/src/test/StreamTable.test.tsx
git commit -m "feat(client): drive wizard stream-profile picker + Streams table Drives count

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full-suite verification + live E2E smoke

**Files:** none (verification only). Controller runs the seed + smoke against an ISOLATED DB.

- [ ] **Step 1: Full suites** — `npm test -w server && npm test -w client`
- [ ] **Step 2: Type-check both + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`
- [ ] **Step 3: Seed + smoke against an isolated DB** (controller): `MONGODB_URI=mongodb://localhost:27017/matchday_drivestream_smoke npm run seed -w server` (verifies the seed runs clean with the streamId round-robin); start the worktree server on a spare port + that DB; fresh admin token:
  - `GET /api/streams` → each `drives` = the derived count (compare to `Drive.countDocuments({streamId})` per stream in the DB); non-zero for streams with assigned drives.
  - `POST /api/drives` with a `streamId` → drive persists it; then `GET /api/streams` shows that stream's `drives` incremented by 1.
  - Create a drive without a stream / with `streamId:''` → stored null; that stream's count unchanged.
  - Reconcile: sum of all streams' `drives` == `Drive.countDocuments({ streamId: { $ne: null } })`.
  - Stop server, drop `matchday_drivestream_smoke`; confirm the shared `matchday` DB is present and untouched.
- [ ] **Step 4: No commit** (verification task).

---

## Self-Review Notes (author)

- **Spec coverage:** `Drive.streamId` (model+schema+service normalization) → T1; derived `Stream.drives` + seed → T2; client DriveInput streamId + wizard picker + StreamTable column → T3; E2E → T4.
- **Mirrors Drive→Template:** T1/T2 are the templateId/usedBy patterns applied to streamId/drives; the one difference is that NO stored stream stat is removed (none existed) — `drives` is a brand-new derived field.
- **Record-only:** the picker sets only `streamId`; no eligibility/eval auto-fill; the degree field and its column/filter/sort/CSV are untouched. No conflict with the template picker (which owns eval seeding).
- **`DriveInput` location:** `client/src/types/drives.ts` (where `templateId` lives) — NOT `wizard/types.ts` (that only holds `WizardStepProps`).
- **Normalization contract:** `createDrive` always normalizes `streamId`; `updateDrive` only when `'streamId' in patch` (omit-preserves-link, with a regression test) — identical to `templateId`.
- **StreamTable colSpan:** adding the Drives column requires bumping the empty-row `colSpan` from 10 to 11.
- **Seed:** capture `createdStreams` from `Stream.insertMany`; round-robin `streamId` onto the existing seeded `drives` docs (deterministic index-modulo); confirm the drive-docs variable name against the existing templateId assignment loop.
- **Type consistency:** server `StreamItem.drives: number` (T2) ↔ client `StreamItem.drives: number` (T3); `DriveInput.streamId?: string` (T1 schema) ↔ client `DriveInput.streamId?: string` (T3).
