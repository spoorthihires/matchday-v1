# Employer Portal — Slice 3 (Registration Wizard + Tracker) — MERN Slice Design

**Date:** 2026-07-20
**Status:** Approved design, pending implementation plan
**Depends on:** Slices 1 + 2 (employer auth + shell + dashboard + drive marketplace/detail), merged to `main` @2a937e8. Off `origin/main` (no stacking). Reuses `Drive`, `Employer`, `RegistrationRequest`, the `employerPortal` module, `EmployerShell`, and the admin registrations approval flow.
**Context:** Third of ~10 employer-portal slices, and the **first employer WRITE flow**. From the drive-detail "Register for this drive" CTA, the employer fills a multi-step registration wizard to hire for a role in a drive, creating a `RegistrationRequest` that feeds the existing admin approval queue; a tracker shows the employer's own registrations + statuses. Resolves the long-standing "`RegistrationRequest` has no `employerId`" gap.

## 1. Goal & Scope

An employer registers to hire for a role in an Active drive (a rich multi-step wizard), producing an `employerId`-linked `RegistrationRequest` in the admin approval queue, and tracks their registrations' statuses.

### In scope
- **`RegistrationRequest` +`employerId` + `details` subdoc** — full-fidelity persistence of the wizard's rich fields; existing flat fields kept (admin queue reads them).
- **`POST /api/me/employer/registrations`** — create a registration for a drive (server-authoritative company/industry/submittedBy/employerId from the auth'd employer; core fields mapped; details stored; validation + duplicate guard).
- **`GET /api/me/employer/registrations`** (+ `/:id`) — the employer's own registrations (tracker + detail).
- **Admin `upsertEmployerFrom` becomes `employerId`-aware** — approval reuses the linked Employer (no duplicate).
- **Dashboard `registrations` widget goes live** — `getEmployerPortal` fills the Slice-1 placeholder from real data.
- **Client:** the multi-step registration wizard (reached by rewiring the Slice-2 Register CTA) + the registration tracker (wire the "Registrations" nav).

### Out of scope (later slices / deferred)
- Slot booking (Slice 4); candidates/passport/consent + the `Application` entity (Slice 5).
- Real file storage for JD — **JD upload is a stub** (a text field / filename; no storage).
- Editing/withdrawing a submitted registration — the tracker is **view-only** for now.
- Any change to the admin approval **UI** beyond the `employerId`-aware upsert; the admin queue continues to work unchanged otherwise.

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Persistence | `employerId` + a typed `details` subdoc (full fidelity) + map core fields the admin reads |
| Admin linkage | Approval prefers `employerId` (reuse the exact Employer, no duplicate) |
| Company/industry/submittedBy | Server-authoritative from the auth'd employer profile (NOT client-supplied) |
| JD upload | Stub (text/filename; no file storage) |
| Duplicate guard | 400 if a non-closed (Pending review/Approved/Changes requested) reg exists for the same (employer, drive) |
| Tracker | View-only list + detail; wired to the "Registrations" nav |
| Dashboard | The `registrations` placeholder now filled from real data |

## 3. Server changes

### 3.1 `RegistrationRequest` model — `server/src/models/RegistrationRequest.ts`
- Add `employerId: { type: Schema.Types.ObjectId, ref: 'Employer', default: null }`.
- Add a typed `details` subdoc (`{_id:false}`, all fields optional with sensible defaults): `roleDescription`, `deadline` (String, an ISO/`YYYY-MM-DD` date from the date input — stored as a string, no parsing), `urgency`, `goodToHave: [String]`, `qualification`, `gradYearFrom: Number`, `gradYearTo: Number`, `expMin: Number`, `expMax: Number`, `ctcMin: Number`, `ctcMax: Number`, `stipend: Number`, `cities: [String]`, `workMode`, `officeLocation`, `rounds: Number`, `roundNames: String`, `preferredWednesday: String`, `timeSlot: String`, `minEvalScore: Number`, `mandatorySkills: [String]`.
- Keep all existing flat fields (`company/industry/role/driveId/driveName/openings/ctcRange/skills/slot/panel/jd/submittedBy/status/activity/createdAt`).

### 3.2 Employer registration create — `employerPortal` module
- **`POST /api/me/employer/registrations`** (under the existing `.use('/employer', requireAuth, requireRole('employer'))` gate). zod-validated wizard payload (incl. `driveId` + role/openings/ctcMin/ctcMax/mustHave[]/preferredWednesday/timeSlot/jd + all `details` fields). Service `createEmployerRegistration(employerId, input)`:
  - Resolve the auth'd `Employer` (from `employerId` = JWT sub) → 404 if missing. Resolve the `Drive` (from `input.driveId`); require `status ∈ {Active, Published}` AND `visibility.employerReg !== 'Closed'` → else 400 (`not_registerable`).
  - **Duplicate guard:** if a `RegistrationRequest` with `{ employerId, driveId, status ∈ {Pending review, Approved, Changes requested} }` exists → 400 (`already_registered`).
  - Create the `RegistrationRequest`: `company = employer.name`, `industry = employer.industry`, `submittedBy = employer.spoc || employer.name`, `employerId`, `driveId`, `driveName = drive.name`; core mapped fields (`role`, `openings`, `ctcRange = "{ctcMin}–{ctcMax} LPA"`, `skills = mustHave`, `slot = "{preferredWednesday} · {timeSlot}"`, `jd`); `details = {…rich fields}`; `status:'Pending review'`; `activity: [{ action:'Submitted', by: submittedBy, at: now }]`. Return the created registration (safe shape). 201.

### 3.3 Employer registration tracker — `employerPortal` module
- **`GET /api/me/employer/registrations`** — `RegistrationRequest.find({ employerId }).sort({ createdAt: -1 })` → tracker projection `{ id, driveId, driveName, role, openings, status, submittedAt, latestActivity }`.
- **`GET /api/me/employer/registrations/:id`** — the employer's own registration detail (404 if not found OR `employerId` ≠ the caller — never expose another employer's registration); echoes the flat fields + `details`.

