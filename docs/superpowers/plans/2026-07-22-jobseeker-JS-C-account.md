# Jobseeker Portal — Slice JS-C (Account Self-Service) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** A logged-in seeker can view/edit a bounded set of their own profile fields and change their password.

**Tech:** Express/Mongoose (ESM), Zod; React + React Query. Vitest.

## Global Constraints
- Branch `feat/jobseeker-portal-completion` (base `25234cb`). All endpoints on the existing `/api/me` seeker gate; identity from `req.userId`. Editable set is bounded (name/branch/source only); email/cgpa/gradYear/institute/stage are NOT self-editable (identity/eval-controlled). Reuse `verifyPassword`/`hashPassword` from `auth.service`. Error envelope `{error:{message,code}}`; ESM `.js`.

## Prereq
Baseline: `npm test -w server -- --run test/seeker-activity.route.test.ts` green.

---

## Task 1: Server — account get/patch + password change

**Files:** Modify `seekerPortal.service.ts`, `seekerPortal.controller.ts`, `seekerPortal.routes.ts`, `seekerPortal.schemas.ts`; Create `server/test/seeker-account.route.test.ts`.

**Interfaces:** `getAccount(jobseekerId)`, `updateAccount(jobseekerId, {name?,branch?,source?})`, `changePassword(jobseekerId, {currentPassword,newPassword})`; routes `GET /portal/account`, `PATCH /portal/account`, `POST /portal/account/password`.

- [ ] **Step 1: Failing test** — `server/test/seeker-account.route.test.ts` (mirror `seeker-reveal.route.test.ts`). Seed an Institute + a Jobseeker with a known `passwordHash` (hash a known password via `hashPassword`), stage e.g. 'MatchReady'. Mint `jsToken`. Assert:
  - `GET /api/me/portal/account` → `{name,email,branch,gradYear,source,cgpa,institute,hasPassword:true}`.
  - `PATCH /api/me/portal/account` `{name:'New Name', branch:'ECE', source:'Referral', email:'hacker@x.test', cgpa:10, gradYear:1999, stage:'Joined'}` → 200; re-GET shows name/branch/source updated but **email/cgpa/gradYear unchanged** (the extra keys are ignored — not editable).
  - `POST /api/me/portal/account/password` `{currentPassword:<correct>, newPassword:'newpass12'}` → 200; a wrong `currentPassword` → `400 invalid_password`; a `newPassword` <8 → `400`. After a successful change, the seeker can `POST /api/auth/login` with the new password (optional extra assertion).
  - `401` no token; `403` admin token — on all three.

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Service** — append to `seekerPortal.service.ts` (import `verifyPassword, hashPassword` from `../auth/auth.service.js`; `Jobseeker`/`Institute` already imported):
```ts
export async function getAccount(jobseekerId: string) {
  if (!Types.ObjectId.isValid(jobseekerId)) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  const s = await Jobseeker.findById(jobseekerId).lean();
  if (!s) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  const inst = await Institute.findById(s.instituteId).select('name').lean();
  return { name: s.name, email: s.email ?? '', branch: s.branch, gradYear: s.gradYear, source: s.source, cgpa: s.cgpa, institute: inst?.name ?? '—', hasPassword: !!s.passwordHash };
}

export async function updateAccount(jobseekerId: string, input: { name?: string; branch?: string; source?: string }) {
  if (!Types.ObjectId.isValid(jobseekerId)) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  const s = await Jobseeker.findById(jobseekerId);
  if (!s) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  if (input.name !== undefined) s.name = input.name;
  if (input.branch !== undefined) s.branch = input.branch;
  if (input.source !== undefined) s.source = input.source;
  await s.save();
  return getAccount(jobseekerId);
}

export async function changePassword(jobseekerId: string, input: { currentPassword: string; newPassword: string }) {
  const s = await Jobseeker.findById(jobseekerId);
  if (!s || !s.passwordHash) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  if (!(await verifyPassword(input.currentPassword, s.passwordHash))) throw new HttpError(400, 'Your current password is incorrect', 'invalid_password');
  s.passwordHash = await hashPassword(input.newPassword);
  await s.save();
  return { ok: true as const };
}
```

