import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function drive(over: Record<string, unknown> = {}) {
  return Drive.create({
    name: 'D',
    domain: 'Data / ML',
    stream: 'B.Tech',
    status: 'Active',
    eventDates: [new Date('2026-08-05')],
    candCap: 100,
    empCap: 8,
    slotCap: 20,
    frequency: 'Weekly',
    eventDay: 'Wednesday',
    eligibility: { sources: ['Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
    evaluation: [
      { key: 'mcq', enabled: true, config: {} },
      { key: 'coding', enabled: false, config: {} },
    ],
    visibility: { employerReg: 'Open', instituteVis: 'All institutes', candidateAccess: 'Public' },
    ...over,
  });
}

async function employerToken() {
  const emp = await Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x' });
  return signToken({ sub: String(emp._id), role: 'employer' });
}

describe('GET /api/me/employer/drives', () => {
  it('401 no token; 403 for an admin token', async () => {
    const app = createApp();
    const r1 = await request(app).get('/api/me/employer/drives');
    expect(r1.status).toBe(401);

    const admin = signToken({ sub: 'u1', role: 'admin' });
    const r2 = await request(app).get('/api/me/employer/drives').set('Authorization', `Bearer ${admin}`);
    expect(r2.status).toBe(403);
  });

  it('lists only Active+Published; filters by q and domain; carries employerReg/canRegister', async () => {
    await drive({ name: 'ActiveOne', status: 'Active' });
    await drive({ name: 'PublishedOne', status: 'Published' });
    await drive({ name: 'DraftOne', status: 'Draft' });
    await drive({
      name: 'ClosedReg',
      status: 'Active',
      visibility: { employerReg: 'Closed', instituteVis: 'All institutes', candidateAccess: 'Public' },
    });
    await drive({ name: 'OtherDomain', status: 'Active', domain: 'Finance' });

    const tok = await employerToken();
    const app = createApp();
    const res = await request(app).get('/api/me/employer/drives').set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(200);

    const names = res.body.items.map((d: { name: string }) => d.name);
    expect(names).toContain('ActiveOne');
    expect(names).toContain('PublishedOne');
    expect(names).not.toContain('DraftOne');

    const closed = res.body.items.find((d: { name: string }) => d.name === 'ClosedReg');
    expect(closed.employerReg).toBe('Closed');
    expect(closed.canRegister).toBe(false);

    const open = res.body.items.find((d: { name: string }) => d.name === 'ActiveOne');
    expect(open.employerReg).toBe('Open');
    expect(open.canRegister).toBe(true);

    // q filter (matches name)
    const q = await request(app).get('/api/me/employer/drives?q=ActiveOne').set('Authorization', `Bearer ${tok}`);
    expect(q.body.items.map((d: { name: string }) => d.name)).toEqual(['ActiveOne']);

    // domain filter (exact)
    const dom = await request(app).get('/api/me/employer/drives?domain=Finance').set('Authorization', `Bearer ${tok}`);
    expect(dom.body.items.map((d: { name: string }) => d.name)).toEqual(['OtherDomain']);
  });

  it('detail returns facts+eligibility+evaluation for Active; 404 for Draft/nonexistent', async () => {
    const d = await drive({ name: 'DetailDrive', status: 'Active' });
    const draft = await drive({ status: 'Draft' });
    const tok = await employerToken();
    const app = createApp();

    const ok = await request(app).get(`/api/me/employer/drives/${d._id}`).set('Authorization', `Bearer ${tok}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'DetailDrive', domain: 'Data / ML' });
    expect(ok.body.eligibility.branches).toEqual(['CSE']);
    expect(ok.body.evaluation.find((e: { key: string }) => e.key === 'mcq').enabled).toBe(true);

    const draftRes = await request(app).get(`/api/me/employer/drives/${draft._id}`).set('Authorization', `Bearer ${tok}`);
    expect(draftRes.status).toBe(404);

    const notFound = await request(app)
      .get('/api/me/employer/drives/64b000000000000000000000')
      .set('Authorization', `Bearer ${tok}`);
    expect(notFound.status).toBe(404);
  });
});
