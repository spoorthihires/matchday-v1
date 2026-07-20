# Employer Portal — Slice 3 (Registration Wizard + Tracker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The employer registers to hire for a role in an Active drive (a multi-step wizard) → an `employerId`-linked `RegistrationRequest` in the admin approval queue → tracked in a registrations list; the dashboard registrations widget goes live.

**Architecture:** `RegistrationRequest` gains `employerId` + a typed `details` subdoc. New employer-scoped writes/reads in the `employerPortal` module (create/list/detail registrations), under the existing employer gate. Admin `upsertEmployerFrom` becomes `employerId`-aware (reuse the linked employer). Client: a registration wizard (from the drive-detail Register CTA) + a tracker (wired to the "Registrations" nav), mirroring the Slice-1 signup wizard.

**Tech Stack:** Express 4 + Mongoose 8 + zod (server, TS strict, ESM `.js`); React 18 + react-router-dom 6 + @tanstack/react-query 5 (client); vitest + mongodb-memory-server + @testing-library/react.

## Global Constraints

- TS strict; ESM `.js`; `tsc --noEmit` clean (server + client); error contract `{error:{message,code}}` (zod→400, role→403, not-found→404).
- **Server-authoritative identity:** `company`/`industry`/`submittedBy`/`employerId` on a created registration come from the auth'd Employer (JWT `sub`), NEVER the client body.
- New employer routes go under the existing `.use('/employer', requireAuth, requireRole('employer'))` gate (Slice 1) — no new middleware. Admin `/api/registrations` and its UI stay unchanged except the `upsertEmployerFrom` linkage.
- Drive must be `status ∈ {Active,Published}` AND `visibility.employerReg !== 'Closed'` to register → else 400 `not_registerable`. Duplicate guard: 400 `already_registered` if a non-closed reg exists for (employerId, driveId).
- JD upload is a STUB (text/filename; no storage). Tracker is view-only.
- Client employer screens render inside `EmployerShell` (route-wrapped, provides `.employer-app`) — NO double-wrap. **CSS gotcha:** any `.err-msg` needs `.show-err` toggled on its `.field` (Slice-1).
- Port markup from committed `Matchday_Employer.html`: wizard `page-registration` 2919–3140; tracker `page-registrations` 3140–3160. Mirror the Slice-1 `EmployerSignup.tsx` multi-step pattern (step state + per-step fields + chip inputs).
- Commit messages end with exactly:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work exclusively in the worktree `/Users/srinivasarao.kandula/code/matchday-employer3` (branch `feat/employer-portal-slice3`, off `origin/main`). Never run `npm run seed` against the shared DB — seed RUN only in Task 5 against an isolated DB.

---

### Task 1: Server — RegistrationRequest model + create-registration endpoint (+ test)

**Files:**
- Modify: `server/src/models/RegistrationRequest.ts`
- Modify: `server/src/modules/employerPortal/employerPortal.service.ts`, `.controller.ts`, `.routes.ts`
- Test: `server/test/employer-registrations.route.test.ts`

- [ ] **Step 1: Model** — in `RegistrationRequest.ts` add `employerId: { type: Schema.Types.ObjectId, ref: 'Employer', default: null }` and a `detailsSchema` subdoc (`new Schema({...}, { _id:false })`) assigned to a `details` field:
```ts
const detailsSchema = new Schema({
  roleDescription: { type: String, default: '' },
  deadline: { type: String, default: '' }, urgency: { type: String, default: '' },
  goodToHave: { type: [String], default: [] }, qualification: { type: String, default: '' },
  gradYearFrom: { type: Number, default: null }, gradYearTo: { type: Number, default: null },
  expMin: { type: Number, default: null }, expMax: { type: Number, default: null },
  ctcMin: { type: Number, default: null }, ctcMax: { type: Number, default: null },
  stipend: { type: Number, default: null }, cities: { type: [String], default: [] },
  workMode: { type: String, default: '' }, officeLocation: { type: String, default: '' },
  rounds: { type: Number, default: null }, roundNames: { type: String, default: '' },
  preferredWednesday: { type: String, default: '' }, timeSlot: { type: String, default: '' },
  minEvalScore: { type: Number, default: null }, mandatorySkills: { type: [String], default: [] },
}, { _id: false });
```
Add to `registrationSchema`: `employerId: { type: Schema.Types.ObjectId, ref: 'Employer', default: null }`, `details: { type: detailsSchema, default: () => ({}) }`. Keep all existing fields.

