# Employer Portal — Slice 2 (Drive Marketplace + Detail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employers browse Active/Published drives in a filterable marketplace and open a drive's detail (facts + eligibility + eval flow), via new employer-scoped read endpoints, inside the Slice-1 app shell.

**Architecture:** Extend the `employerPortal` module with `listEmployerDrives`/`getEmployerDrive` (employer projections over the existing `Drive`, Draft/Archived hidden), exposed at `GET /api/me/employer/drives` + `/:id` (already under the Slice-1 `.use('/employer', requireAuth, requireRole('employer'))` gate). Client: `useEmployerDrives`/`useEmployerDrive` hooks, an `EmployerDrives` marketplace page + an `EmployerDriveDetail` page, both inside `EmployerShell`; the shell "Drives" nav points to the marketplace.

**Tech Stack:** Express 4 + Mongoose 8 + zod (server, TS strict, ESM `.js`); React 18 + react-router-dom 6 + @tanstack/react-query 5 (client); vitest + mongodb-memory-server + @testing-library/react.

## Global Constraints

- TS strict; ESM `.js` suffixes; `tsc --noEmit` clean (server + client).
- Error contract `{error:{message,code}}`; zod → 400; role → 403; not-found → 404.
- Employer-scoped reads live in `employerPortal` (do NOT open the admin `/api/drives` to employers). All routes stay under the existing `.use('/employer', requireAuth, requireRole('employer'))` gate (Slice 1) — no new middleware.
- Marketplace = `status ∈ {Active, Published}` only; Draft/Archived never exposed to employers. `employerReg = visibility.employerReg`; `canRegister = employerReg !== 'Closed'`.
- Derived-never-stored projections; no new stored fields; no change to admin/jobseeker.
- Employer client screens render inside `EmployerShell` (which provides `.employer-app`); reuse the scoped employer CSS. **Watch-item:** any inline `.err-msg` needs `.show-err` toggled on its `.field` (Slice-1 CSS gotcha) — likely N/A here (read-only screens).
- Port markup/classes from the committed `Matchday_Employer.html`: `page-drives` 2776–2827 + the `renderDrives` card template (~line 4081); `page-drive-detail` 2827–2919.
- Commit messages end with exactly:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work exclusively in the worktree `/Users/srinivasarao.kandula/code/matchday-employer2` (branch `feat/employer-portal-slice2`, stacked on `feat/employer-portal-slice1`). Never run `npm run seed` against the shared DB — the seed RUN happens only in Task 4 against an isolated DB.

---

### Task 1: Server — employer drives list + detail endpoints (+ test)

**Files:**
- Modify: `server/src/modules/employerPortal/employerPortal.service.ts`, `.controller.ts`, `.routes.ts`
- Test: `server/test/employer-drives.route.test.ts`

**Interfaces:**
- Consumes: `Drive` model.
- Produces: `listEmployerDrives({ q?, domain? })`, `getEmployerDrive(id)`; routes `GET /api/me/employer/drives`, `GET /api/me/employer/drives/:id`.