### 3.4 Admin linkage — `server/src/modules/registrations/registrations.service.ts`
- `upsertEmployerFrom` gains access to `reg.employerId`: **if `employerId` is set**, `Employer.findById(employerId)`; if found, set `status:'Active'` if it was Pending (activate on approval) and return (no create). **Else** fall back to the existing name-match/create behavior. Pass the full `reg` (with `employerId`) from `applyAction`'s approve branch. No other admin change.

### 3.5 Dashboard widget — `getEmployerPortal`
- Fill `dashboard.registrations` (currently `[]`) from `RegistrationRequest.find({ employerId }).sort({ createdAt: -1 }).limit(5)` → a small projection `{ id, driveName, role, status }`. The Slice-1 dashboard's registrations card renders these instead of the empty state when present.

## 4. Client changes

### 4.1 Registration wizard — `client/src/pages/EmployerPortal/EmployerRegister.tsx` (`/employer/drives/:id/register`)
- Reached by rewiring the Slice-2 drive-detail "Register for this drive" CTA from `/employer/coming-soon/register` → `/employer/drives/:id/register` (carry the `driveId`). Route gated `RoleRoute role="employer"` inside `EmployerShell`.
- Multi-step wizard ported from prototype `page-registration` (2919–3140): **Role & JD → Eligibility → Compensation → Location → Schedule/Rounds → Evaluation → Review**. Fields per §3.1/§3.2; chip inputs for skills/cities; **JD is a text field / stubbed filename** (no upload). Per-step "Next" validates that step's required fields (respect the Slice-1 `.show-err` CSS gotcha for any `.err-msg`). The drive context (name) is shown (fetch via `useEmployerDrive(id)`).
- On final submit: `apiFetch('/me/employer/registrations', { method:'POST', body })` → a "Registration submitted" success screen (ported from the `<h2>Registration submitted` step) with links to the tracker + back to the drive. Surface `ApiError.message` inline (Closed drive / duplicate).
- A React Query mutation hook `useCreateRegistration()` that invalidates `['employer-registrations']` + `['employer-portal']` on success. (Global error toast from the app-wide surface applies; keep an inline error too.)

