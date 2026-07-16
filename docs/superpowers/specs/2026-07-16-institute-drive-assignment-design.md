# Institute ↔ Drive Assignment — MERN Slice Design

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Depends on:** the completed 9-module port (all on `main`). Reuses auth, app shell, conventions, the `Institute`/`Drive` collections, and the InstituteDetail tab scaffolding. Adds one new collection (`DriveAssignment`). Does NOT modify the Command Center.
**Context:** This is the first "real cross-entity link" slice — going *beyond* the faithful prototype port (which only has disabled "Assign Drives" stubs). It makes the institute↔drive relationship real: today `Institute` has no drive reference, the InstituteDetail "Drives" tab is a coming-soon card, the header "Assign Drives" button and the list bulk "Assign Drives" button are both `disabled`, and the detail header's drive count is hardcoded `0`.

## 1. Goal & Scope

Make institute↔drive assignment a real, queryable many-to-many relationship, and wire the already-scaffolded institute-side UI (Drives tab, header Assign modal, real count, bulk assign).

### In scope
- **`DriveAssignment` linking collection** — plain many-to-many link `{ instituteId, driveId, createdAt }` with a unique `(instituteId, driveId)` index.
- **Institutes-module API** (nested, matching the module's existing `:id/candidates` and `:id/audit` sub-resources):
  - `GET /api/institutes/:id/drives` — drives assigned to the institute (join → `Drive`).
  - `POST /api/institutes/:id/drives` `{ driveIds: string[] }` — assign (idempotent).
  - `DELETE /api/institutes/:id/drives/:driveId` — unassign.
  - `POST /api/institutes/assign-drives` `{ instituteIds: string[], driveIds: string[] }` — bulk assign (cartesian, idempotent).
- **Real `assignedDrives` count** on both the institute **list** item and **detail** DTO (aggregation over `DriveAssignment`), replacing the hardcoded `0`.
- **Frontend (institute-side):**
  - `TabDrives` (replaces `TabDrivesComingSoon`) — lists assigned drives with a per-row **× unassign**; empty state.
  - `AssignDrivesModal` (wires the disabled header button) — searchable list of all drives, checkboxes pre-checked to current assignments, **Save diffs** the set (assign added, unassign removed).
  - Real "N drives" count in the detail header.
  - **Bulk "Assign Drives"** from the Institutes list bulk bar (wires that disabled stub) — pick drives → assign to all selected institutes (additive-only).
- **Seed** deterministic assignments so the tab is populated.

### Out of scope (deferred)
- Assignment **status/lifecycle** (Invited→Confirmed→Declined) — plain link only for v1 (the linking collection makes adding a `status` trivial later).
- Any **Drive-side** surfacing (assigned-institute count on the drive list / a Drive detail page) — this slice is institute-centric.
- Reconciling `Drive.candCap`/`empCap`/`slotCap` or any Command Center metric against assignments (CC untouched).
- Employer↔Drive, Candidate↔Slot, Drive↔Template/Stream/EvalConfig links (separate future slices B/C/D).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Model | Dedicated `DriveAssignment` linking collection (unique `(instituteId, driveId)`) |
| Lifecycle | Plain link (no status) for v1 |
| UI scope | Institute-side, full (Drives tab + Assign modal + real count + bulk assign) |
| Assign semantics | Idempotent — re-assigning an existing pair is a no-op (unique index) |
| CC integration | None — additive; the CC institute leaderboard is funnel-based |

## 3. `DriveAssignment` collection

```ts
DriveAssignment {
  instituteId: ObjectId → Institute;   // required
  driveId: ObjectId → Drive;           // required
  createdAt: Date;                     // explicit (no timestamps)
}
// unique compound index { instituteId: 1, driveId: 1 }
```
Model: `server/src/models/DriveAssignment.ts`. The unique index enforces dedup at the DB layer; assign operations use `insertMany(..., { ordered: false })` or per-pair `updateOne(..., { upsert: true })` so duplicates are silently skipped.

## 4. API (extends `server/src/modules/institutes/`, all `requireAuth`)

Standard `{ error: { message, code } }` contract. Assignment routes live in the institutes routes/controller/service (or a co-located `institutes.assignments.*` file) — nested paths declared so `/assign-drives` (bulk) is matched before `/:id/...`.

- **`GET /api/institutes/:id/drives`** — 404 if institute unknown. Returns `{ items: AssignedDriveItem[] }` — for each assigned drive: `id`, `name`, `domain`, `stream`, `status`, `month` (or the drive list-item shape reused from `drives.service`), sorted newest-assigned first.
- **`POST /api/institutes/:id/drives`** — body `{ driveIds: string[] }` (each a valid ObjectId that resolves to a Drive; unknown/invalid ids rejected 400 or skipped — **skip silently**, only assign resolvable ones). Idempotent. → `{ items: AssignedDriveItem[] }` (the updated list) or `{ assigned: n }`. Use the updated list for the client to refresh.
- **`DELETE /api/institutes/:id/drives/:driveId`** — removes the `DriveAssignment`; `{ deleted: true }` (idempotent — deleting a non-existent link still returns `{ deleted: true }`). 404 only on malformed institute id.
- **`POST /api/institutes/assign-drives`** — body `{ instituteIds: string[], driveIds: string[] }` (both non-empty). Creates the cartesian product of assignments, idempotent. → `{ assigned: n }` (count of pairs now existing / newly created). Declared **before** `/:id` routes.

**Institute DTO change:** `listInstitutes` and `getInstitute` add `assignedDrives: number` — computed via a `DriveAssignment` `$group`/`countDocuments` per institute (list: one aggregation grouping by `instituteId`; detail: `countDocuments({ instituteId })`). No other institute field changes.

## 5. Frontend

`client/src/pages/Institutes/`:
- `detail/TabDrives.tsx` (new; replaces the `TabDrivesComingSoon` import in `InstituteDetail.tsx`'s `TABS`) — `useInstituteDrives(id)` query (`['institute-drives', id]`); renders a list/table of assigned drives (name + `DRV`-style code or domain/stream chips + status badge + month) each with a **× unassign** button (confirm-less quick remove → unassign mutation); `.dm-empty` when none; an "Assign Drives" button in the tab header too (opens the same modal).
- `detail/AssignDrivesModal.tsx` (new) — props `{ instituteId, onClose }`; fetches all drives (`useDrives({ limit: 100 })`) + the institute's current assignments; renders a searchable checkbox list (checked = currently assigned); **Save** computes added/removed vs the initial set and fires assign (`POST :id/drives` with added) + unassign (`DELETE :id/drives/:driveId` for each removed), then invalidates and closes. Reuses `.modal`/`.dm-search`/checkbox styles already in theme.css.
- `detail/InstituteDetail.tsx` (modify) — enable the header "Assign Drives" button (open the modal); replace the hardcoded `0 drives` with the real `assignedDrives` from the detail payload; swap the Drives tab component.
- `BulkBar.tsx` (modify) — enable the bulk "Assign Drives" button; opens a bulk `AssignDrivesModal` variant (or a dedicated `BulkAssignDrivesModal`) that assigns the chosen drives to all selected institute ids via `POST /assign-drives`.
- `hooks/` — `useInstituteDrives(id)` (query), `useDriveAssignmentMutations()` (`assign`, `unassign`, `bulkAssign` → invalidate `['institute-drives', id]`, `['institutes']`, and the institute-detail query so the count refreshes).
- `types` — `AssignedDriveItem`, request/response shapes.

The existing InstituteDetail tab framework, `useDrives`, and the institutes list/detail hooks are reused. No new CSS.

## 6. Seed

`server/src/seed/seed.ts` — add `DriveAssignment.deleteMany` to cleanup; after institutes + drives are created, deterministically assign each institute ~2–5 drives (a stable PRNG pick over the seeded drive ids), inserting `DriveAssignment` docs. Deterministic; no duplicates (respect the unique index). This populates the Drives tab and gives non-zero `assignedDrives` counts.

## 7. Testing (TDD)

- **Server:** the unique index prevents duplicate pairs; assign is idempotent (re-assigning skips); unassign removes (and is idempotent); `GET :id/drives` returns the joined drives sorted newest-first; bulk `assign-drives` creates the cartesian product idempotently; `listInstitutes`/`getInstitute` return a correct real `assignedDrives` count; 404 on unknown institute; malformed ids handled. (mongodb-memory-server; the unique index must be created — ensure `Model.init()`/`createIndexes` in the test or rely on autoIndex.)
- **Client:** `TabDrives` renders assigned drives from a mocked payload and × fires unassign; `AssignDrivesModal` pre-checks current assignments and Save fires assign for newly-checked + unassign for unchecked; bulk assign from the bulk bar posts the selected institute+drive ids; the detail header count reflects the payload.

## 8. File Structure Additions

```
server/src/
  models/DriveAssignment.ts
  modules/institutes/
    institutes.assignments.service.ts   # or fold into service.ts
    institutes.controller.ts routes.ts service.ts   # extended (assign endpoints + assignedDrives on DTOs)
  seed/seed.ts                          # assignments + cleanup
server/test/
  institute-drives.service.test.ts institute-drives.route.test.ts
client/src/
  pages/Institutes/
    detail/TabDrives.tsx detail/AssignDrivesModal.tsx
    detail/InstituteDetail.tsx          # enable button, real count, swap tab
    BulkBar.tsx                          # enable bulk assign
    hooks/useInstituteDrives.ts hooks/useDriveAssignmentMutations.ts
    types (assigned-drive shapes)
client/src/test/
  TabDrives.test.tsx AssignDrivesModal.test.tsx
```

## 9. Notes

- **Idempotency** is the core correctness property: the unique index + upsert/skip semantics mean assigning is safe to repeat (single, bulk, and re-Save from the modal). Unassign is also idempotent.
- **assignedDrives count** must be a live aggregation, never a stored field — avoids the very "faked stat" problem this slice exists to fix.
- The design leaves a clean seam for a future `status` field (Invited/Confirmed/Declined) on `DriveAssignment` without migration.
