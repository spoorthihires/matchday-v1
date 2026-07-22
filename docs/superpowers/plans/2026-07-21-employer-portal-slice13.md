# Employer Portal — Slice 13: Team Access / RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Multiple login users per employer org with roles — a `TeamMember` model, an additive member-login path, and an Admin-gated Team & access management surface.

**Architecture:** Additive auth extension (JWT keeps `sub`=employerId for members too, plus an optional `mid` claim; `req.memberId` optional) so every existing employer endpoint is unchanged. A greenfield team module holds all role logic. The owner login is implicitly Admin (no last-admin lockout).

**Tech Stack:** Node/Express + Mongoose (ESM, `.js` imports), Zod, bcryptjs, jsonwebtoken; React + React Query + React Router; Vitest + Supertest / Testing Library.

## Global Constraints
- Base: `feat/employer-portal-slice13`, **stacked on `feat/employer-portal-slice12`** (worktree `~/code/matchday-employer13`). Do not rebase onto main.
- **The auth change is purely additive** — `signToken` gains an optional `mid`; `login` gains a `TeamMember` branch AFTER the `Employer` branch; `requireAuth` sets an optional `req.memberId`. **No existing endpoint's authorization changes** (all stay `req.userId`=employerId-scoped). Admin/jobseeker login untouched. This MUST be covered by regression tests.
- Members act org-scoped (`req.userId`=employerId); the acting principal's rights come from `req.memberId`. **Only Admin (or the owner, no `mid`) may manage the team.**
- `passwordHash` never serialized (model transform). Email unique (global). Error envelope `{ error:{message,code} }`; ESM `.js` specifiers. Reuse ported CSS only (no new CSS).

## Prerequisites
`cd ~/code/matchday-employer13 && npm install`. Verify baseline: `npm test -w server -- --run test/employer-support.route.test.ts` passes.

## File Structure
**Server — create:** `server/src/models/TeamMember.ts`; `server/src/modules/employerPortal/employerTeam.{schemas,service,controller}.ts`; `server/test/employer-team.route.test.ts`.
**Server — modify:** `server/src/modules/auth/auth.service.ts` (signToken +mid, login +TeamMember branch), `server/src/middleware/requireAuth.ts` (+req.memberId), `employerPortal.routes.ts` (+4 routes).
**Client — create:** `client/src/pages/EmployerPortal/hooks/useEmployerTeam.ts`, `EmployerTeam.tsx`; `client/src/test/EmployerTeam.test.tsx`.
**Client — modify:** `client/src/types/employer.ts`, `EmployerShell.tsx` (settings repoint), `App.tsx` (route).

---

## Task 1: Server — TeamMember model + additive auth + team endpoints

**Files:** Create `TeamMember.ts`, `employerTeam.schemas.ts`, `employerTeam.service.ts`, `employerTeam.controller.ts`, `server/test/employer-team.route.test.ts`; Modify `auth.service.ts`, `requireAuth.ts`, `employerPortal.routes.ts`.

**Interfaces:**
- Produces: model `TeamMember` + `TEAM_ROLES`/`TEAM_STATUSES`; `signToken({sub,role,mid?})`; `req.memberId`; `listTeam`/`addTeamMember`/`updateTeamMember`/`removeTeamMember`; routes `GET/POST /employer/team`, `PATCH/DELETE /employer/team/:memberId`.

- [ ] **Step 1: Create the model**

Create `server/src/models/TeamMember.ts`:

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

export const TEAM_ROLES = ['Admin', 'Recruiter', 'Interviewer', 'Viewer'] as const;
export const TEAM_STATUSES = ['Active', 'Disabled'] as const;

const teamMemberSchema = new Schema({
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, default: undefined },
  role: { type: String, enum: TEAM_ROLES, default: 'Recruiter' },
  status: { type: String, enum: TEAM_STATUSES, default: 'Active' },
  createdAt: { type: Date, default: Date.now },
});
teamMemberSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.passwordHash; return ret; } });
teamMemberSchema.set('toObject', { transform: (_doc, ret) => { delete ret.passwordHash; return ret; } });