- [ ] **Step 1: Write the failing route test** — `server/test/employer-drives.route.test.ts` (copy the harness from `server/test/employer-portal.route.test.ts` — `createApp` + `signToken`). Fixtures via `Drive.create`:
```ts
import { Drive } from '../src/models/Drive.js';
async function drive(over = {}) {
  return Drive.create({ name: 'D', domain: 'Data / ML', stream: 'B.Tech', status: 'Active',
    eventDates: [new Date('2026-08-05')], candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
    eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    evaluation: [{ key: 'mcq', enabled: true, config: {} }, { key: 'coding', enabled: false, config: {} }],
    visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' }, ...over });
}
// signToken for an employer: create an Employer, sign { sub, role:'employer' }

it('401 no token; 403 for an admin token', async () => {
  const r1 = await request(app).get('/api/me/employer/drives'); expect(r1.status).toBe(401);
  const admin = signToken({ sub: 'u1', role: 'admin' });
  const r2 = await request(app).get('/api/me/employer/drives').set('Authorization', `Bearer ${admin}`); expect(r2.status).toBe(403);
});
it('lists only Active+Published; filters by q and domain; carries employerReg/canRegister', async () => {
  await drive({ name: 'ActiveOne', status: 'Active' });
  await drive({ name: 'PublishedOne', status: 'Published' });
  await drive({ name: 'DraftOne', status: 'Draft' });
  await drive({ name: 'ClosedReg', status: 'Active', visibility: { employerReg: 'Closed', instituteVis: 'All institutes', candidateAccess: 'Public' } });
  const tok = employerToken; // from an Employer fixture
  const res = await request(app).get('/api/me/employer/drives').set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
  const names = res.body.items.map((d) => d.name);
  expect(names).toContain('ActiveOne'); expect(names).toContain('PublishedOne'); expect(names).not.toContain('DraftOne');
  const closed = res.body.items.find((d) => d.name === 'ClosedReg');
  expect(closed.employerReg).toBe('Closed'); expect(closed.canRegister).toBe(false);
  // q filter
  const q = await request(app).get('/api/me/employer/drives?q=ActiveOne').set('Authorization', `Bearer ${tok}`);
  expect(q.body.items.map((d) => d.name)).toEqual(['ActiveOne']);
});
it('detail returns facts+eligibility+evaluation for Active; 404 for Draft/nonexistent', async () => {
  const d = await drive({ name: 'DetailDrive', status: 'Active' });
  const draft = await drive({ status: 'Draft' });
  const tok = employerToken;
  const ok = await request(app).get(`/api/me/employer/drives/${d._id}`).set('Authorization', `Bearer ${tok}`);
  expect(ok.status).toBe(200);
  expect(ok.body).toMatchObject({ name: 'DetailDrive', domain: 'Data / ML' });
  expect(ok.body.eligibility.branches).toEqual(['CSE']);
  expect(ok.body.evaluation.find((e) => e.key === 'mcq').enabled).toBe(true);
  expect((await request(app).get(`/api/me/employer/drives/${draft._id}`).set('Authorization', `Bearer ${tok}`)).status).toBe(404);
  expect((await request(app).get(`/api/me/employer/drives/64b000000000000000000000`).set('Authorization', `Bearer ${tok}`)).status).toBe(404);
});
```

- [ ] **Step 2: Run — expect FAIL** — `npm test -w server -- employer-drives`.

- [ ] **Step 3: Service** — in `employerPortal.service.ts` add (self-contained month/date helper; do NOT couple to the admin drives module):
```ts
import { Drive } from '../../models/Drive.js';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function driveProjection(d: Record<string, any>, now: Date) {
  const dates = (d.eventDates ?? []).map((x: Date) => new Date(x));
  const upcoming = dates.filter((x: Date) => x >= now).sort((a: Date, b: Date) => +a - +b);
  const primary = upcoming[0] ?? dates.slice().sort((a: Date, b: Date) => +a - +b)[0] ?? null;
  const employerReg = d.visibility?.employerReg ?? 'Invite-only';
  return {
    id: String(d._id), name: d.name, domain: d.domain, stream: d.stream,
    month: primary ? `${MONTHS[primary.getUTCMonth()]} ${primary.getUTCFullYear()}` : '—',
    primaryEventDate: primary ? primary.toISOString() : null,
    eventDates: dates.map((x: Date) => x.toISOString()),
    candCap: d.candCap ?? 0, empCap: d.empCap ?? 0, slotCap: d.slotCap ?? 0,
    frequency: d.frequency, eventDay: d.eventDay, status: d.status,
    employerReg, canRegister: employerReg !== 'Closed',
  };
}

export async function listEmployerDrives(params: { q?: string; domain?: string }, now: Date = new Date()) {
  const match: Record<string, unknown> = { status: { $in: ['Active', 'Published'] } };
  if (params.domain) match.domain = params.domain;
  if (params.q && params.q.trim()) {
    const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { domain: rx }, { stream: rx }];
  }
  const rows = await Drive.find(match).sort({ createdAt: -1 }).lean();
  return { items: rows.map((d) => driveProjection(d as never, now)) };
}

export async function getEmployerDrive(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Drive not found', 'not_found');
  const d = await Drive.findById(id).lean();
  if (!d || !['Active', 'Published'].includes(d.status as string)) throw new HttpError(404, 'Drive not found', 'not_found');
  const base = driveProjection(d as never, new Date());
  return {
    ...base,
    eligibility: {
      sources: d.eligibility?.sources ?? [], branches: d.eligibility?.branches ?? [],
      gradYears: d.eligibility?.gradYears ?? [], expType: d.eligibility?.expType ?? '',
    },
    evaluation: (d.evaluation ?? []).map((e: Record<string, unknown>) => ({ key: e.key, enabled: !!e.enabled, config: e.config ?? {} })),
    streamId: d.streamId ? String(d.streamId) : null,
  };
}
```
(`Types`/`HttpError` are already imported in this file.)

