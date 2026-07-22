import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword, signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const KNOWN_PASSWORD = 'correcthorse1';

async function scenario() {
  const inst = await Institute.create({ name: 'CBIT', city: 'Hyd', type: 'Tier-1' });
  const passwordHash = await hashPassword(KNOWN_PASSWORD);
  const js = await Jobseeker.create({
    name: 'Aarav', email: 'aarav@x.test', instituteId: inst._id, branch: 'CSE',
    gradYear: 2026, cgpa: 8, source: 'Campus', stage: 'MatchReady', passwordHash,
  });
  return { inst, js };
}

function jsToken(js: { _id: unknown }) { return signToken({ sub: String(js._id), role: 'jobseeker' }); }

describe('GET /api/me/portal/account', () => {
  it('returns the seeker profile plus hasPassword', async () => {
    const { js, inst } = await scenario();
    const res = await request(createApp()).get('/api/me/portal/account').set('Authorization', `Bearer ${jsToken(js)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Aarav', email: 'aarav@x.test', branch: 'CSE', gradYear: 2026,
      source: 'Campus', cgpa: 8, institute: inst.name, hasPassword: true,
    });
  });

  it('401 without a token, 403 for an admin token', async () => {
    const { js } = await scenario();
    expect((await request(createApp()).get('/api/me/portal/account')).status).toBe(401);
    const adminTok = signToken({ sub: String(js._id), role: 'admin' });
    expect((await request(createApp()).get('/api/me/portal/account').set('Authorization', `Bearer ${adminTok}`)).status).toBe(403);
  });
});

describe('PATCH /api/me/portal/account', () => {
  it('updates name/branch/source but ignores email/cgpa/gradYear/stage', async () => {
    const { js } = await scenario();
    const res = await request(createApp()).patch('/api/me/portal/account').set('Authorization', `Bearer ${jsToken(js)}`)
      .send({ name: 'New Name', branch: 'ECE', source: 'Referral', email: 'hacker@x.test', cgpa: 10, gradYear: 1999, stage: 'Joined' });
    expect(res.status).toBe(200);

    const get = await request(createApp()).get('/api/me/portal/account').set('Authorization', `Bearer ${jsToken(js)}`);
    expect(get.body).toMatchObject({
      name: 'New Name', branch: 'ECE', source: 'Referral',
      email: 'aarav@x.test', cgpa: 8, gradYear: 2026,
    });
  });

  it('401 without a token, 403 for an admin token', async () => {
    const { js } = await scenario();
    expect((await request(createApp()).patch('/api/me/portal/account').send({ name: 'X' })).status).toBe(401);
    const adminTok = signToken({ sub: String(js._id), role: 'admin' });
    expect((await request(createApp()).patch('/api/me/portal/account').set('Authorization', `Bearer ${adminTok}`).send({ name: 'X' })).status).toBe(403);
  });
});

describe('POST /api/me/portal/account/password', () => {
  it('changes the password when currentPassword is correct', async () => {
    const { js } = await scenario();
    const res = await request(createApp()).post('/api/me/portal/account/password').set('Authorization', `Bearer ${jsToken(js)}`)
      .send({ currentPassword: KNOWN_PASSWORD, newPassword: 'newpass12' });
    expect(res.status).toBe(200);

    const login = await request(createApp()).post('/api/auth/login').send({ email: 'aarav@x.test', password: 'newpass12' });
    expect(login.status).toBe(200);
  });

  it('400 invalid_password when currentPassword is wrong', async () => {
    const { js } = await scenario();
    const res = await request(createApp()).post('/api/me/portal/account/password').set('Authorization', `Bearer ${jsToken(js)}`)
      .send({ currentPassword: 'wrongpassword', newPassword: 'newpass12' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_password');
  });

  it('400 when newPassword is shorter than 8 chars', async () => {
    const { js } = await scenario();
    const res = await request(createApp()).post('/api/me/portal/account/password').set('Authorization', `Bearer ${jsToken(js)}`)
      .send({ currentPassword: KNOWN_PASSWORD, newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('401 without a token, 403 for an admin token', async () => {
    const { js } = await scenario();
    const body = { currentPassword: KNOWN_PASSWORD, newPassword: 'newpass12' };
    expect((await request(createApp()).post('/api/me/portal/account/password').send(body)).status).toBe(401);
    const adminTok = signToken({ sub: String(js._id), role: 'admin' });
    expect((await request(createApp()).post('/api/me/portal/account/password').set('Authorization', `Bearer ${adminTok}`).send(body)).status).toBe(403);
  });
});
