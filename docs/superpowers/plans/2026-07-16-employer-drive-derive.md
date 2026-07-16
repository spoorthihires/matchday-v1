# Employer ↔ Drive (derive-from-participation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Employer.activeDrives` a live-derived count (distinct drives an employer has booked `Slot`s in), delete the stored random stat, and add a "View drives" deep-link to the Slots calendar filtered by employer.

**Architecture:** Server derivation only (one `Slot` aggregation in `listEmployers`), removal of the stored field from model + seed, and small client wiring (a row action → `/slots?employerId=…`, and SlotsPage reading that query param). No new collection, no migration. Command Center untouched.

**Isolation:** This runs in an isolated git worktree at `/Users/srinivasarao.kandula/code/matchday-empdrive` (branch `feat/employer-drive-derive`, off `main`). The user works in parallel in the main checkout — do NOT touch it, do NOT run `git checkout`/`switch`/`branch`. node_modules is symlinked. `git commit` in the worktree.

## Global Constraints

- **Error contract** `{error:{message,code}}`; ESM (.js suffixes); `"strict":true`; `tsc --noEmit` MUST pass each task (`npx -w server tsc --noEmit` / `npx -w client tsc --noEmit`).
- **`activeDrives` is derived, never stored** — computed on every `listEmployers` read from `Slot` (`$addToSet` distinct `driveId` per `employerId`). The stored field is removed from the model + seed.
- **Only `activeDrives` is derived** — the other employer stats (candidatesViewed/shortlistRate/offerRate/respHours/offersExtended/slotsFillRate) stay seeded, untouched.
- **CC untouched** — do not edit `dashboard.service.ts`.
- **Faithful CSS** — reuse existing classes (`.rowact`, `.kebab-menu`, `.btn`, `.select`); no new CSS.
- **Do NOT touch the shared local MongoDB** — the seed RUN is deferred to the controller's Task-4 E2E against an isolated DB (the user's parallel work shares the local `matchday` DB). Verify seed edits with `tsc` only.

## File Structure

```
server/src/
  models/Employer.ts                         # T1 remove activeDrives field
  modules/employers/employers.service.ts     # T1 derive activeDrives from Slot in listEmployers
  modules/employers/employers.schemas.ts     # T1 (only if it references activeDrives — likely not)
  seed/seed.ts                               # T1 remove activeDrives seed
server/test/
  employers.service.test.ts                  # T1 extend: derived activeDrives + dedup + sort
client/src/
  pages/Slots/index.tsx                      # T2 read ?employerId= query param
  pages/Employers/EmployersTable.tsx         # T3 "View drives" action
  pages/Employers/index.tsx                  # T3 handle view-drives → navigate
client/src/test/
  SlotsEmployerParam.test.tsx                # T2
  EmployersTable.test.tsx                    # T3 extend (view-drives action)
```

---

## Task 1: Server — derive `activeDrives`, remove the stored field + seed (+ service tests)

**Files:** Modify `server/src/models/Employer.ts`, `server/src/modules/employers/employers.service.ts`, `server/src/modules/employers/employers.schemas.ts` (conditionally), `server/src/seed/seed.ts`; Test `server/test/employers.service.test.ts`.

- [ ] **Step 1: Write the failing service test** — extend `server/test/employers.service.test.ts` with a describe block (keep existing tests). Add imports for `Slot` and `Drive` if not present:

```ts
import { Slot } from '../src/models/Slot.js';
import { Drive } from '../src/models/Drive.js';
// (Employer, listEmployers, getEmployer already imported by the existing suite)

describe('employers.service — derived activeDrives (from Slot participation)', () => {
  async function emp(name: string) {
    return Employer.create({ name, industry: 'Product · SaaS', status: 'Active' });
  }
  async function drv(name: string) {
    return Drive.create({ name, domain: 'Web', stream: 'B.Tech', status: 'Active', eventDates: [new Date('2026-07-15T00:00:00.000Z')] });
  }
  const slot = (employerId: unknown, driveId: unknown) =>
    Slot.create({ driveId, employerId, date: new Date('2026-07-15T00:00:00.000Z'), start: '10:00', end: '12:00', capacity: 10, booked: 0, held: 0, status: 'Scheduled' });

  it('derives activeDrives = distinct drives an employer has slots in (dedup; 0 when none)', async () => {
    const a = await emp('Alpha'); const b = await emp('Beta'); const c = await emp('Gamma');
    const d1 = await drv('FE'); const d2 = await drv('BE');
    // Alpha: 2 slots on the SAME drive → 1 distinct
    await slot(a._id, d1._id); await slot(a._id, d1._id);
    // Beta: 2 slots on 2 different drives → 2 distinct
    await slot(b._id, d1._id); await slot(b._id, d2._id);
    // Gamma: no slots → 0
    const { items } = await listEmployers({ limit: 100 });
    const byName = Object.fromEntries(items.map((i) => [i.name, i.activeDrives]));
    expect(byName.Alpha).toBe(1);
    expect(byName.Beta).toBe(2);
    expect(byName.Gamma).toBe(0);
  });

  it('sort=drives orders by the derived count', async () => {
    const a = await emp('Alpha'); const b = await emp('Beta');
    const d1 = await drv('FE'); const d2 = await drv('BE'); const d3 = await drv('ML');
    await slot(a._id, d1._id);                                  // Alpha → 1
    await slot(b._id, d1._id); await slot(b._id, d2._id); await slot(b._id, d3._id);  // Beta → 3
    const { items } = await listEmployers({ sort: 'drives', order: 'desc', limit: 100 });
    expect(items[0].name).toBe('Beta');    // 3 before 1
    expect(items[0].activeDrives).toBe(3);
  });

  it('ignores any stored value — activeDrives comes only from slots', async () => {
    // create with an attempted stored activeDrives (Mongoose strips unknown paths after the field is removed)
    const a = await Employer.create({ name: 'Zeta', industry: 'Fintech', status: 'Active' });
    const { items } = await listEmployers({ limit: 100 });
    expect(items.find((i) => i.name === 'Zeta')!.activeDrives).toBe(0);  // no slots → 0, regardless of any legacy stored number
  });
});
```

- [ ] **Step 2: Run — expect FAIL** — `npm test -w server -- employers.service` (the derived-count assertions fail because `activeDrives` is still read from the stored field). Work from `/Users/srinivasarao.kandula/code/matchday-empdrive`.