- [ ] **Step 2: Failing test** — `server/test/employer-registrations.route.test.ts` (copy the `createApp`+`signToken` harness from `employer-drives.route.test.ts`; make an `Employer` + employer token, a `Drive`). Assert:
  - POST `/api/me/employer/registrations` with `{ driveId, role:'Data Analyst', openings:3, ctcMin:8, ctcMax:14, mustHave:['SQL'], preferredWednesday:'Jul 22', timeSlot:'10:00–12:00', jd:'jd.pdf', details:{ urgency:'High', cities:['Hyderabad'] } }` → 201; the created reg has `company === employer.name`, `industry === employer.industry`, `employerId === employer._id`, `ctcRange === '8–14 LPA'`, `skills === ['SQL']`, `slot === 'Jul 22 · 10:00–12:00'`, `status === 'Pending review'`, `details.urgency === 'High'`.
  - It shows up in the admin `listRegistrations` (query RegistrationRequest directly or the admin endpoint).
  - A `Closed`-employerReg drive → 400 `not_registerable`; a Draft drive → 400.
  - A second POST for the same drive (while the first is Pending) → 400 `already_registered`.
  - `requireRole('employer')` gates it (403 for an admin token, 401 no token).
  - The client CANNOT spoof company: POST with a bogus `company:'EvilCo'` in the body → the stored `company` is still the employer's real name.

- [ ] **Step 3: Service** — in `employerPortal.service.ts` add (import `RegistrationRequest`, `Drive`, `Employer` already/also):
```ts
export async function createEmployerRegistration(employerId: string, input: RegistrationInput) {
  const emp = await Employer.findById(employerId);
  if (!emp) throw new HttpError(404, 'Employer not found', 'not_found');
  if (!Types.ObjectId.isValid(input.driveId)) throw new HttpError(400, 'Invalid drive', 'validation');
  const drive = await Drive.findById(input.driveId);
  if (!drive || !['Active', 'Published'].includes(drive.status) || drive.visibility?.employerReg === 'Closed') {
    throw new HttpError(400, 'This drive is not open for registration', 'not_registerable');
  }
  const dup = await RegistrationRequest.findOne({ employerId: emp._id, driveId: drive._id, status: { $in: ['Pending review', 'Approved', 'Changes requested'] } });
  if (dup) throw new HttpError(400, 'You already have an active registration for this drive', 'already_registered');
  const submittedBy = emp.spoc || emp.name;
  const reg = await RegistrationRequest.create({
    company: emp.name, industry: emp.industry, submittedBy, employerId: emp._id,
    driveId: drive._id, driveName: drive.name, role: input.role, openings: input.openings ?? 1,
    ctcRange: input.ctcMin != null && input.ctcMax != null ? `${input.ctcMin}–${input.ctcMax} LPA` : '',
    skills: input.mustHave ?? [], slot: [input.preferredWednesday, input.timeSlot].filter(Boolean).join(' · '),
    jd: input.jd ?? '', status: 'Pending review',
    activity: [{ action: 'Submitted', by: submittedBy, at: new Date() }],
    details: input.details ?? {},
  });
  return { id: String(reg._id), status: reg.status, driveName: reg.driveName, role: reg.role };
}
```
(Define `RegistrationInput` type in the schema file.)

- [ ] **Step 4: Schema + controller + route** — add `createRegistrationSchema` (zod: `driveId` string required; `role` min1; `openings` int optional; `ctcMin`/`ctcMax`/etc. numbers optional; `mustHave` string[] optional; `preferredWednesday`/`timeSlot`/`jd` optional; `details` an object of the rich fields, all optional — a passthrough `z.object({...}).partial()` or `z.record(...)`; keep it explicit). Controller `createEmployerRegistrationController` parses the body, calls `createEmployerRegistration(req.userId, parsed)`, returns 201. Route: `employerPortalRoutes.post('/employer/registrations', asyncHandler(createEmployerRegistrationController))` (under the existing gate; place with the other `/employer/*` routes).