export type TeamMemberDoc = InferSchemaType<typeof teamMemberSchema>;
export const TeamMember = model('TeamMember', teamMemberSchema);
```

- [ ] **Step 2: Extend auth (signToken + login branch)**

In `server/src/modules/auth/auth.service.ts`:
(a) add the import (after the `Employer` import):
```ts
import { TeamMember } from '../../models/TeamMember.js';
```
(b) widen `signToken`'s payload type (keep the body identical):
```ts
export function signToken(payload: { sub: string; role: string; mid?: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES as jwt.SignOptions['expiresIn'] });
}
```
(c) in `login`, insert a `TeamMember` branch **after the `Employer` branch and before the final `throw`**:
```ts
  const member = await TeamMember.findOne({ email: normalized });
  if (member && member.passwordHash && member.status === 'Active') {
    const ok = await verifyPassword(password, member.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid credentials', 'auth');
    const token = signToken({ sub: String(member.employerId), role: 'employer', mid: String(member._id) });
    return { token, user: { id: String(member.employerId), name: member.name, email: member.email, role: 'employer' } };
  }
```

- [ ] **Step 3: Extend requireAuth (optional req.memberId)**

In `server/src/middleware/requireAuth.ts`: add `memberId?: string` to the `Express.Request` interface, widen the payload cast, and set it:
```ts
    interface Request { userId?: string; userRole?: string; memberId?: string; }
```
```ts
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; role: string; mid?: string };
    req.userId = payload.sub;
    req.userRole = payload.role;
    req.memberId = payload.mid;
```

- [ ] **Step 4: Write the failing route test (incl. auth regression)**

Create `server/test/employer-team.route.test.ts`:

```ts
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { signToken, hashPassword } from '../src/modules/auth/auth.service.js';
import { User } from '../src/models/User.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Institute } from '../src/models/Institute.js';
import { Employer } from '../src/models/Employer.js';
import { TeamMember } from '../src/models/TeamMember.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'owner@acme.test', status: 'Active', spoc: 'Jane', passwordHash: await hashPassword('ownerpass1'), ...over });
}
function ownerToken(e: { _id: unknown }) { return signToken({ sub: String(e._id), role: 'employer' }); }
function memberToken(e: { _id: unknown }, m: { _id: unknown }) { return signToken({ sub: String(e._id), role: 'employer', mid: String(m._id) }); }
async function member(employerId: unknown, over: Record<string, unknown> = {}) {
  return TeamMember.create({ employerId, name: 'Mem', email: `m${Math.random().toString(36).slice(2, 8)}@acme.test`, role: 'Recruiter', status: 'Active', passwordHash: await hashPassword('memberpass1'), ...over });
}
function login(email: string, password: string) { return request(createApp()).post('/api/auth/login').send({ email, password }); }

