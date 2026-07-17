# Drive → Stream link — MERN Slice Design

**Date:** 2026-07-17
**Status:** Approved design, pending implementation plan
**Depends on:** the completed port + the four prior real-link slices (Institute↔Drive, Employer↔Drive, Drive↔Template, Candidate↔Slot) — all on `origin/main` @1fdb18b. Reuses `Drive`, `Stream`, the drives module + wizard, and the `useStreams` hook. NO new collection.
**Context:** Fifth "real cross-entity link" slice, and the first of the two deferred Drive sub-links (Drive↔Stream; Drive↔EvalConfig follows separately).

## 0. The naming trap (why this design looks the way it does)

`Drive.stream` and the `Stream` collection are **two different concepts that share the word "stream":**
- **`Drive.stream`** is a **degree** — one of `B.Tech / M.Tech / MCA / MBA`. It is a `<select>` in the wizard (`StepBasics`), a chip column in the Drives table, a filter (`DrivesToolbar` `STREAM_OPTIONS`), a sort key, and a CSV column.
- **The `Stream` collection** holds **evaluation-config profiles** — `Frontend Engineering`, `Backend Engineering`, `Data / ML`, `Full-stack`, `Business Analytics` — each with a `parent`, a `flow` (MCQ→Coding→TARA→Assignment), cutoff/cgpa/backlog thresholds, eligible branches/grad-years/sources, and versioning.

They are **not** the same taxonomy. Therefore this slice does **not** repurpose the degree field; it adds a **new** `Drive.streamId` FK to the `Stream` profile and leaves the degree field/column/filter/sort untouched.

There is also **no faked stream-side stat** today: the `Stream` model and the Streams table have no "drives using this stream" number. So the "derive from real usage" deliverable is a **new** derived count (`drives`), analogous to Template's `usedBy` — nothing is being *removed*.

## 1. Goal & Scope

Make Drive→Stream a real link: a nullable `Drive.streamId` references a `Stream` profile, picked in the drive wizard; and the Streams table gains a live-derived count of how many drives use each stream.

### In scope
- **`Drive.streamId`** (ObjectId → `Stream`, nullable) — persisted on create/update, normalized (`''`/invalid/absent → `null`; omit-preserves-link on update).
- **Drive wizard "Stream profile" picker** (in `StepBasics`, distinct from the existing degree "Stream" field): fetches Active streams via `useStreams({ status: 'Active' })`; on select sets `model.streamId`; blank option clears it; edit pre-selects. A small read-only hint shows the selected profile's `flow`. **Record-only** — no auto-fill of any other drive field.
- **Derived `Stream` usage count** — a new `drives` field on `StreamItem` = count of drives with `streamId == this`, computed live in `listStreams` (one aggregation). Surfaced as a new "Drives" column in the Streams table.
- **Seed** assigns `streamId` to the seeded drives deterministically so the count derives to real non-zero values.

