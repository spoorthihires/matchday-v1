# Drive → Template link — MERN Slice Design

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Depends on:** the completed port + the two prior real-link slices (Institute↔Drive, Employer↔Drive) — all on `origin/main` @6f784ba. Reuses `Drive`, `DriveTemplate`, the drives module + wizard, and the templates `useTemplates` hook. NO new collection.
**Context:** Third "real cross-entity link" slice. `DriveTemplate.usedBy` is currently a stored/seeded number (`6/4/5/3/0`, never derived), and `Drive` has no reference to a template — the prototype never wires them (only a descriptive comment: "Reusable configuration applied when spinning up a drive"). This slice adds a real `Drive.templateId` link, a wizard picker that **applies** a template (seeds the drive's evaluation stages), and derives `usedBy` from real drive usage.

## 1. Goal & Scope

Make Drive→Template a real link: pick a template in the Drive wizard → it seeds the drive's evaluation stages + records `templateId`; and `DriveTemplate.usedBy` becomes a live-derived count of drives using each template (the stored fake deleted).

### In scope
- **`Drive.templateId`** (ObjectId → `DriveTemplate`, nullable) — persisted on create/update.
- **Drive wizard "Start from a template" picker** (in `StepEvaluation`): fetches active templates; on select, sets `model.templateId` AND seeds the four `model.evaluation` toggles (mcq/coding/tara/assignments) from the template's `sections.assessment`. Editable/tweakable after; pre-selected on edit.
- **Derived `DriveTemplate.usedBy`** = `count of drives with templateId == this`, computed live in `listTemplates` (one aggregation). The stored `usedBy` field is **removed** from the model + seed.
- **Seed** assigns `templateId` to the seeded drives deterministically so `usedBy` derives to real non-zero counts.

### Out of scope (deferred)
- **Drive→Stream** and **Drive→EvalConfig** links (separate future slices). `Drive.stream` stays a free-text degree string; `Drive.evaluation` stays inline `{key,enabled,config}` (a template only *seeds* its enabled flags — no per-stage `evalConfigId`).
- Re-applying a template to already-created drives / template-change cascade beyond recording the new `templateId`.
- Any Command Center change (it has no template metric).
- Matching the prototype's exact hardcoded `usedBy` values — they become real (smaller, ~drive-count-based).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Scope | Drive→Template only |
| Apply behavior | Picking a template seeds the drive's eval toggles from `sections.assessment` AND records `templateId` |
| `usedBy` | Derived-on-read (`Drive.countDocuments({templateId})`), stored field removed |
| `Drive.evaluation` | Unchanged shape (inline toggles); the template seeds `enabled` flags only |
| CC | Untouched |

## 3. Server changes

- **`server/src/models/Drive.ts`:** add `templateId: { type: Schema.Types.ObjectId, ref: 'DriveTemplate', default: null }` (alongside `evaluation`).
- **`server/src/modules/drives/drives.schemas.ts`:** add `templateId` to `createDriveSchema` and `draftDriveSchema` — `z.string().refine(isValidObjectId).or(z.literal('')).nullish()` (accept a valid id, empty string, or null/undefined). Normalize `''` → null in the service.
- **`server/src/modules/drives/drives.service.ts`:** `createDrive`/`updateDrive` persist `templateId` (normalize empty→null; validate it resolves to a DriveTemplate OR skip silently if not — prefer: if provided and a valid ObjectId, store it; a non-resolving id is stored as-is or nulled — keep simple: store the provided ObjectId or null). The drive list item shape (`DriveListItem`) MAY gain `templateId` (optional) so the wizard edit can pre-select — include it.
- **`server/src/modules/templates/templates.service.ts`:** in `listTemplates`, derive `usedBy` via `Drive.aggregate([{ $match: { templateId: { $ne: null } } }, { $group: { _id: '$templateId', n: { $sum: 1 } } }])` → `Map<templateIdStr, n>`; `toItem`/mapping sets `usedBy = map.get(String(d._id)) ?? 0`. Import `Drive`. (getTemplate: the client card list is the binding consumer of `usedBy`; leave getTemplate or derive there too for consistency — the list is what shows "Used by N drives".)
- **`server/src/models/DriveTemplate.ts`:** remove the stored `usedBy` field. **`templates.service.ts`** create/clone: remove the `usedBy: 0` literal (no longer a stored field). **`seed.ts`:** remove the hardcoded `usedBy` from the 5 template objects.
- **`server/src/seed/seed.ts`:** after templates + drives are created, assign `templateId` to the seeded drives deterministically (e.g., round-robin / domain-aligned over the 5 templates) via `Drive.updateOne`/set at creation, so `usedBy` derives to real non-zero counts. Deterministic.

## 4. Client changes

- **`client/src/pages/Drives/wizard/types.ts`** (`DriveInput`/`WizardModel`): add `templateId: string | null` (or `''`).
- **`client/src/pages/Drives/wizard/DriveWizard.tsx`** (`blankDriveModel`): add `templateId: ''` (or null); edit-mode maps the drive's `templateId`.
- **`client/src/pages/Drives/wizard/StepEvaluation.tsx`:** add a "Start from a template" `<select>` above the stage list. Populate from `useTemplates({ status: 'Active' })` (the templates hook — path `client/src/pages/Templates/hooks/useTemplates.ts`). On change: set `model.templateId` and, if a template is chosen, seed `model.evaluation` — for each stage key `k ∈ {mcq,coding,tara,assignments}`, set that stage's `enabled = template.sections.assessment[k]`. Keep each stage's existing `config`. Selecting the blank option clears `templateId` (leaves eval as-is). Use the existing `META`/`toggleEnabled` shape so the seeded toggles render identically.
- The create/update drive mutation already sends the model; ensure `templateId` is included in the submitted payload (normalize `''`→ omit/null as the schema expects).

No new CSS (reuse the wizard's existing `.fld`/`.select` styling).

## 5. Testing (TDD)

- **Server:**
  - `drives.service`: create with a `templateId` → persisted + returned; update sets/clears it; `''`/null normalized.
  - `templates.service`: `usedBy` derived — a template referenced by 2 drives → `usedBy===2`; unreferenced → `0`; `listTemplates` returns derived counts; the stored field removal doesn't break create/clone (they no longer set `usedBy`).
  - Build fixtures with real `Drive`/`DriveTemplate` docs (mongodb-memory-server).
- **Client:** `StepEvaluation` renders the template picker from a mocked `useTemplates`; selecting a template sets `templateId` on the model AND flips the eval toggles to match `sections.assessment` (e.g. a template with `assignments:true` enables the Assignments stage); the wizard submit payload includes `templateId`.

## 6. File Structure

```
server/src/
  models/Drive.ts                                 # + templateId
  models/DriveTemplate.ts                         # - usedBy field
  modules/drives/drives.schemas.ts                # + templateId (create+draft)
  modules/drives/drives.service.ts                # persist templateId; item shape + templateId
  modules/templates/templates.service.ts          # derive usedBy from Drive; drop usedBy:0 literals
  seed/seed.ts                                    # drop usedBy seed; assign templateId to drives
server/test/
  drives.service.test.ts                          # templateId round-trip
  templates.service.test.ts                       # derived usedBy
client/src/
  pages/Drives/wizard/types.ts                    # + templateId
  pages/Drives/wizard/DriveWizard.tsx             # blankDriveModel + edit map
  pages/Drives/wizard/StepEvaluation.tsx          # template picker + apply-seeds-eval
client/src/test/
  DriveWizard.test.tsx  (or StepEvaluation test)  # picker sets templateId + seeds eval
```

## 7. Notes

- **Derived, never stored** — `usedBy` computed on every `listTemplates` read; nothing to drift. Consistent with Institute↔Drive `assignedDrives` and Employer `activeDrives`.
- **Apply is one-way at pick time** — selecting a template seeds the toggles once; the user's subsequent manual edits win (we don't keep re-syncing). Recording `templateId` is what drives the `usedBy` count regardless of later toggle edits.
- **Type note:** removing `usedBy` from `DriveTemplate` drops it from the model's inferred type; the only reader is `listTemplates`' mapping (now the derived map) — `tsc` stays clean. The client `TemplateItem` keeps `usedBy: number` (still supplied, now derived).
- **Seed:** assign `templateId` across the seeded drives so cards show real non-zero "Used by N drives"; the counts intentionally differ from the prototype's hardcoded values (now real).
- **Isolation/DB:** built in an isolated worktree; the seed RUN + smoke happen against an isolated DB in the E2E task (the shared local `matchday` DB is the user's parallel-work space).