describe('auth regression (existing logins still work after the TeamMember branch)', () => {
  it('admin User, Jobseeker, and Employer owner all log in with the right sub/role', async () => {
    const u = await User.create({ name: 'Ad', email: 'admin@x.test', role: 'admin', passwordHash: await hashPassword('adminpass1') });
    const ua = await login('admin@x.test', 'adminpass1');
    expect(ua.status).toBe(200); expect(ua.body.user.role).toBe('admin'); expect(ua.body.user.id).toBe(String(u._id));

    const inst = await Institute.create({ name: 'C', city: 'H', type: 'Tier-1' });
    const js = await Jobseeker.create({ name: 'Js', email: 'js@x.test', instituteId: inst._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', passwordHash: await hashPassword('seekerpass1') });
    const ja = await login('js@x.test', 'seekerpass1');
    expect(ja.status).toBe(200); expect(ja.body.user.role).toBe('jobseeker'); expect(ja.body.user.id).toBe(String(js._id));

    const emp = await employer();
    const ea = await login('owner@acme.test', 'ownerpass1');
    expect(ea.status).toBe(200); expect(ea.body.user.role).toBe('employer'); expect(ea.body.user.id).toBe(String(emp._id));
  });
});

describe('member login', () => {
  it('an Active member logs in as employer (sub=employerId, mid=memberId in the JWT)', async () => {
    const emp = await employer(); const m = await member(emp._id, { email: 'active@acme.test' });
    const res = await login('active@acme.test', 'memberpass1');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('employer');
    expect(res.body.user.id).toBe(String(emp._id));
    const decoded = jwt.verify(res.body.token, env.JWT_SECRET) as { sub: string; role: string; mid?: string };
    expect(decoded.sub).toBe(String(emp._id));
    expect(decoded.mid).toBe(String(m._id));
  });
  it('a Disabled member cannot log in', async () => {
    const emp = await employer(); await member(emp._id, { email: 'disabled@acme.test', status: 'Disabled' });
    expect((await login('disabled@acme.test', 'memberpass1')).status).toBe(401);
  });
  it('wrong password → 401', async () => {
    const emp = await employer(); await member(emp._id, { email: 'wp@acme.test' });
    expect((await login('wp@acme.test', 'nope')).status).toBe(401);
  });
});

describe('team endpoints', () => {
  it('GET: owner & Admin member can manage; Recruiter cannot; no passwordHash; org-scoped', async () => {
    const emp = await employer(); const app = createApp();
    const admin = await member(emp._id, { email: 'adm@acme.test', role: 'Admin' });
    const rec = await member(emp._id, { email: 'rec@acme.test', role: 'Recruiter' });
    const other = await employer({ email: 'other@x.test', name: 'Beta' });
    await member(other._id, { email: 'beta-mem@x.test' });

    const asOwner = await request(app).get('/api/me/employer/team').set('Authorization', `Bearer ${ownerToken(emp)}`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.canManage).toBe(true);
    expect(asOwner.body.members).toHaveLength(2);                 // admin + rec, not the other org's
    expect(JSON.stringify(asOwner.body)).not.toContain('passwordHash');
    expect(asOwner.body.members.some((x: { email: string }) => x.email === 'beta-mem@x.test')).toBe(false);

    expect((await request(app).get('/api/me/employer/team').set('Authorization', `Bearer ${memberToken(emp, admin)}`)).body.canManage).toBe(true);
    expect((await request(app).get('/api/me/employer/team').set('Authorization', `Bearer ${memberToken(emp, rec)}`)).body.canManage).toBe(false);
  });

  it('POST: owner adds a member; dup email → 400; non-admin → 403', async () => {
    const emp = await employer(); const app = createApp();
    const created = await request(app).post('/api/me/employer/team').set('Authorization', `Bearer ${ownerToken(emp)}`)
      .send({ name: 'New Rec', email: 'new@acme.test', role: 'Recruiter', password: 'newpass12' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('Active');
    expect(created.body).not.toHaveProperty('passwordHash');
    // dup (same email) → 400
    expect((await request(app).post('/api/me/employer/team').set('Authorization', `Bearer ${ownerToken(emp)}`).send({ name: 'x', email: 'new@acme.test', role: 'Viewer', password: 'anotherpw1' })).body.error.code).toBe('email_taken');
    // dup vs an existing employer email → 400
    expect((await request(app).post('/api/me/employer/team').set('Authorization', `Bearer ${ownerToken(emp)}`).send({ name: 'x', email: 'owner@acme.test', role: 'Viewer', password: 'anotherpw1' })).body.error.code).toBe('email_taken');
    // a Recruiter member cannot add
    const rec = await member(emp._id, { email: 'rec2@acme.test', role: 'Recruiter' });
    expect((await request(app).post('/api/me/employer/team').set('Authorization', `Bearer ${memberToken(emp, rec)}`).send({ name: 'x', email: 'z@acme.test', role: 'Viewer', password: 'anotherpw1' })).status).toBe(403);
  });

  it('PATCH/DELETE: admin changes role/status; self-guard; cross-org 404; non-admin 403', async () => {
    const emp = await employer(); const app = createApp();
    const admin = await member(emp._id, { email: 'adm2@acme.test', role: 'Admin' });
    const target = await member(emp._id, { email: 'tgt@acme.test', role: 'Recruiter' });
    // owner promotes target
    expect((await request(app).patch(`/api/me/employer/team/${target._id}`).set('Authorization', `Bearer ${ownerToken(emp)}`).send({ role: 'Interviewer' })).body.role).toBe('Interviewer');
    // admin member cannot modify SELF
    expect((await request(app).patch(`/api/me/employer/team/${admin._id}`).set('Authorization', `Bearer ${memberToken(emp, admin)}`).send({ status: 'Disabled' })).body.error.code).toBe('cant_modify_self');
    // another org's member → 404
    const other = await employer({ email: 'o2@x.test', name: 'Beta' }); const om = await member(other._id, { email: 'om@x.test' });
    expect((await request(app).patch(`/api/me/employer/team/${om._id}`).set('Authorization', `Bearer ${ownerToken(emp)}`).send({ role: 'Viewer' })).status).toBe(404);
    // delete self-guard + non-admin
    expect((await request(app).delete(`/api/me/employer/team/${admin._id}`).set('Authorization', `Bearer ${memberToken(emp, admin)}`)).body.error.code).toBe('cant_remove_self');
    const rec = await member(emp._id, { email: 'rec3@acme.test', role: 'Recruiter' });
    expect((await request(app).delete(`/api/me/employer/team/${target._id}`).set('Authorization', `Bearer ${memberToken(emp, rec)}`)).status).toBe(403);
    // owner deletes target
    expect((await request(app).delete(`/api/me/employer/team/${target._id}`).set('Authorization', `Bearer ${ownerToken(emp)}`)).status).toBe(200);
  });

  it('401 no token / 403 platform-admin token', async () => {
    const emp = await employer();
    expect((await request(createApp()).get('/api/me/employer/team')).status).toBe(401);
    expect((await request(createApp()).get('/api/me/employer/team').set('Authorization', `Bearer ${signToken({ sub: String(emp._id), role: 'admin' })}`)).status).toBe(403);
  });
});
```

- [ ] **Step 5: Run it — verify it fails**

Run: `npm test -w server -- --run test/employer-team.route.test.ts` → FAIL (routes/model missing).

- [ ] **Step 6: Create the zod schemas**

Create `server/src/modules/employerPortal/employerTeam.schemas.ts`:

```ts
import { z } from 'zod';
import { TEAM_ROLES, TEAM_STATUSES } from '../../models/TeamMember.js';

export const addMemberSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(TEAM_ROLES),
  password: z.string().min(8).max(200),
});
export const updateMemberSchema = z.object({
  role: z.enum(TEAM_ROLES).optional(),
  status: z.enum(TEAM_STATUSES).optional(),
}).refine((v) => v.role !== undefined || v.status !== undefined, { message: 'Nothing to update' });

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
```

(If tsc rejects `z.enum` on the readonly `as const` arrays, use `z.enum([...TEAM_ROLES] as [string, ...string[]])` / same for statuses.)

- [ ] **Step 7: Create the service**

Create `server/src/modules/employerPortal/employerTeam.service.ts`:

```ts
import { Types } from 'mongoose';
import { HttpError } from '../../middleware/errorHandler.js';
import { TeamMember } from '../../models/TeamMember.js';
import { Employer } from '../../models/Employer.js';
import { hashPassword } from '../auth/auth.service.js';
import type { AddMemberInput, UpdateMemberInput } from './employerTeam.schemas.js';

interface MemberLean { _id: Types.ObjectId; name: string; email: string; role: string; status: string; createdAt: Date }
function project(m: MemberLean) {
  return { id: String(m._id), name: m.name, email: m.email, role: m.role, status: m.status, createdAt: new Date(m.createdAt).toISOString() };
}

interface ActingCtx { canManage: boolean; role: string; selfId: string | null }
export async function actingContext(employerId: string, memberId?: string): Promise<ActingCtx> {
  if (!memberId) return { canManage: true, role: 'Owner', selfId: null };
  const m = await TeamMember.findOne({ _id: memberId, employerId }).lean<{ _id: Types.ObjectId; role: string; status: string } | null>();
  if (!m || m.status !== 'Active') throw new HttpError(403, 'Your team access is no longer active', 'team_access_revoked');
  return { canManage: m.role === 'Admin', role: m.role, selfId: String(m._id) };
}
function requireManage(ctx: ActingCtx) {
  if (!ctx.canManage) throw new HttpError(403, 'Only admins can manage team access', 'forbidden');
}

export async function listTeam(employerId: string, memberId?: string) {
  const ctx = await actingContext(employerId, memberId);
  const rows = await TeamMember.find({ employerId }).sort({ createdAt: -1 }).lean<MemberLean[]>();
  return { members: rows.map(project), canManage: ctx.canManage, actingRole: ctx.role, selfId: ctx.selfId };
}

export async function addTeamMember(employerId: string, memberId: string | undefined, input: AddMemberInput) {
  requireManage(await actingContext(employerId, memberId));
  const email = input.email; // zod lowercased
  if (await TeamMember.findOne({ email })) throw new HttpError(400, 'That email already has an account', 'email_taken');
  if (await Employer.findOne({ email })) throw new HttpError(400, 'That email already has an account', 'email_taken');
  const passwordHash = await hashPassword(input.password);
  const doc = await TeamMember.create({ employerId, name: input.name, email, role: input.role, status: 'Active', passwordHash });
  return project(doc.toObject() as unknown as MemberLean);
}

export async function updateTeamMember(employerId: string, memberId: string | undefined, targetId: string, input: UpdateMemberInput) {
  const ctx = await actingContext(employerId, memberId); requireManage(ctx);
  if (!Types.ObjectId.isValid(targetId)) throw new HttpError(404, 'Member not found', 'not_found');
  if (ctx.selfId && ctx.selfId === targetId) throw new HttpError(400, 'You cannot modify your own membership', 'cant_modify_self');
  const m = await TeamMember.findOne({ _id: targetId, employerId });
  if (!m) throw new HttpError(404, 'Member not found', 'not_found');
  if (input.role !== undefined) m.role = input.role;
  if (input.status !== undefined) m.status = input.status;
  await m.save();
  return project(m.toObject() as unknown as MemberLean);
}

export async function removeTeamMember(employerId: string, memberId: string | undefined, targetId: string) {
  const ctx = await actingContext(employerId, memberId); requireManage(ctx);
  if (!Types.ObjectId.isValid(targetId)) throw new HttpError(404, 'Member not found', 'not_found');
  if (ctx.selfId && ctx.selfId === targetId) throw new HttpError(400, 'You cannot remove your own membership', 'cant_remove_self');
  const res = await TeamMember.deleteOne({ _id: targetId, employerId });
  if (res.deletedCount === 0) throw new HttpError(404, 'Member not found', 'not_found');
  return { ok: true as const };
}
```

- [ ] **Step 8: Create the controller + register routes**

Create `server/src/modules/employerPortal/employerTeam.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { addMemberSchema, updateMemberSchema } from './employerTeam.schemas.js';
import { listTeam, addTeamMember, updateTeamMember, removeTeamMember } from './employerTeam.service.js';

export async function teamListController(req: Request, res: Response) {
  res.json(await listTeam(req.userId as string, req.memberId));
}
export async function addTeamMemberController(req: Request, res: Response) {
  const input = addMemberSchema.parse(req.body);
  res.status(201).json(await addTeamMember(req.userId as string, req.memberId, input));
}
export async function updateTeamMemberController(req: Request, res: Response) {
  const input = updateMemberSchema.parse(req.body);
  res.json(await updateTeamMember(req.userId as string, req.memberId, req.params.memberId, input));
}
export async function removeTeamMemberController(req: Request, res: Response) {
  res.json(await removeTeamMember(req.userId as string, req.memberId, req.params.memberId));
}
```

In `employerPortal.routes.ts`, add the import (after the support-controller import) and the four routes (after the support routes, **before** the final `.get('/employer', ...)`):

```ts
import { teamListController, addTeamMemberController, updateTeamMemberController, removeTeamMemberController } from './employerTeam.controller.js';
```
```ts
employerPortalRoutes.get('/employer/team', asyncHandler(teamListController));
employerPortalRoutes.post('/employer/team', asyncHandler(addTeamMemberController));
employerPortalRoutes.patch('/employer/team/:memberId', asyncHandler(updateTeamMemberController));
employerPortalRoutes.delete('/employer/team/:memberId', asyncHandler(removeTeamMemberController));
```

- [ ] **Step 9: Run tests + full server suite + type-check**

Run: `npm test -w server -- --run test/employer-team.route.test.ts && npm test -w server && npx -w server tsc --noEmit`
Expected: file PASSES; full suite green (known flaky `test/eval-configs.service.test.ts` may flake — ignore only that); tsc `ok`. The auth-regression describe block MUST pass.

- [ ] **Step 10: Commit**

```bash
git add server/src/models/TeamMember.ts server/src/modules/employerPortal/employerTeam.schemas.ts server/src/modules/employerPortal/employerTeam.service.ts server/src/modules/employerPortal/employerTeam.controller.ts server/src/modules/employerPortal/employerPortal.routes.ts server/src/modules/auth/auth.service.ts server/src/middleware/requireAuth.ts server/test/employer-team.route.test.ts
git commit -m "feat(server): employer team members + additive member-login + Admin-gated team endpoints"
```

---

## Task 2: Client — team page + hooks + settings repoint + route

**Files:** Modify `types/employer.ts`, `EmployerShell.tsx`, `App.tsx`; Create `hooks/useEmployerTeam.ts`, `EmployerTeam.tsx`, `client/src/test/EmployerTeam.test.tsx`.

**Interfaces:**
- Consumes: `apiFetch`/`ApiError`/`useAuth`; the Task 1 endpoints.
- Produces: `TeamMemberItem`/`EmployerTeamResponse`/`TEAM_ROLES`; `useEmployerTeam`/`useAddTeamMember`/`useUpdateTeamMember`/`useRemoveTeamMember`; `EmployerTeam` at `/employer/team`.

- [ ] **Step 1: Add types**

In `client/src/types/employer.ts`, append:

```ts
export const TEAM_ROLES = ['Admin', 'Recruiter', 'Interviewer', 'Viewer'] as const;
export type TeamRole = typeof TEAM_ROLES[number];
export interface TeamMemberItem { id: string; name: string; email: string; role: TeamRole; status: 'Active' | 'Disabled'; createdAt: string; }
export interface EmployerTeamResponse { members: TeamMemberItem[]; canManage: boolean; actingRole: string; selfId: string | null; }
```

- [ ] **Step 2: Add the hooks**

Create `client/src/pages/EmployerPortal/hooks/useEmployerTeam.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { EmployerTeamResponse, TeamMemberItem } from '../../../types/employer.js';

export function useEmployerTeam() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['employer-team'],
    queryFn: () => apiFetch<EmployerTeamResponse>('/me/employer/team', { token }),
    enabled: !!token,
  });
}