### 4.2 Registration tracker — `client/src/pages/EmployerPortal/EmployerRegistrations.tsx` (`/employer/registrations`)
- `useEmployerRegistrations()` → `GET /me/employer/registrations`. Ported from `page-registrations` (3140–3160): a list/table of the employer's registrations — drive/role/openings, a status badge (Pending review/Approved/Rejected/Changes requested), submitted date, latest activity. Empty state ("No registrations yet — register for a drive to get started."). Rows link to a detail (or the drive). Renders inside `EmployerShell`.
- Wire the shell's **"Registrations"** nav item to `/employer/registrations` (was → coming-soon) + active state.

### 4.3 Types + hooks
- `client/src/types/employer.ts`: `RegistrationInput` (the wizard payload), `EmployerRegistrationItem` (tracker), `EmployerRegistrationDetail`.
- `hooks/useEmployerRegistrations.ts`: `useEmployerRegistrations()` (list), `useEmployerRegistration(id)` (detail), `useCreateRegistration()` (mutation).

## 5. Testing (TDD)

- **Server:**
  - `createEmployerRegistration`: maps the payload (company/industry/submittedBy/employerId from the profile — NOT the client; ctcRange/skills/slot derived; details stored); a Closed or Draft/Archived drive → 400; the duplicate guard → 400 on a second non-closed reg for the same (employer, drive); a first registration succeeds + shows in the admin `listRegistrations`.
  - tracker: `GET /registrations` returns only the caller's registrations; `/:id` 404s for another employer's reg; `requireRole('employer')` gates all three (403 admin).
  - admin: `applyAction` approve on an `employerId`-linked reg reuses that Employer (no new Employer created; a Pending employer is activated); the name-match fallback still works when `employerId` is null.
  - dashboard: `getEmployerPortal.dashboard.registrations` is populated for an employer with registrations.
  - Fixtures via mongodb-memory-server.
- **Client:** wizard step validation blocks advance on missing required fields; a full submit posts the expected mapped body (core + a couple of details) and shows the success screen; a server 400 (duplicate) shows inline. Tracker renders status badges from a mocked list + the empty state. The drive-detail Register CTA now navigates to `/employer/drives/:id/register`.
- **E2E (isolated DB):** employer registers for an Active drive → 201; appears in `GET /me/employer/registrations` (tracker) AND the admin `GET /api/registrations` (with `employerId`); admin approves → the same Employer is reused (count unchanged, status Active); a Closed drive → 400; a duplicate → 400.

## 6. File Structure (indicative)

```
server/src/
  models/RegistrationRequest.ts                # + employerId + details subdoc
  modules/employerPortal/{service,controller,routes,schemas?}.ts  # + create/list/detail registrations
  modules/registrations/registrations.service.ts  # upsertEmployerFrom employerId-aware
server/test/
  employer-registrations.route.test.ts, registrations-employer-link.test.ts  # NEW/extend
client/src/
  types/employer.ts                            # + registration types
  pages/EmployerPortal/hooks/useEmployerRegistrations.ts  # NEW
  pages/EmployerPortal/EmployerRegister.tsx    # NEW — wizard
  pages/EmployerPortal/EmployerRegistrations.tsx  # NEW — tracker
  pages/EmployerPortal/EmployerDriveDetail.tsx # Register CTA → /employer/drives/:id/register
  pages/EmployerPortal/EmployerShell.tsx       # Registrations nav → /employer/registrations
  App.tsx                                      # + 2 routes
client/src/test/
  EmployerRegister.test.tsx, EmployerRegistrations.test.tsx  # NEW
```

## 7. Notes

- **Server-authoritative identity** — `company`/`industry`/`submittedBy`/`employerId` come from the auth'd employer, never the client, so a registration can't be spoofed onto another company.
- **Resolves the employerId gap** — the admin queue's requests now carry a real employer link; approval reuses it (no duplicate employers), and the tracker/dashboard filter by it.
- **Full fidelity, admin-compatible** — the rich wizard data lives in `details`; the flat fields the admin queue reads are mapped, so the existing admin approval UI keeps working with zero changes.
- **Duplicate guard is soft** — one open registration per (employer, drive); a Rejected one doesn't block re-registering.
- **JD stub** — honest: a text/filename field, no storage claimed.
- **Isolation/DB** — isolated worktree `/Users/srinivasarao.kandula/code/matchday-employer3`; seed RUN + smoke against an isolated DB in the E2E task; shared `matchday` untouched.
