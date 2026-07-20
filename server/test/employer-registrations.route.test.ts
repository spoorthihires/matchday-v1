import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
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

async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane SPOC', ...over });
}

function employerToken(emp: { _id: unknown }) {
  return signToken({ sub: String(emp._id), role: 'employer' });
}

const basePayload = (driveId: string) => ({
  driveId,
  role: 'Data Analyst',
  openings: 3,
  ctcMin: 8,
  ctcMax: 14,
  mustHave: ['SQL'],
  preferredWednesday: 'Jul 22',
  timeSlot: '10:00–12:00',
  jd: 'jd.pdf',
  details: { urgency: 'High', cities: ['Hyderabad'] },
});

describe('POST /api/me/employer/registrations', () => {
  it('creates a registration with server-authoritative identity + derived mapping fields', async () => {
    const emp = await employer();
    const d = await drive();
    const tok = employerToken(emp);
    const app = createApp();

    const res = await request(app)
      .post('/api/me/employer/registrations')
      .set('Authorization', `Bearer ${tok}`)
      .send(basePayload(String(d._id)));

    expect(res.status).toBe(201);

    const reg = await RegistrationRequest.findOne({ employerId: emp._id });
    expect(reg).not.toBeNull();
    expect(reg!.company).toBe('Acme');
    expect(reg!.industry).toBe('Tech');
    expect(String(reg!.employerId)).toBe(String(emp._id));
    expect(reg!.ctcRange).toBe('8–14 LPA');
    expect(reg!.skills).toEqual(['SQL']);
    expect(reg!.slot).toBe('Jul 22 · 10:00–12:00');
    expect(reg!.status).toBe('Pending review');
    expect(reg!.details?.urgency).toBe('High');
    expect(reg!.details?.cities).toEqual(['Hyderabad']);
    expect(reg!.submittedBy).toBe('Jane SPOC');
    expect(reg!.activity.length).toBeGreaterThan(0);
  });

  it('shows up in the admin listRegistrations view', async () => {
    const emp = await employer();
    const d = await drive();
    const tok = employerToken(emp);
    const app = createApp();

    await request(app)
      .post('/api/me/employer/registrations')
      .set('Authorization', `Bearer ${tok}`)
      .send(basePayload(String(d._id)));

    const adminTok = signToken({ sub: 'admin1', role: 'admin' });
    const adminRes = await request(app)
      .get('/api/registrations')
      .set('Authorization', `Bearer ${adminTok}`);
    expect(adminRes.status).toBe(200);
    const names = adminRes.body.items.map((r: { company: string }) => r.company);
    expect(names).toContain('Acme');
  });

  it('400 not_registerable when drive employerReg is Closed', async () => {
    const emp = await employer();
    const d = await drive({ visibility: { employerReg: 'Closed', instituteVis: 'All institutes', candidateAccess: 'Public' } });
    const tok = employerToken(emp);
    const app = createApp();

    const res = await request(app)
      .post('/api/me/employer/registrations')
      .set('Authorization', `Bearer ${tok}`)
      .send(basePayload(String(d._id)));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('not_registerable');
  });

  it('400 not_registerable when drive is Draft', async () => {
    const emp = await employer();
    const d = await drive({ status: 'Draft' });
    const tok = employerToken(emp);
    const app = createApp();

    const res = await request(app)
      .post('/api/me/employer/registrations')
      .set('Authorization', `Bearer ${tok}`)
      .send(basePayload(String(d._id)));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('not_registerable');
  });

  it('400 already_registered on duplicate active registration for the same drive', async () => {
    const emp = await employer();
    const d = await drive();
    const tok = employerToken(emp);
    const app = createApp();

    const first = await request(app)
      .post('/api/me/employer/registrations')
      .set('Authorization', `Bearer ${tok}`)
      .send(basePayload(String(d._id)));
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/me/employer/registrations')
      .set('Authorization', `Bearer ${tok}`)
      .send(basePayload(String(d._id)));

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('already_registered');
  });

  it('403 for an admin token; 401 for no token', async () => {
    const d = await drive();
    const app = createApp();

    const noToken = await request(app)
      .post('/api/me/employer/registrations')
      .send(basePayload(String(d._id)));
    expect(noToken.status).toBe(401);

    const adminTok = signToken({ sub: 'admin1', role: 'admin' });
    const forbidden = await request(app)
      .post('/api/me/employer/registrations')
      .set('Authorization', `Bearer ${adminTok}`)
      .send(basePayload(String(d._id)));
    expect(forbidden.status).toBe(403);
  });

  it('cannot spoof company: a client-supplied company is ignored in favor of the authenticated employer profile', async () => {
    const emp = await employer({ name: 'Acme Real Inc' });
    const d = await drive();
    const tok = employerToken(emp);
    const app = createApp();

    const res = await request(app)
      .post('/api/me/employer/registrations')
      .set('Authorization', `Bearer ${tok}`)
      .send({ ...basePayload(String(d._id)), company: 'EvilCo' });

    expect(res.status).toBe(201);
    const reg = await RegistrationRequest.findOne({ employerId: emp._id });
    expect(reg!.company).toBe('Acme Real Inc');
    expect(reg!.company).not.toBe('EvilCo');
  });
});