export interface AddMemberBody { name: string; email: string; role: string; password: string; }
export function useAddTeamMember() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddMemberBody) => apiFetch<TeamMemberItem>('/me/employer/team', { method: 'POST', body, token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employer-team'] }); },
  });
}
export function useUpdateTeamMember() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; role?: string; status?: string }) =>
      apiFetch<TeamMemberItem>(`/me/employer/team/${vars.id}`, { method: 'PATCH', body: { role: vars.role, status: vars.status }, token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employer-team'] }); },
  });
}
export function useRemoveTeamMember() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/me/employer/team/${id}`, { method: 'DELETE', token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employer-team'] }); },
  });
}
```

(Match the exact `apiFetch` option shape used by sibling hooks — `{ method, body, token }`; for DELETE omit `body`. Confirm `apiFetch` forwards `PATCH`/`DELETE` and JSON-encodes `body` the same way `useEmployerOffers.ts` relies on.)

- [ ] **Step 3: Write the failing page test**

Create `client/src/test/EmployerTeam.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerTeam } from '../pages/EmployerPortal/EmployerTeam.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const OWNER_VIEW = {
  members: [
    { id: 'm1', name: 'Alice Admin', email: 'alice@acme.test', role: 'Admin', status: 'Active', createdAt: '2026-07-03T10:00:00.000Z' },
    { id: 'm2', name: 'Bob Rec', email: 'bob@acme.test', role: 'Recruiter', status: 'Active', createdAt: '2026-07-02T10:00:00.000Z' },
  ],
  canManage: true, actingRole: 'Owner', selfId: null,
};
function mockFetch(view = OWNER_VIEW) {
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method, body: init?.body });
    if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: 'm3', name: 'x', email: 'x@acme.test', role: 'Viewer', status: 'Active', createdAt: '2026-07-05T00:00:00.000Z' }) };
    if (init?.method === 'PATCH') return { ok: true, status: 200, json: async () => ({ ...view.members[0], role: 'Viewer' }) };
    if (init?.method === 'DELETE') return { ok: true, status: 200, json: async () => ({ ok: true }) };
    return { ok: true, status: 200, json: async () => view };
  }));
  return { calls };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/team']}>
        <AuthProvider><Routes><Route path="/employer/team" element={<EmployerTeam />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerTeam', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('canManage: renders members, the add form, and role selects', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeInTheDocument());
    expect(screen.getByText('bob@acme.test')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Full name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add member/i })).toBeInTheDocument();
  });

  it('adds a member (POST with entered fields)', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Add member/i })).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Carol New' } });
    fireEvent.change(screen.getByPlaceholderText(/Email/i), { target: { value: 'carol@acme.test' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'carolpass1' } });
    fireEvent.click(screen.getByRole('button', { name: /Add member/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && (c.body ?? '').includes('carol@acme.test'))).toBe(true));
  });

  it('removes a member (DELETE)', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[0]);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/me/employer/team/'))).toBe(true));
  });

  it('read-only when canManage is false (no add form, shows the note)', async () => {
    seedAuth(); mockFetch({ members: OWNER_VIEW.members, canManage: false, actingRole: 'Recruiter', selfId: 'm2' }); renderPage();
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeInTheDocument());
    expect(screen.queryByPlaceholderText(/Full name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only admins can manage/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `npm test -w client -- --run src/test/EmployerTeam.test.tsx` → FAIL (module missing).

- [ ] **Step 5: Build the page**

Create `client/src/pages/EmployerPortal/EmployerTeam.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useEmployerTeam, useAddTeamMember, useUpdateTeamMember, useRemoveTeamMember } from './hooks/useEmployerTeam.js';
import { TEAM_ROLES, type TeamRole } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