### Out of scope (deferred)
- **Apply/pre-fill behavior** — picking a stream does NOT copy the profile's eligibility/thresholds onto the drive (record-only, per the confirmed decision).
- **Eval-stage seeding** — the Drive→Template picker already seeds the four eval toggles from the same 4-stage flow; the stream picker must NOT also seed eval (would conflict).
- **The degree field** (`Drive.stream`) and its table column / filter / sort / CSV — untouched.
- **Single-resource `getStream` derivation** — the Streams **list** is the binding consumer of the count; `getStream` (single) is left as-is (list-only, like Templates' `usedBy`).
- **Drive↔EvalConfig** — the last remaining sub-link, a separate future slice.
- Command Center — has no stream metric; untouched.

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Link shape | Add a NEW `Drive.streamId` FK; keep the `stream` degree field |
| Pick behavior | Record-only (store `streamId`) + a derived count; no auto-fill |
| Derived stat | New `drives` count on `StreamItem`, derived-on-read in `listStreams` |
| Eval seeding | None (owned by the Drive→Template picker) |
| Degree field | Untouched |

## 3. Server changes

- **`server/src/models/Drive.ts`:** add `streamId: { type: Schema.Types.ObjectId, ref: 'Stream', default: null }` (alongside `templateId`).
- **`server/src/modules/drives/drives.schemas.ts`:** add `streamId: z.string().optional()` to `createDriveSchema` (so `draftDriveSchema.extend` / `updateDriveSchema.partial()` inherit it).
- **`server/src/modules/drives/drives.service.ts`:** add a `normStreamId(v: unknown): Types.ObjectId | null` helper mirroring the existing `normTemplateId` (`typeof v === 'string' && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null`). `createDrive` always normalizes `streamId`; `updateDrive` normalizes **only when `'streamId' in patch`** (an omitting patch must not null an existing link). `getDrive` unchanged (raw doc now carries `streamId`).
- **`server/src/modules/streams/service.ts`:** in `listStreams`, after building `items`, derive the usage count via `Drive.aggregate([{ $match: { streamId: { $ne: null } } }, { $group: { _id: '$streamId', n: { $sum: 1 } } }])` → `Map<streamIdStr, n>`; overlay `it.drives = map.get(it.id) ?? 0`. Import `Drive`. Add `drives: number` to the `StreamItem` interface; `toItem` sets `drives: 0` as a placeholder (the list overlays the real value; single-resource callers don't surface it).

- **`server/src/seed/seed.ts`:** after the streams + drives are created, assign `streamId` to the seeded drives deterministically (round-robin over the created stream docs), so `drives` derives to real non-zero counts. Capture the `Stream.insertMany` return (like the templateId round-robin already does for `createdTemplates`). Deterministic (index-modulo, no rng draw needed).

## 4. Client changes

- **`client/src/pages/Drives/wizard/types.ts`** (`DriveInput`/`WizardModel`): add `streamId: string` (empty string when none).
- **`client/src/pages/Drives/wizard/DriveWizard.tsx`:** `blankDriveModel()` → add `streamId: ''`; `mapDocToInput(doc)` → add `streamId: doc.streamId ? String(doc.streamId) : ''`.
- **`client/src/pages/Drives/wizard/StepBasics.tsx`:** add a "Stream profile" `<select>` (its own `.fld`, labeled distinctly from the degree field which stays labeled "Stream"). Populate from `useStreams({ status: 'Active' })` (`client/src/pages/Streams/hooks/useStreams.ts`). On change: `onChange({ streamId: e.target.value })`. Blank option `value=""` → "No stream profile". Below the select, a read-only hint renders the selected stream's `flow.join(' → ')` (empty when none). No other field is touched.
- **`client/src/pages/Drives/wizard/types.ts`** already covers the type; ensure the create/update mutation payload includes `streamId` (the wizard submits the whole model, so it is included; normalized `''`→null server-side).
- **`client/src/pages/Streams/StreamTable.tsx`:** add a "Drives" column (header + cell) rendering `item.drives`. The client `StreamItem` type (in the streams types / `useStreams` response type) gains `drives: number`.

No new CSS (reuse the wizard's `.fld`/`.select` and the table's existing column styling).

## 5. Testing (TDD)

- **Server:**
  - `drives.service`: create with a `streamId` → persisted + returned; update sets/clears it; `''`/invalid normalized to null; a patch omitting `streamId` preserves an existing link (regression test).
  - `streams` service: `drives` derived — a stream referenced by 2 drives → `drives===2`; unreferenced → `0`; `listStreams` returns derived counts; create/update still work (no stored field added).
  - Build fixtures with real `Drive`/`Stream` docs (mongodb-memory-server).
- **Client:** `StepBasics` renders the stream-profile picker from a mocked `useStreams`; selecting a stream sets `streamId` on the model; the flow hint reflects the selection; the wizard submit payload includes `streamId`. `StreamTable` renders the derived "Drives" count from a mocked `useStreams` item.

## 6. File Structure

```
server/src/
  models/Drive.ts                                 # + streamId
  modules/drives/drives.schemas.ts                # + streamId (createDriveSchema)
  modules/drives/drives.service.ts                # normStreamId; persist in create/update
  modules/streams/service.ts                      # derive `drives` count from Drive; StreamItem + drives
  seed/seed.ts                                    # capture created streams; assign streamId round-robin
server/test/
  drives.service.test.ts                          # streamId round-trip + omit-preserves-link
  streams.service.test.ts                         # derived `drives` count
client/src/
  pages/Drives/wizard/types.ts                    # + streamId
  pages/Drives/wizard/DriveWizard.tsx             # blankDriveModel + edit map
  pages/Drives/wizard/StepBasics.tsx              # stream-profile picker + flow hint
  pages/Streams/StreamTable.tsx                   # + Drives column
  (streams types / useStreams response)           # StreamItem + drives: number
client/src/test/
  StepBasics.test.tsx (or DriveWizard test)       # picker sets streamId + flow hint
  StreamTable.test.tsx                            # renders derived Drives count
```

## 7. Notes

- **Derived, never stored** — `drives` computed on every `listStreams` read; nothing to drift. Consistent with Institute `assignedDrives`, Employer `activeDrives`, Template `usedBy`, Slot booked/held.
- **Record-only** — `streamId` is a classification/association; picking a stream never overwrites the drive's own eligibility or eval config. This keeps the stream picker non-overlapping with the template picker (which seeds eval).
- **Naming discipline** — the wizard shows two fields: "Stream" (the existing degree select) and "Stream profile" (the new eval-config-stream select). Keeping the degree label as the prototype has it avoids churn to the Drives table/filter/CSV; the new label disambiguates.
- **Type note:** adding `streamId` to `Drive` and `drives` to `StreamItem` is purely additive; `tsc` stays clean. The client `StreamItem` keeps its existing fields and gains `drives: number`.
- **Seed:** assign `streamId` across the seeded drives so the Streams table shows real non-zero "Drives" counts; deterministic (index round-robin over the created stream docs).
- **Isolation/DB:** built in an isolated worktree (`/Users/srinivasarao.kandula/code/matchday-drivestream`, off `origin/main`); the seed RUN + smoke happen against an isolated DB in the E2E task — the shared local `matchday` DB is the user's parallel-work space and must not be touched.
