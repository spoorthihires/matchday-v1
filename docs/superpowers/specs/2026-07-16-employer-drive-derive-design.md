# Employer ↔ Drive (derive-from-participation) — MERN Slice Design

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Depends on:** the completed port + the Institute↔Drive slice (all on `main` @b9be30f). Reuses `Employer`, `Slot`, `Drive`, the employers module, `EmployersTable`, and the Slots page. NO new collection, NO migration.
**Context:** Second "real cross-entity link" slice. Today `Employer.activeDrives` is a random seeded stat (`intBetween(rng,0,4)`, `seed.ts:90`), read straight through `listEmployers` → `EmployersTable` → CSV with zero derivation. But the real employer↔drive relationship already exists as `Slot.employerId` + `Slot.driveId` — so an employer's active-drive count is derivable from real data. This slice deletes the fake and derives it.

## 1. Goal & Scope

Make `Employer.activeDrives` a **live-derived** count (distinct drives an employer has booked `Slot`s in), delete the stored random stat, and add a lightweight way to view those drives (a "View drives" deep-link to the existing Slots calendar filtered by employer).

### In scope
- **Server:** `listEmployers` + `getEmployer` compute `activeDrives = |distinct Slot.driveId where Slot.employerId == employer._id|`. The stored value is no longer read.
- **Remove `activeDrives`** from the `Employer` model schema and from the seed (stop persisting a fake). Derived-only.
- **List sort:** `sort=drives` sorts by the derived `activeDrives` (in-memory over the mapped items, since it's no longer a stored path).
- **Client — EmployersTable:** the existing "Active Drives" column now shows the real derived number (no change needed to render it); add a **"View drives" row action** → `navigate('/slots?employerId=<id>')`.
- **Client — SlotsPage:** initialize the employer filter from the `?employerId=` **query param** so the deep-link lands pre-filtered.

### Out of scope (deferred)
- The other employer stats (`candidatesViewed`, `shortlistRate`, `offerRate`, `respHours`, `offersExtended`, `slotsFillRate`) — no backing data exists to derive them; they stay seeded.
- An explicit employer↔drive **assignment** model (the disabled "Assign Drives" bulk stub) — this slice is participation-derived, not assignment. The bulk "Assign Drives" stub stays disabled.
- A full Employer **detail page** (none exists; net-new — not built here).
- Any Command Center change (its global "Active Drives" KPI is `Drive.countDocuments({status:'Active'})`, unrelated to `Employer.activeDrives`).
- Candidate↔Slot and Drive↔config links (separate future slices).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Model | Derive from `Slot` participation — NO new schema |
| `activeDrives` source | `distinct Slot.driveId` per `employerId` (aggregation), computed live in list + get |
| Stored field | **Removed** from the `Employer` model + seed (derived-only) |
| UI | Real count (existing column) + "View drives" deep-link to `/slots?employerId=…` |
| Other stats | Stay seeded (no backing data) — out of scope |
| CC | Untouched |

## 3. Server changes

`server/src/modules/employers/employers.service.ts`:
- Add a per-employer derivation. For the LIST (all matching employers), one aggregation:
  ```
  Slot.aggregate([
    { $match: { employerId: { $ne: null } } },
    { $group: { _id: '$employerId', drives: { $addToSet: '$driveId' } } },
  ])
  ```
  → `Map<employerIdString, number>` where value = `drives.length`. Then each list item's `activeDrives = map.get(String(d._id)) ?? 0`.
- For `getEmployer` (single): `Slot.distinct('driveId', { employerId: new Types.ObjectId(id) })` → `.length` (or the same aggregation matched to the one id). Return it on the DTO the same way the list does. (Confirm whether `getEmployer` currently returns a mapped item or the raw doc — align the shape so the client gets `activeDrives` derived. If `getEmployer` returns a raw doc today and nothing consumes it, deriving on the list is the primary requirement; extend get for consistency.)
- **Sort:** where `sort=drives` currently sorts on the stored `activeDrives` path, change to sort the mapped items by the derived `activeDrives` in memory (mirror the pattern `listInstitutes` uses for its derived funnel sort keys). Preserve the existing `order` (asc/desc) and the stable secondary sort (by name).

`server/src/models/Employer.ts`: remove the `activeDrives` field from the schema (it is no longer stored). `InferSchemaType` no longer includes it; the service supplies the derived value onto the item DTO, not the model.

`server/src/seed/seed.ts`: remove `activeDrives: intBetween(rng, 0, 4)` from the employer seed objects. (Leave the other stat seeds untouched.) After re-seed, each employer's `activeDrives` derives from its seeded `Slot`s.

Server `EmployerListItem` type (in `employers.service.ts`) keeps `activeDrives: number` — now populated by derivation.

## 4. Client changes

- `client/src/types/employers.ts`: `activeDrives` stays a `number` on `EmployerListItem` (no type change; it's just now derived server-side).
- `client/src/pages/Employers/EmployersTable.tsx`: the `activeDrives` cell is unchanged (renders the real number). Add a **"View drives"** affordance — a row action (icon button in the row-action group and/or a kebab-menu item) that calls a new `onAction('view-drives', employer)` / or navigates directly. Prefer routing via the page (keep the table presentational): add `'view-drives'` to the table's action union and handle it in `EmployersPage`.
- `client/src/pages/Employers/index.tsx` (`EmployersPage`): handle `'view-drives'` → `navigate('/slots?employerId=<id>')`.
- `client/src/pages/Slots/index.tsx` (`SlotsPage`): read the `employerId` search param on mount (via `useSearchParams`) and initialize the `employerId` filter state from it, so the deep-link pre-selects that employer. (Keep the existing select working; the param just seeds the initial value.)

No new CSS (reuse the existing row-action / kebab styles).

## 5. Testing (TDD)

- **Server** (`employers.service` tests): with seeded `Slot`s, an employer with slots across 2 distinct drives → `activeDrives === 2`; an employer with 2 slots on the SAME drive → `activeDrives === 1` (dedup via `$addToSet`); an employer with no slots → `activeDrives === 0`; `listEmployers` returns derived counts for all; `getEmployer` returns the derived count; `sort=drives&order=desc` orders employers by the derived count. Build fixtures with real `Slot`/`Employer`/`Drive` docs (mongodb-memory-server).
- **Client:** `EmployersTable` "View drives" action fires `onAction('view-drives', <employer>)` (or navigates) with the right id; `EmployersPage` maps it to `/slots?employerId=<id>`; `SlotsPage` initializes its employer filter from a `?employerId=` param (render under `MemoryRouter` with the param set → the employer select shows that value / the query includes it).

## 6. File Structure

```
server/src/
  models/Employer.ts                         # remove activeDrives field
  modules/employers/employers.service.ts     # derive activeDrives (list+get) + in-memory drives-sort
  seed/seed.ts                               # remove activeDrives seed
server/test/
  employers.service.test.ts                  # extend: derived activeDrives + sort
client/src/
  pages/Employers/EmployersTable.tsx         # "View drives" action
  pages/Employers/index.tsx                  # handle view-drives → navigate
  pages/Slots/index.tsx                      # read ?employerId= param
client/src/test/
  EmployersTable.test.tsx                    # view-drives action (extend or new)
  SlotsEmployerParam.test.tsx                # SlotsPage reads ?employerId=
```

## 7. Notes

- **Derived, never stored** — `activeDrives` is computed on every read; there is no stored value to drift. This is the core principle of the "real links" phase.
- **Reconciliation:** the derived count reflects exactly the slots visible in the Slots calendar for that employer, so the "View drives" deep-link and the count are inherently consistent.
- **Seed effect:** counts drop from a uniform random 0–4 to the real per-employer distribution (~1–3 given the seeded slot→employer/drive mapping). Deterministic.
- **`getEmployer` shape:** verify during implementation whether it returns a mapped DTO or a raw doc; if raw and unconsumed, the list derivation is the binding requirement and `getEmployer` is extended for consistency (no client currently depends on a `getEmployer` `activeDrives`).