export function EmployerTeam() {
  const team = useEmployerTeam();
  const add = useAddTeamMember();
  const update = useUpdateTeamMember();
  const remove = useRemoveTeamMember();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('Recruiter');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const canManage = team.data?.canManage ?? false;
  const selfId = team.data?.selfId ?? null;
  const members = team.data?.members ?? [];

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!name.trim() || !email.trim() || password.length < 8) { setErr('Name, email, and a password of at least 8 characters are required.'); return; }
    add.mutate({ name: name.trim(), email: email.trim(), role, password }, {
      onSuccess: () => { setName(''); setEmail(''); setRole('Recruiter'); setPassword(''); },
      onError: (e2) => setErr(errMsg(e2)),
    });
  }

  return (
    <div className="page-wrap">
      <div className="dash-greet"><h2>Team &amp; access</h2><p>Add teammates, assign roles, and manage who can access your MatchDay workspace.</p></div>

      {team.isLoading ? <p className="hint">Loading…</p>
        : team.isError ? <p className="hint">{errMsg(team.error)}</p>
        : (
          <>
            <div className="card">
              <div className="card-head"><h3>Members</h3></div>
              <div className="card-body">
                {members.length === 0 ? <p className="hint">No teammates yet.</p> : members.map((m) => (
                  <div className="member-row" key={m.id}>
                    <span className="member-av">{initials(m.name)}</span>
                    <div className="member-info"><div className="mn">{m.name}</div><div className="me">{m.email}</div></div>
                    {canManage && m.id !== selfId
                      ? <select className="select" value={m.role} aria-label={`Role for ${m.name}`} onChange={(e) => update.mutate({ id: m.id, role: e.target.value })}>{TEAM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                      : <span className="role-badge">{m.role}</span>}
                    <span className={`status-pill ${m.status === 'Active' ? 'st-approved' : 'st-cancelled'}`}>{m.status}</span>
                    {canManage && m.id !== selfId && (
                      <button type="button" className="member-x" aria-label={`Remove ${m.name}`} onClick={() => remove.mutate(m.id)}>✕</button>
                    )}
                  </div>
                ))}

                {canManage ? (
                  <form className="add-row" onSubmit={submit} style={{ marginTop: 14 }}>
                    <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
                    <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <select className="select" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>{TEAM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                    <input className="input" placeholder="Temp password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="submit" className="btn btn-primary" disabled={add.isPending}>{add.isPending ? 'Adding…' : 'Add member'}</button>
                  </form>
                ) : (
                  <div className="access-note" style={{ marginTop: 14 }}>Only admins can manage team access. You have {team.data?.actingRole} access.</div>
                )}
                {err && <div role="alert" style={{ color: '#b42318', fontSize: 13, marginTop: 8 }}>{err}</div>}
              </div>
            </div>
          </>
        )}
    </div>
  );
}
```

(Verify `.btn.btn-primary`/`.input`/`.select` are the control classes used by sibling forms — match `EmployerSupport.tsx`/`EmployerSlots.tsx`. `.member-row`/`.member-av`/`.member-info`/`.mn`/`.me`/`.member-x`/`.add-row`/`.role-badge`/`.access-note`/`.status-pill`+`.st-approved`/`.st-cancelled` are all pre-ported — no CSS changes.)

- [ ] **Step 6: Run the page test — verify it passes**

Run: `npm test -w client -- --run src/test/EmployerTeam.test.tsx` → PASS (4 tests).

- [ ] **Step 7: Repoint Settings + add the route**

(a) `EmployerShell.tsx`: change `SETTINGS_ITEM`'s `path` from `'/employer/coming-soon/settings'` to `'/employer/team'`. Also repoint the topbar user-dropdown "Settings" button to route to `/employer/team` (it currently calls `goTo(SETTINGS_ITEM)` — since `SETTINGS_ITEM.path` now points at `/employer/team`, that button follows automatically; leave the "Company profile" button as-is). No other nav changes.

(b) `App.tsx`: import `EmployerTeam` near the other employer imports; add the route after `/employer/support`:

```tsx
        <Route path="/employer/team" element={<RoleRoute role="employer"><EmployerShell><EmployerTeam /></EmployerShell></RoleRoute>} />
```

- [ ] **Step 8: Full client suite + type-check + build + commit**

Run: `npm test -w client && npx -w client tsc --noEmit && npm run -w client build` → all green (the Settings repoint only changes a path string; if a shell test asserts the old coming-soon path, update it to the new path — that's a legitimate contract change, not test-gaming).

```bash
git add client/src/types/employer.ts client/src/pages/EmployerPortal/hooks/useEmployerTeam.ts client/src/pages/EmployerPortal/EmployerTeam.tsx client/src/pages/EmployerPortal/EmployerShell.tsx client/src/App.tsx client/src/test/EmployerTeam.test.tsx
git commit -m "feat(client): employer team & access page (members + roles, admin-gated) + settings repoint"
```

---

## Task 3: Full-suite verification + live E2E smoke (isolated DB)

**Files:** none (verification only; no commit).

- [ ] **Step 1: Full suites** — `npm test -w server` && `npm test -w client`. Report counts.
- [ ] **Step 2: Type-check + build** — `npx -w server tsc --noEmit && npx -w client tsc --noEmit && npm run -w client build`.
- [ ] **Step 3: Seed + live smoke (isolated DB `matchday_employer13_smoke`)** — inspect the server's Mongo connection; kill any stale :4099 listener first; seed an `Employer` owner (hashed password), an admin `User`, a `Jobseeker` (+Institute, hashed), and start the server on `PORT=4099` pointed at the smoke DB (no `EADDRINUSE`). Then, via the LIVE `POST /api/auth/login` + team endpoints:
  - **Regression:** owner, admin `User`, and jobseeker all log in (200, correct role) — proving the added member branch didn't break existing auth.
  - Owner `POST /api/me/employer/team` adds an Admin member and a Recruiter member (201, Active, no `passwordHash` in the response).
  - **End-to-end member login:** `POST /api/auth/login` as the new Admin member → 200, `user.role:'employer'`; the returned token can `GET /api/me/employer/team` with `canManage:true`; and the new Recruiter member logs in → `canManage:false` and `POST /team` → 403.
  - A duplicate email (existing member or the owner's email) → 400 `email_taken`; a Recruiter cannot add (403); PATCH self → `cant_modify_self`; DELETE self → `cant_remove_self`; another org's member → 404. A `Disabled` member cannot log in (401).
  - Admin(platform)-role token on `/team` → 403; no token → 401.
- [ ] **Step 4: Teardown** — kill the server by listener PID; drop `matchday_employer13_smoke`; confirm shared `matchday` untouched. No commit.

---

## Notes for the executor
- Stacked on slice 12. **The auth change is additive — do NOT alter existing login branches or how any existing endpoint authorizes.** The regression `describe` block in the test is the guard; it must pass.
- Members act org-scoped (`sub`=employerId); `req.memberId` (optional) identifies the acting member for role checks. Owner (no `mid`) is implicitly Admin — so there is no last-admin lockout and no last-admin guard is needed.
- `passwordHash` is stripped by the model's `toJSON`/`toObject`; the service `project()` also never includes it — a test greps the payload for its absence.
- Reuse `hashPassword` from `auth.service.js`; do not reimplement hashing.
- All team CSS is pre-ported (`.member-row`/`.member-av`/`.member-info`/`.mn`/`.me`/`.member-x`, `.add-row`, `.role-badge`, `.access-note`, `.status-pill`+`.st-approved`/`.st-cancelled`) — no CSS changes.
- `/employer/team` is a top-level employer route on the `.use('/employer', requireAuth, requireRole('employer'))` gate, registered before the final `.get('/employer')`. The `:memberId` PATCH/DELETE routes sit under `/employer/team/` and don't collide with the literal `/employer/team` GET/POST.
- `Date.now()`/`new Date()` fine.
- Known stubs: roles gate only team management (no fine-grained RBAC elsewhere); Admin sets the initial password (no email invite); a removed member's already-issued token authenticates as the org (read paths) until expiry.