- [ ] **Step 4: Controllers** — in `employerPortal.controller.ts`:
```ts
import { z } from 'zod';
import { listEmployerDrives, getEmployerDrive } from './employerPortal.service.js';
const drivesQuerySchema = z.object({ q: z.string().optional(), domain: z.string().optional() });
export async function employerDrivesController(req: Request, res: Response) {
  res.json(await listEmployerDrives(drivesQuerySchema.parse(req.query)));
}
export async function employerDriveController(req: Request, res: Response) {
  res.json(await getEmployerDrive(req.params.id));
}
```

- [ ] **Step 5: Routes** — in `employerPortal.routes.ts`, add (under the existing `.use('/employer', requireAuth, requireRole('employer'))` gate; place BEFORE the bare `/employer` GET to keep the more-specific paths first, mirroring the codebase convention):
```ts
employerPortalRoutes.get('/employer/drives', asyncHandler(employerDrivesController));
employerPortalRoutes.get('/employer/drives/:id', asyncHandler(employerDriveController));
employerPortalRoutes.get('/employer', asyncHandler(employerPortalController));
```

- [ ] **Step 6: GREEN + tsc + full suite** — `npm test -w server -- employer-drives`; `npx -w server tsc --noEmit`; `npm test -w server`. Commit.
```bash
git add server/src/modules/employerPortal/ server/test/employer-drives.route.test.ts
git commit -m "feat(server): employer drive marketplace + detail endpoints

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Client — types + hooks + marketplace page + nav/route wiring (+ test)

**Files:**
- Modify: `client/src/types/employer.ts`, `client/src/App.tsx`, `client/src/pages/EmployerPortal/EmployerShell.tsx`
- Create: `client/src/pages/EmployerPortal/hooks/useEmployerDrives.ts`, `client/src/pages/EmployerPortal/EmployerDrives.tsx`
- Test: `client/src/test/EmployerDrives.test.tsx`

- [ ] **Step 1: Types** — in `client/src/types/employer.ts` add:
```ts
export interface EmployerDriveListItem {
  id: string; name: string; domain: string; stream: string; month: string;
  primaryEventDate: string | null; eventDates: string[]; candCap: number; empCap: number; slotCap: number;
  frequency: string; eventDay: string; status: string; employerReg: string; canRegister: boolean;
}
export interface EmployerDrivesResponse { items: EmployerDriveListItem[] }
export interface EmployerDriveDetail extends EmployerDriveListItem {
  eligibility: { sources: string[]; branches: string[]; gradYears: number[]; expType: string };
  evaluation: { key: string; enabled: boolean; config: Record<string, number> }[];
  streamId: string | null;
}
```

- [ ] **Step 2: Hooks** — `hooks/useEmployerDrives.ts` (mirror `useEmployerPortal.ts`):
```ts
export function useEmployerDrives(params: { q?: string; domain?: string }) {
  const { token } = useAuth();
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString();
  return useQuery({ queryKey: ['employer-drives', params.q ?? '', params.domain ?? ''],
    queryFn: () => apiFetch<EmployerDrivesResponse>(`/me/employer/drives${qs ? `?${qs}` : ''}`, { token }), enabled: !!token });
}
export function useEmployerDrive(id: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['employer-drive', id],
    queryFn: () => apiFetch<EmployerDriveDetail>(`/me/employer/drives/${id}`, { token }), enabled: !!token && !!id });
}
```

- [ ] **Step 3: Failing marketplace test** — `client/src/test/EmployerDrives.test.tsx` (copy the harness from `EmployerDashboard.test.tsx` / `EmployerShell.test.tsx` — QueryClientProvider + AuthProvider + MemoryRouter + `vi.stubGlobal('fetch',…)`). Stub `/api/me/employer/drives` → `{ items:[{…ActiveOne, canRegister:true},{…ClosedReg, canRegister:false}] }`. Assert: cards render (names visible); a domain chip / search updates the request (the fetch is re-called with the query param — assert via the fetch mock URL); clicking "View" on a card navigates to `/employer/drives/<id>`.

- [ ] **Step 4: Marketplace page** — `EmployerDrives.tsx` (`/employer/drives`), ported from prototype `page-drives`:
  - `useEmployerDrives({ q, domain })` with local `q`/`domain` state (search input + domain chips: label→domain value map, e.g. `all`→'', `data`→'Data / Analytics', `ml`→'Machine Learning', etc. — match the seed's domain values; verify against the Drive `domain` set).
  - `.mkt-head` (title "Available MatchDay drives" + a privacy chip), `.mkt-filters` (search + chip-group), result count, `.drive-grid` of cards. Each card: name, domain+stream, key facts (month/primaryEventDate, capacities), a **Register** button (→ `navigate('/employer/coming-soon/register')`; if `!canRegister`, disable/hide it), a **View** button (→ `navigate('/employer/drives/'+id)`). Loading + empty states. NOTE: this renders inside `EmployerShell` (the route wraps it), so do NOT add another `.employer-app` wrapper.
- [ ] **Step 5: Route + nav** — in `App.tsx` add `/employer/drives` under `<RoleRoute role="employer"><EmployerShell><EmployerDrives/></EmployerShell></RoleRoute>`. In `EmployerShell.tsx`, change the "Drives" nav item to `navigate('/employer/drives')` (was coming-soon) and mark it active on `/employer/drives*`.
- [ ] **Step 6: GREEN + tsc + full client suite + commit** — `npm test -w client -- EmployerDrives`; `npx -w client tsc --noEmit`; `npm test -w client`. Commit `feat(client): employer drive marketplace + nav`.

---

### Task 3: Client — drive detail page (+ test)

**Files:**
- Create: `client/src/pages/EmployerPortal/EmployerDriveDetail.tsx`
- Modify: `client/src/App.tsx` (route)
- Test: `client/src/test/EmployerDriveDetail.test.tsx`

- [ ] **Step 1: Failing test** — `EmployerDriveDetail.test.tsx`: stub `/api/me/employer/drives/:id` → a detail object (facts + eligibility{branches:['CSE']} + evaluation[{mcq,enabled:true}]). Render at `/employer/drives/d1` (MemoryRouter with a route param). Assert: the name + a fact + the eligibility branch + an enabled eval stage render; the "Register for this drive" CTA navigates to `/employer/coming-soon/register`; "View slots" → `/employer/coming-soon/slots`. Also a 404 case (fetch → 404) renders a not-found message.
- [ ] **Step 2: Detail page** — `EmployerDriveDetail.tsx` (`/employer/drives/:id`), ported from `page-drive-detail`: `useEmployerDrive(useParams().id)`. Hero (name, status pill), facts panel (domain/stream/month/eventDates/caps/frequency/eventDay), eligibility panel (sources/branches/gradYears/expType), eval-flow panel (enabled `evaluation` stages in order). CTAs: Register → `/employer/coming-soon/register`; View slots → `/employer/coming-soon/slots`. Loading / error / 404 (isError) states. Renders inside `EmployerShell` (route wraps it).
- [ ] **Step 3: Route** — `App.tsx`: `/employer/drives/:id` under `<RoleRoute role="employer"><EmployerShell><EmployerDriveDetail/></EmployerShell></RoleRoute>`.
- [ ] **Step 4: GREEN + tsc + full client suite + commit** — `npm test -w client -- EmployerDriveDetail`; `npx -w client tsc --noEmit`; `npm test -w client`. Commit `feat(client): employer drive detail page`.

---

### Task 4: Full-suite verification + live E2E smoke (isolated DB)

- [ ] **Step 1:** `npm test -w server && npm test -w client`.
- [ ] **Step 2:** `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: seed + smoke** (isolated DB): `MONGODB_URI=mongodb://localhost:27017/matchday_employer2_smoke npm run seed -w server`; start the worktree server on a spare port + that DB; employer demo login → token:
  - `GET /api/me/employer/drives` → 200, items are all Active/Published (cross-check vs a DB count of `status ∈ {Active,Published}`), each has `employerReg`/`canRegister`.
  - `GET /api/me/employer/drives/:id` for an Active drive → 200 with eligibility+evaluation; for a Draft/Archived drive id → 404.
  - admin token → 403.
  - Stop server; drop `matchday_employer2_smoke`; confirm shared `matchday` untouched.
- [ ] **Step 4:** No commit.

---

## Self-Review Notes (author)

- **Spec coverage:** list+detail endpoints → T1; marketplace + nav → T2; detail → T3; E2E → T4.
- **Reuse the gate, not the admin module:** the new routes sit under the Slice-1 `.use('/employer', requireAuth, requireRole('employer'))`, so no new middleware and no admin-drives exposure. The month/date projection is inlined (self-contained) rather than coupling to `drives.service`.
- **Marketplace membership vs CTA:** status ∈ {Active,Published} for membership; `employerReg`→`canRegister` for the CTA — matches the confirmed decision and the Invite-only-heavy seed.
- **Read-only:** Register/View-slots CTAs → coming-soon placeholders (Slices 3/4).
- **Shell scope:** pages render inside `EmployerShell` (route-wrapped) which provides `.employer-app`; pages must NOT double-wrap.
- **Type consistency:** server projection ↔ `EmployerDriveListItem`/`EmployerDriveDetail`; hook queryKeys stable.
- **Domain chip mapping:** the marketplace chips map to real `Drive.domain` values — the implementer verifies the seed's domain set before hardcoding chip→domain mappings (if uncertain, a plain text filter over domain is acceptable).