- [ ] **Step 3: Derive in the service** — in `server/src/modules/employers/employers.service.ts`:
  - Add the import: `import { Slot } from '../../models/Slot.js';`
  - In `listEmployers`, after `const docs = await Employer.find(match).lean();`, add the aggregation + map:
    ```ts
    const driveAgg = await Slot.aggregate([
      { $match: { employerId: { $ne: null } } },
      { $group: { _id: '$employerId', drives: { $addToSet: '$driveId' } } },
    ]);
    const driveCount = new Map<string, number>(driveAgg.map((r) => [String(r._id), (r.drives as unknown[]).length]));
    ```
  - Change the item mapping's `activeDrives` from `(d.activeDrives as number) ?? 0` to `driveCount.get(String(d._id)) ?? 0`.
  - Leave the rest (the in-memory sort already sorts by the item's `activeDrives`, so `sort=drives` now uses the derived value — no sort change needed).

- [ ] **Step 4: Remove the stored field** — in `server/src/models/Employer.ts`, delete the line `activeDrives: { type: Number, default: 0 },`. (`EmployerDoc` no longer includes it; the service no longer references `d.activeDrives`, so `tsc` stays clean.)

- [ ] **Step 5: Remove from seed** — in `server/src/seed/seed.ts`, delete the `activeDrives: intBetween(rng, 0, 4),` line from the employer-creation object. Leave the other stat seeds.

- [ ] **Step 6: Check the create schema** — open `server/src/modules/employers/employers.schemas.ts`; if `createEmployerSchema` (or its base) has an `activeDrives` field, remove it (it's a derived stat, never client-set). If it's absent (likely — the schema is the editable fields only), no change.

- [ ] **Step 7: Run — expect PASS** — `npm test -w server -- employers.service` (all, incl. the existing tests). Then `npx -w server tsc --noEmit`.

- [ ] **Step 8: Commit** (in the worktree)

```bash
git add server/src/models/Employer.ts server/src/modules/employers/employers.service.ts server/src/modules/employers/employers.schemas.ts server/src/seed/seed.ts server/test/employers.service.test.ts
git commit -m "feat(server): derive Employer.activeDrives from Slot participation (drop stored stat)"
```

Note: `getEmployer` (GET `/employers/:id`) returns the raw doc and is **not consumed by the client** for `activeDrives` (no get-by-id hook; the edit modal uses list data). After removing the field it simply omits `activeDrives` — acceptable. Do NOT add a route change.

---

## Task 2: Client — SlotsPage reads the `?employerId=` query param (+ test)

**Files:** Modify `client/src/pages/Slots/index.tsx`; Test `client/src/test/SlotsEmployerParam.test.tsx`.

This is the deep-link target — built before the link source (Task 3).

- [ ] **Step 1: Failing test** — `client/src/test/SlotsEmployerParam.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { SlotsPage } from '../pages/Slots/index.js';

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={qc}><AuthProvider><SlotsPage /></AuthProvider></QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('SlotsPage — ?employerId= deep-link', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/employers')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [{ id: 'emp-1', name: 'Nexatech', industry: 'x', size: '51–200', spoc: '', email: '', status: 'Active', activeDrives: 0, candidatesViewed: 0, shortlistRate: 0, offerRate: 0, respHours: 0 }], total: 1, page: 1, limit: 100 }) });
      if (url.includes('/slots')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('initializes the employer filter from ?employerId= so the slots query is pre-filtered', async () => {
    renderAt('/slots?employerId=emp-1');
    await waitFor(() => {
      const fm = fetch as unknown as ReturnType<typeof vi.fn>;
      const slotCall = fm.mock.calls.find(([u]) => typeof u === 'string' && u.includes('/slots') && u.includes('employerId=emp-1'));
      expect(slotCall).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: Read the param** — in `client/src/pages/Slots/index.tsx`:
  - Add `useSearchParams` to the `react-router-dom` import.
  - Inside `SlotsPage`, before the `employerId` state: `const [searchParams] = useSearchParams();`
  - Change `const [employerId, setEmployerId] = useState('');` to `const [employerId, setEmployerId] = useState(() => searchParams.get('employerId') ?? '');`
  - (The employer `<select>` still drives `setEmployerId`; the param only seeds the initial value. No URL sync-back.)

- [ ] **Step 4: Run — expect PASS** — `npm test -w client -- SlotsEmployerParam`. Then `npx -w client tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Slots/index.tsx client/src/test/SlotsEmployerParam.test.tsx
git commit -m "feat(client): SlotsPage reads ?employerId= to pre-filter the calendar"
```

---

## Task 3: Client — EmployersTable "View drives" action + page wiring (+ test)

**Files:** Modify `client/src/pages/Employers/EmployersTable.tsx`, `client/src/pages/Employers/index.tsx`; Test `client/src/test/EmployersTable.test.tsx`.

- [ ] **Step 1: Failing test** — extend `client/src/test/EmployersTable.test.tsx` with a case (keep existing tests). It should render the table, open the kebab for a row, click "View drives", and assert `onRowAction('view-drives', <id>)` fired. Use the file's existing render helper / mock employer shape; add:

```ts
it('fires view-drives from the kebab', async () => {
  const onRowAction = vi.fn();
  // render EmployersTable with one employer (id 'e1') + onRowAction={onRowAction}, mirroring the existing tests' setup
  // open the row's "More" kebab, then click "View drives"
  const user = userEvent.setup();
  await user.click(screen.getByTitle('More'));
  await user.click(screen.getByText(/View drives/i));
  expect(onRowAction).toHaveBeenCalledWith('view-drives', 'e1');
});
```
(Match the existing test file's exact render/props setup — reuse its employer fixture and the way it mounts `EmployersTable`.)

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: Add the action** — in `client/src/pages/Employers/EmployersTable.tsx`:
  - Extend the union: `export type EmployerRowAction = 'edit' | 'approve' | 'disable' | 'view-drives';`
  - Add a kebab menu item (near the Edit item in the `.kebab-menu`): `<button onClick={() => act('view-drives', x.id)}><i className="ti ti-calendar-event" /> View drives</button>`

- [ ] **Step 4: Wire the page** — in `client/src/pages/Employers/index.tsx`, in `handleRowAction`, add: `if (action === 'view-drives') { navigate(`/slots?employerId=${id}`); return; }` (near the top of the handler; `navigate` is already in scope).

- [ ] **Step 5: Run — expect PASS** — `npm test -w client -- EmployersTable`. Then `npx -w client tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Employers/EmployersTable.tsx client/src/pages/Employers/index.tsx client/src/test/EmployersTable.test.tsx
git commit -m "feat(client): 'View drives' employer row action -> Slots filtered by employer"
```

---

## Task 4: Full-suite verification + live E2E smoke

**Files:** none (verification only). Controller performs the seed run + smoke against an ISOLATED DB (not the shared `matchday`).

- [ ] **Step 1: Full suites** (worktree) — `npm test -w server && npm test -w client`.
- [ ] **Step 2: Type-check both + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Seed + smoke against an isolated DB** (controller): `MONGODB_URI=mongodb://localhost:27017/matchday_empdrive_smoke npm run seed -w server` (verifies the seed runs clean without the removed field); start the worktree server on a spare port + that DB; then with a fresh admin token:
  - `GET /api/employers` → each item's `activeDrives` is the derived distinct-drive count (compare a chosen employer's `activeDrives` to `Slot.distinct('driveId', {employerId})` length in the DB — they match; values are the real ~1–3, not a uniform 0–4).
  - `GET /api/employers?sort=drives&order=desc` → ordered by the derived count.
  - Confirm no `activeDrives` field persists on employer docs in the DB (removed).
  - Stop the server, drop `matchday_empdrive_smoke`.
- [ ] **Step 4: No commit** (verification task).

---

## Self-Review Notes (author)

- **Spec coverage:** derive activeDrives (list) → T1; remove stored field + seed → T1; sort by derived → T1 (existing in-memory sort already keys on the item's activeDrives — deriving into the item is sufficient, no sort-logic change); SlotsPage ?employerId= → T2; "View drives" action + navigate → T3; E2E → T4.
- **`getEmployer` unchanged:** it returns the raw doc and the client never reads `activeDrives` from it (no get-by-id hook; edit modal uses list data). After field removal it omits `activeDrives` — acceptable, not consumed. Noted so the reviewer doesn't flag the list/get asymmetry (documented deliberate scope).
- **Sort correctness:** the existing `listEmployers` sorts the mapped `items` in memory via `SORT_KEY.drives = 'activeDrives'`; since we now populate `items[].activeDrives` from the derivation before that sort, `sort=drives` orders by the real count with zero sort-code change.
- **No new schema / migration / CC change.** Derived-on-read, so nothing to drift.
- **Type note:** removing `activeDrives` from the model drops it from `EmployerDoc`; the only reader was the list mapping (now replaced by the derived map), so `tsc` stays clean. `EmployerListItem` keeps `activeDrives: number` (client type unchanged).
- **Shared-DB safety:** seed edits are `tsc`-verified only during the build; the actual seed run + smoke happen against an isolated DB in T4 (controller), never the user's shared `matchday` DB.