- [ ] **Step 4: Schemas** — append to `seekerPortal.schemas.ts`:
```ts
export const updateAccountSchema = z.object({ name: z.string().trim().min(1).optional(), branch: z.string().trim().min(1).optional(), source: z.string().trim().min(1).optional() });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) });
```
(zod strips unknown keys by default, so `email`/`cgpa`/`stage` in the PATCH body are dropped.)

- [ ] **Step 5: Controllers + routes** — add `accountController` (`res.json(await getAccount(req.userId as string))`), `updateAccountController` (`updateAccountSchema.parse(req.body)` → `updateAccount`), `changePasswordController` (`changePasswordSchema.parse` → `changePassword`) to `seekerPortal.controller.ts`; routes:
```ts
seekerPortalRoutes.get('/portal/account', asyncHandler(accountController));
seekerPortalRoutes.patch('/portal/account', asyncHandler(updateAccountController));
seekerPortalRoutes.post('/portal/account/password', asyncHandler(changePasswordController));
```

- [ ] **Step 6: Green + full server suite + tsc** — targeted + `npm test -w server` + `npx -w server tsc --noEmit`.

- [ ] **Step 7: Commit** — `git add server/src/modules/seekerPortal server/test/seeker-account.route.test.ts && git commit -m "feat(server): jobseeker portal account get/patch + password change"`

---

## Task 2: Client — Account page

**Files:** Create `client/src/pages/Portal/Account.tsx`, `client/src/hooks/useAccount.ts`; Modify `client/src/pages/Portal/PortalShell.tsx` (add an Account link), `client/src/App.tsx` (route); Create `client/src/test/PortalAccount.test.tsx`.

- [ ] **Step 1: Failing test** — `client/src/test/PortalAccount.test.tsx` (mirror `Portal.test.tsx` harness, at `/portal/account`). Mock `GET /me/portal/account` → a profile. Assert: profile form renders with editable name/branch/source and read-only email/institute; editing name + submitting fires `PATCH /me/portal/account` with `{name,...}`; the password form submitting fires `POST /me/portal/account/password` with `{currentPassword,newPassword}`; a wrong-current error (mock 400) surfaces via `role="alert"`.

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Hooks** — `client/src/hooks/useAccount.ts`: `useAccount()` (query `['account']` → `/me/portal/account`), `useUpdateAccount()` (PATCH, body `{name?,branch?,source?}`, invalidate `['account']`+`['portal']`), `useChangePassword()` (POST `/me/portal/account/password`). Mirror `useReveal.ts`/`useActivity.ts`.

- [ ] **Step 4: Page** — `client/src/pages/Portal/Account.tsx` inside `PortalShell`: a profile `<form>` (editable text inputs name/branch/source prefilled from `useAccount`; read-only email/institute/gradYear/cgpa shown as text) → update mutation; and a change-password `<form>` (currentPassword/newPassword) → change mutation. Surface success + error (`role="alert"`). Reuse existing portal/`.btn` classes; add minimal CSS to `portal.css` only if a control is unstyled.

- [ ] **Step 5: Shell link + route** — In `PortalShell.tsx` add an **Account** `<Link to="/portal/account">` in the header (near Logout). In `App.tsx` add `<Route path="/portal/account" element={<RoleRoute role="jobseeker"><Account /></RoleRoute>} />` (Account renders its own PortalShell, or wrap consistently with how `/portal` is done — check `Portal` composition and match it).

- [ ] **Step 6: Green + full client suite + tsc + build** — targeted + `npm test -w client` + `npx -w client tsc --noEmit` + `npm run -w client build`.

- [ ] **Step 7: Commit** — `git add client/src/pages/Portal/Account.tsx client/src/hooks/useAccount.ts client/src/pages/Portal/PortalShell.tsx client/src/App.tsx client/src/test/PortalAccount.test.tsx && git commit -m "feat(client): jobseeker portal account page (profile + password)"`

---

## Notes
- Editable set is name/branch/source ONLY; the PATCH schema omits email/cgpa/gradYear/institute/stage so a body attempt to change them is silently stripped (a test asserts this). Password change verifies the current password. All identity from `req.userId`. Reuse `verifyPassword`/`hashPassword`.
