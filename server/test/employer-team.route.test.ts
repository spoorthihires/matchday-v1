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
