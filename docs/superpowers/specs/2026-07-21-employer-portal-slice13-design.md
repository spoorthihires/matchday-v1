# Employer Portal — Slice 13: Team Access / RBAC

**Date:** 2026-07-21
**Status:** Approved (scope self-decided under the user's "complete both remaining slices" mandate while away; the conservative/additive design below was chosen specifically to minimize blast radius on shared auth)
**Builds on:** 1 (employer auth branch, `/employer` gate, shell/settings entry points). **Stacked** on `feat/employer-portal-slice12` (worktree `~/code/matchday-employer13`).
**Prototype:** `Matchday_Employer.html` — Settings "Team members" card (`renderSettings` ~7286; `settingsState.team`/`TEAM_ROLES` ~7252-7269) + the RBAC page (`page-access` ~3308; `ACCESS_ROLES`/`rolePerms`/`renderAccess` ~7416-7505). CSS already ported: `.member-row`/`.member-av`/`.member-info`(`.mn`/`.me`)/`.member-x`, `.add-row`, `.role-badge`, `.access-note` (~1817-1862).

## Scope note (decomposition)
Last of the decomposed original "Slice 10" bundle (Reports=10/#35, Notifications=11/#36, Support=12/#37). This is **Team access / RBAC** — the final planned employer slice.

## Summary
Multiple **login users per employer org**, with **roles**. Today an `Employer` is a single account (one email + one `passwordHash`; the employer JWT `sub` = the Employer `_id`). This slice adds **`TeamMember`** accounts under an Employer, a login path for them, and an Admin-gated **Team & access** management surface.

**The design is deliberately additive so shared auth stays stable:** every employer login (owner or member) keeps `JWT.sub = employerId`, so **every existing employer endpoint continues to work unchanged**, org-scoped by `req.userId`. The only new claim is an optional `mid` (member id). Role/permission logic is confined entirely to the new team module.

**Decisions locked (self-decided):**
1. **`sub` stays the Employer `_id` for members too** — members act within their org; no existing endpoint changes. The member id rides as an optional `mid` claim.
2. **Owner login is implicitly Admin** — the original `Employer` account (no `mid`) always has full team-management rights. Consequence: there is no "last admin lockout" (the owner can always manage), so no last-admin guard is needed.
3. **Roles:** `['Admin','Recruiter','Interviewer','Viewer']` (from the prototype's `TEAM_ROLES`). **Only `Admin` (or the owner) may manage the team** (invite/role/remove); all roles can log in and use the portal. Fine-grained per-action permission enforcement across the rest of the portal is **out of scope** (a future slice) — this slice delivers team membership, login, and management gating; roles are recorded and gate team-management only.
4. **No email invite flow** (no email backend). "Add member" sets an **initial password** the admin chooses → the member is `Active` and can log in immediately. Documented stub.
5. **Entry = the Settings surface** — repoint the shell's Settings nav item + the topbar dropdown Settings button to `/employer/team`.

## Non-goals (deliberate)
- No change to how any EXISTING employer endpoint authorizes (all stay org-scoped by `req.userId = employerId`). No change to admin/jobseeker login.
- No fine-grained RBAC enforcement on non-team endpoints this slice (roles gate only team management); the prototype's full permission matrix is not wired to real enforcement.
- No email/invite tokens; no password reset; no SSO. No self-service member signup (an Admin adds members).
- No client `User`-shape change — a member logs in as `role:'employer'`, `id=employerId`; the Team page learns "can I manage?" from the API, not the stored user.

## Architecture

### Model (new)
`server/src/models/TeamMember.ts`:
```
{
  employerId: ObjectId ref Employer (required, indexed),
  name: String (required),
  email: String (required, unique, lowercased),
  passwordHash: String (default undefined),   // set on add; toJSON/toObject strip it
  role: enum ['Admin','Recruiter','Interviewer','Viewer'] (default 'Recruiter'),
  status: enum ['Active','Disabled'] (default 'Active'),
  createdAt: Date (default Date.now),
}
```
`email` unique index (global) — one login per email. `toJSON`/`toObject` transforms delete `passwordHash` (mirrors `Employer`).

### Auth extension (additive, minimal blast radius)
- **`signToken`** (`auth.service.ts`): payload type `{ sub: string; role: string; mid?: string }` (backward-compatible; existing callers omit `mid`).
- **`login`** (`auth.service.ts`): add a **`TeamMember` branch AFTER the `Employer` branch**, before the final `401`:
  - `TeamMember.findOne({ email: normalized })`; if it exists, has a `passwordHash`, and `status === 'Active'`, and the password verifies → `signToken({ sub: String(member.employerId), role: 'employer', mid: String(member._id) })`; `user = { id: employerId, name: member.name, email: member.email, role: 'employer' }`. Wrong password → 401. (Owner/User/Jobseeker branches are tried first, so an email that is also an Employer/User/Jobseeker resolves to that account — documented.)
  - A `Disabled` member (or one with no `passwordHash`) falls through → 401.
- **`requireAuth`** (`middleware/requireAuth.ts`): decode `mid` and set `req.memberId = payload.mid` (optional); augment the `Express.Request` type with `memberId?: string`. `req.userId`/`req.userRole` unchanged.

### Server — team module + endpoints (on the existing `/employer` gate)
New `server/src/modules/employerPortal/employerTeam.{service,controller,schemas}.ts`. All routes org-scoped via `req.userId`; the acting principal's rights come from `req.memberId`:
- **`actingContext(employerId, memberId?)`** → `{ canManage, role, selfId }`: no `memberId` (owner) → `{ canManage:true, role:'Owner', selfId:null }`; else load the `TeamMember` (`{_id:memberId, employerId}`) — if missing or `status!=='Active'` → **403** (`team_access_revoked`); else `{ canManage: role==='Admin', role, selfId }`.
- **`GET /api/me/employer/team`** → `{ members: [{id,name,email,role,status,createdAt}], canManage, actingRole }` (members scoped to `employerId`, newest-first; never another org's; passwordHash never emitted).
- **`POST /api/me/employer/team`** — Admin-only (`canManage` else 403). Body `{ name, email, role, password }`. Guards: `email_taken` (400) if a `TeamMember` OR an `Employer` already uses that email (avoid login ambiguity within the employer space); role ∈ enum; password ≥ 8; name/email non-empty. Creates an `Active` member with `passwordHash = hashPassword(password)`. Returns the member (no hash).
- **`PATCH /api/me/employer/team/:memberId`** — Admin-only. Body `{ role?, status? }` (≥1). Target must be a `TeamMember` of THIS org (else **404** no-oracle). `cant_modify_self` (400) if `memberId === selfId`. role/status ∈ enum.
- **`DELETE /api/me/employer/team/:memberId`** — Admin-only. Target in-org (404). `cant_remove_self` (400) if self.
- Error envelope `{ error:{message,code} }`; ESM `.js` specifiers.

### Cross-slice notes
The auth change is purely additive (`mid` optional claim; `req.memberId` optional). **No existing endpoint's authorization changes** — all remain `req.userId`(=employerId)-scoped. The team module is greenfield. Admin/jobseeker login paths untouched. Regression tests explicitly cover owner/admin/jobseeker login still working.

## Client — team page, hooks, settings repoint, route
- **Types** (`client/src/types/employer.ts`): `TeamMemberItem` (`{ id, name, email, role, status, createdAt }`), `EmployerTeamResponse` (`{ members, canManage, actingRole }`), `TEAM_ROLES` list.
- **Hooks** (`hooks/useEmployerTeam.ts`): `useEmployerTeam()` (key `['employer-team']`) + `useAddTeamMember()` / `useUpdateTeamMember()` / `useRemoveTeamMember()` (invalidate `['employer-team']`).
- **`EmployerTeam`** (`/employer/team`, in `EmployerShell`, `.page-wrap`): heading "Team & access"; a **member list** (ported `.member-row`: `.member-av` initials, `.member-info` `.mn`/`.me`, role — an inline `<select>` when `canManage` else a `.role-badge`, a `.status-pill`, a `.member-x` remove when `canManage`); an **add-member form** (`.add-row`: name, email, role `<select>`, password, Add) shown only when `canManage`; a `.access-note` explaining "Only admins can manage team access" when `!canManage`. Loading/empty/error states; mutation errors surfaced (`role="alert"`).
- **Settings repoint** (`EmployerShell.tsx`): change `SETTINGS_ITEM.path` from `/employer/coming-soon/settings` to `/employer/team`, and the topbar dropdown "Settings" button to route there too (the `.sb-user` block + "Company profile" may keep pointing at settings; at minimum the Settings nav item + dropdown Settings button land on the real page).
- **Route** (`App.tsx`): `/employer/team` wrapped `RoleRoute role="employer" > EmployerShell > EmployerTeam`.

## Error handling
`{ error:{message,code} }`. zod (bad role/status/short password/empty) → 400 `validation`; `email_taken` → 400; non-admin write → 403 `forbidden`; revoked member acting → 403 `team_access_revoked`; target outside org / bad id → 404 `not_found` (no oracle); self-modify/remove → 400 `cant_modify_self`/`cant_remove_self`. Login failures → 401. Role guards (non-employer) → 401/403.

## Testing
### Server (`employer-team.route.test.ts` + auth regression)
- **Auth regression (critical):** an admin `User`, a `Jobseeker`, and an `Employer` owner all still log in with the correct `sub`/`role` (unchanged behavior).
- **Member login:** an `Active` `TeamMember` (hashed password) logs in → `role:'employer'`, `user.id = employerId`; the JWT decodes with `mid = memberId`. A `Disabled` member → 401. Wrong password → 401.
- **GET team:** owner token → `canManage:true`; an `Admin`-role member token → `canManage:true`; a `Recruiter` member token → `canManage:false`. Members list is org-scoped (employer B's members excluded). No `passwordHash` in any payload.
- **POST add:** owner adds a member (Active, hashed); duplicate email (existing member or existing employer email) → 400 `email_taken`; a non-admin member token → 403.
- **PATCH:** Admin changes a member's role/status; `cant_modify_self` (400) when targeting the acting member; a member of another org → 404. **DELETE:** Admin removes a member; `cant_remove_self` (400); non-admin → 403.
- `401` no token / `403` admin(platform)-role token on team endpoints.

### Client (`EmployerTeam.test.tsx`)
- `canManage:true` → renders members + the add form + role selects + remove buttons; adding fires `POST /me/employer/team` with the entered fields; removing fires `DELETE`; changing a role fires `PATCH`.
- `canManage:false` → read-only: no add form, no remove buttons, and the "only admins" note shows.

## Verification
Full server + client suites green, both `tsc --noEmit` clean, client build ok. Live E2E on an isolated DB (`matchday_employer13_smoke`, dropped after; shared untouched): the owner adds a member → the member logs in (real end-to-end: `POST /auth/login` returns a working employer token) and can read the portal but not manage the team (403 on add); an Admin member can manage; existing owner/jobseeker/admin logins still succeed (regression); employer B's members excluded; self-remove blocked; `passwordHash` never emitted; shared `matchday` untouched.

## Follow-ups / known stubs
- Roles gate only team management this slice; fine-grained per-action RBAC across the portal (the prototype's permission matrix) is a future slice.
- No email invite / password reset (Admin sets the initial password); a removed/disabled member's already-issued JWT still authenticates as the org (read paths) until expiry — acceptable at prototype scale; a token-revocation/short-expiry pass is a follow-up.
- Email uniqueness is checked against `TeamMember` + `Employer` (not `User`/`Jobseeker`); login order resolves cross-collection collisions, and a member email equal to an owner/user/jobseeker email resolves to that prior account.