- [ ] **Step 5: GREEN + tsc + full suite + commit** — `npm test -w server -- employer-registrations`; `npx -w server tsc --noEmit`; `npm test -w server`. Commit `feat(server): employer registration create (employerId-linked) + RegistrationRequest.details`.

---

### Task 2: Server — registration tracker + admin employerId linkage + dashboard fill (+ tests)

**Files:**
- Modify: `server/src/modules/employerPortal/employerPortal.service.ts`, `.controller.ts`, `.routes.ts` (tracker list/detail + dashboard fill)
- Modify: `server/src/modules/registrations/registrations.service.ts` (`upsertEmployerFrom` employerId-aware)
- Test: extend `server/test/employer-registrations.route.test.ts`; new `server/test/registrations-employer-link.test.ts`

- [ ] **Step 1: Tracker endpoints** — service:
```ts
export async function listEmployerRegistrations(employerId: string) {
  const rows = await RegistrationRequest.find({ employerId }).sort({ createdAt: -1 }).lean();
  return { items: rows.map((r) => ({ id: String(r._id), driveId: String(r.driveId ?? ''), driveName: r.driveName ?? '', role: r.role, openings: r.openings ?? 0, status: r.status, submittedAt: new Date(r.createdAt).toISOString(), latestActivity: r.activity?.[0]?.action ?? '' })) };
}
export async function getEmployerRegistration(employerId: string, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Registration not found', 'not_found');
  const r = await RegistrationRequest.findById(id).lean();
  if (!r || String(r.employerId) !== String(employerId)) throw new HttpError(404, 'Registration not found', 'not_found');
  return { id: String(r._id), driveName: r.driveName, role: r.role, openings: r.openings, ctcRange: r.ctcRange, skills: r.skills, slot: r.slot, jd: r.jd, status: r.status, submittedAt: new Date(r.createdAt).toISOString(), activity: (r.activity ?? []).map((a) => ({ action: a.action, by: a.by, at: new Date(a.at).toISOString() })), details: r.details ?? {} };
}
```
Controllers + routes: `GET /employer/registrations`, `GET /employer/registrations/:id` (both call with `req.userId`). Register these routes (place `/employer/registrations` + `/:id` BEFORE the bare `/employer`, and note `/employer/registrations` must not be shadowed by `/employer/drives/:id` — they're distinct literals, fine).

- [ ] **Step 2: Dashboard fill** — in `getEmployerPortal`, replace `registrations: []` with a real fetch: `RegistrationRequest.find({ employerId }).sort({ createdAt: -1 }).limit(5)` → `.map((r) => ({ id, driveName, role, status }))`. (Import RegistrationRequest.)

- [ ] **Step 3: Admin employerId-aware upsert** — in `registrations.service.ts`, change `upsertEmployerFrom` to accept `reg` incl. `employerId` and prefer it:
```ts
async function upsertEmployerFrom(reg: { company: string; industry: string; submittedBy: string; employerId?: Types.ObjectId | null }, actor: string) {
  if (reg.employerId) {
    const emp = await Employer.findById(reg.employerId);
    if (emp) { if (emp.status === 'Pending') { emp.status = 'Active'; await emp.save(); } return; }
  }
  // fallback: name-match/create (unchanged)
  const escaped = reg.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await Employer.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
  if (existing) return;
  const created = await Employer.create({ name: reg.company, industry: reg.industry, spoc: reg.submittedBy, status: 'Active' });
  await AuditLog.create({ entityType: 'employer', entityId: created._id, action: 'created', actor, detail: 'Created from registration approval' });
}
```
`applyAction`'s approve branch already passes `reg` — confirm it passes the full doc (with `employerId`); it does (`upsertEmployerFrom(reg, actor)`).

- [ ] **Step 4: Tests** —
  - Extend `employer-registrations.route.test.ts`: tracker lists only the caller's registrations (create for two employers, each sees only theirs); `/:id` 404s for another employer's reg; 403 for admin token.
  - `registrations-employer-link.test.ts`: an `employerId`-linked reg approved via the admin `applyAction` (or the admin endpoint) → NO new Employer created (count unchanged) + a Pending linked employer becomes Active; a null-`employerId` reg still name-matches/creates (fallback intact). Dashboard: `getEmployerPortal` returns non-empty `dashboard.registrations` for an employer with a reg.

- [ ] **Step 5: GREEN + tsc + full suite + commit** — `npm test -w server`; `npx -w server tsc --noEmit`. Commit `feat(server): employer registration tracker + employerId-aware approval + live dashboard registrations`.

---

### Task 3: Client — types + hooks + registration WIZARD + rewire Register CTA (+ test)

**Files:**
- Modify: `client/src/types/employer.ts`, `client/src/App.tsx`, `client/src/pages/EmployerPortal/EmployerDriveDetail.tsx`
- Create: `client/src/pages/EmployerPortal/hooks/useEmployerRegistrations.ts`, `client/src/pages/EmployerPortal/EmployerRegister.tsx`
- Test: `client/src/test/EmployerRegister.test.tsx`

- [ ] **Step 1: Types** — `RegistrationInput` (driveId + role + openings + ctcMin/Max + mustHave[] + preferredWednesday + timeSlot + jd + `details:{…}`), `EmployerRegistrationItem` (tracker row), `EmployerRegistrationDetail`.
- [ ] **Step 2: Hooks** — `useEmployerRegistrations()` (GET `/me/employer/registrations`), `useEmployerRegistration(id)` (GET `/:id`), `useCreateRegistration()` (mutation POST `/me/employer/registrations`; on success invalidate `['employer-registrations']` + `['employer-portal']`). Mirror the existing hook + mutation shapes (`useSlotBookings`/`useBookingMutations` in the admin app show the mutation pattern).
- [ ] **Step 3: Failing wizard test** — `EmployerRegister.test.tsx` (harness from `EmployerSignup.test.tsx` / `EmployerDriveDetail.test.tsx`): render `EmployerRegister` at `/employer/drives/d1/register` (route param); stub `/me/employer/drives/d1` (the drive-context fetch) + `/me/employer/registrations` POST → 201. Assert: step validation blocks Next when a required field (role) is empty; completing the steps + submit POSTs the expected body (driveId + role + ctcMin/Max + mustHave + details.*) and shows the "Registration submitted" success screen; a 400 (`already_registered`) shows the error inline.
- [ ] **Step 4: Wizard page** — `EmployerRegister.tsx` (`/employer/drives/:id/register`), mirroring `EmployerSignup.tsx`'s multi-step structure (a `step` state, per-step field states, chip inputs for mustHave/goodToHave/cities, per-step required-field validation with `.show-err` toggling). Steps ported from prototype `page-registration` (2919–3140): Role & JD (role*, jd [stub text/filename], roleDescription, openings*, deadline, urgency) → Eligibility (mustHave, goodToHave, qualification, gradYearFrom/To, expMin/Max) → Compensation (ctcMin*/ctcMax*, stipend) → Location (cities, workMode, officeLocation) → Schedule (rounds, roundNames, preferredWednesday, timeSlot) → Evaluation (minEvalScore, mandatorySkills) → Review + submit. Show the drive name (via `useEmployerDrive(id)`). On submit → `useCreateRegistration().mutateAsync({ driveId: id, role, openings, ctcMin, ctcMax, mustHave, preferredWednesday, timeSlot, jd, details:{…} })` → success screen (link to `/employer/registrations` + back to the drive). Inline `ApiError.message`. NO `.employer-app` wrapper (shell provides it).
- [ ] **Step 5: Rewire CTA + route** — `EmployerDriveDetail.tsx`: the "Register for this drive" CTA → `navigate('/employer/drives/'+id+'/register')` (was `/employer/coming-soon/register`); keep it gated on `canRegister`. `App.tsx`: add `/employer/drives/:id/register` under `<RoleRoute role="employer"><EmployerShell><EmployerRegister/></EmployerShell></RoleRoute>` (distinct from `/employer/drives/:id`).
- [ ] **Step 6: GREEN + tsc + full client suite + commit** — `npm test -w client -- EmployerRegister`; `npx -w client tsc --noEmit`; `npm test -w client`. Commit `feat(client): employer registration wizard + Register CTA`.

---

### Task 4: Client — registration TRACKER + nav (+ test)

**Files:**
- Create: `client/src/pages/EmployerPortal/EmployerRegistrations.tsx`
- Modify: `client/src/App.tsx`, `client/src/pages/EmployerPortal/EmployerShell.tsx`
- Test: `client/src/test/EmployerRegistrations.test.tsx`

- [ ] **Step 1: Failing test** — `EmployerRegistrations.test.tsx`: stub `/me/employer/registrations` → `{ items:[{…status:'Pending review'},{…status:'Approved'}] }`; render `EmployerRegistrations`; assert the rows + status badges render; the empty case (`items:[]`) shows the empty state.
- [ ] **Step 2: Tracker page** — `EmployerRegistrations.tsx` (`/employer/registrations`), via `useEmployerRegistrations()`. Ported from prototype `page-registrations` (3140–3160): a list/table — drive/role/openings, a status badge (map status → the prototype's badge classes: Pending review/Approved/Rejected/Changes requested), submitted date, latest activity. Empty state. Loading/error. Renders inside `EmployerShell`.
- [ ] **Step 3: Route + nav** — `App.tsx`: `/employer/registrations` under `<RoleRoute role="employer"><EmployerShell><EmployerRegistrations/></EmployerShell></RoleRoute>`. `EmployerShell.tsx`: "Registrations" nav → `/employer/registrations` (was coming-soon) + active state.
- [ ] **Step 4: GREEN + tsc + full client suite + commit** — `npm test -w client -- EmployerRegistrations`; `npx -w client tsc --noEmit`; `npm test -w client`. Commit `feat(client): employer registration tracker + nav`.

---

### Task 5: Full-suite verification + live E2E smoke (isolated DB)

- [ ] **Step 1:** `npm test -w server && npm test -w client`.
- [ ] **Step 2:** `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: seed + smoke** (isolated DB `matchday_employer3_smoke`): employer demo login → token; pick an Active drive:
  - `POST /api/me/employer/registrations` (valid) → 201; appears in `GET /api/me/employer/registrations` (tracker) AND the admin `GET /api/registrations` (admin token) with `employerId` set.
  - Duplicate POST → 400 `already_registered`. A Closed/Draft drive → 400.
  - Admin approves the reg (admin `POST /api/registrations/:id/action {action:'approve'}`) → the linked Employer reused: `Employer.countDocuments` unchanged before/after, the linked employer is Active.
  - `GET /api/me/employer` → `dashboard.registrations` non-empty.
  - admin token → 403 on the employer routes.
  - Stop server; drop the smoke DB; confirm shared `matchday` untouched.
- [ ] **Step 4:** No commit.

---

## Self-Review Notes (author)

- **Spec coverage:** model + create → T1; tracker + admin linkage + dashboard fill → T2; wizard + CTA rewire → T3; tracker page + nav → T4; E2E → T5.
- **Server-authoritative identity:** company/industry/submittedBy/employerId from the auth'd employer, never the body (a T1 test asserts a spoofed `company` is ignored).
- **Admin compatibility:** the flat fields the admin queue reads are mapped; `details` holds the rich fields; the admin UI is untouched save the `employerId`-aware upsert (fallback preserved).
- **Guards:** not-registerable (Closed/Draft) + duplicate (soft, per employer+drive) both 400 with distinct codes.
- **Reuse:** the wizard mirrors `EmployerSignup.tsx`; endpoints under the existing employer gate; the drive-detail CTA is rewired (not rebuilt). JD is a stub. Tracker view-only.
- **Type consistency:** server projections ↔ client `EmployerRegistration*` types; the create payload ↔ `RegistrationInput` ↔ `createRegistrationSchema`.
- **CSS gotcha:** wizard `.err-msg` must toggle `.show-err` on the `.field` (Slice-1).
