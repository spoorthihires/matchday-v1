import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('POST /api/auth/login (employer)', () => {
  it('an employer with a valid passwordHash logs in as role=employer', async () => {
    await Employer.create({
      name: 'Acme', industry: 'Tech', email: 'hire@acme.test', status: 'Active',
      passwordHash: await hashPassword('Employer123!'),
    });
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'hire@acme.test', password: 'Employer123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.role).toBe('employer');
  });

  it('wrong employer password → 401', async () => {
    await Employer.create({
      name: 'Acme', industry: 'Tech', email: 'hire@acme.test', status: 'Active',
      passwordHash: await hashPassword('Employer123!'),
    });
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'hire@acme.test', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('auth');
  });

  it('401s for an employer without a passwordHash', async () => {
    await Employer.create({ name: 'Acme', industry: 'Tech', email: 'nopass@acme.test', status: 'Active' });
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'nopass@acme.test', password: 'whatever' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/employer-signup', () => {
  it('creates a Pending employer with a hashed password + returns a token', async () => {
    const body = {
      name: 'NewCo', website: 'newco.com', industry: 'Tech', size: '51–200', hiringType: 'Full-time',
      workLocations: ['Hyderabad'], spoc: 'Asha', designation: 'TA', email: 'ta@newco.test', phone: '9',
      billingContact: 'fin@newco.test', gstNumber: '22ABCDE1234F1Z5', acceptTerms: true, acceptPrivacy: true,
      password: 'Secret123!',
    };
    const res = await request(createApp()).post('/api/auth/employer-signup').send(body);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.role).toBe('employer');
    const emp = await Employer.findOne({ email: 'ta@newco.test' });
    expect(emp!.status).toBe('Pending');
    expect(emp!.passwordHash).toBeTruthy();
    expect(emp!.passwordHash).not.toBe('Secret123!'); // hashed
  });

  it('duplicate email signup → 400', async () => {
    await Employer.create({ name: 'X', industry: 'Tech', email: 'dup@x.test', status: 'Active' });
    const res = await request(createApp()).post('/api/auth/employer-signup').send({
      name: 'Y', industry: 'Tech', size: '51–200', spoc: 'A', email: 'dup@x.test',
      acceptTerms: true, acceptPrivacy: true, password: 'Secret123!',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });

  it('400s when terms/privacy are not accepted', async () => {
    const res = await request(createApp()).post('/api/auth/employer-signup').send({
      name: 'Y', industry: 'Tech', size: '51–200', spoc: 'A', email: 'noterms@x.test',
      acceptTerms: false, acceptPrivacy: true, password: 'Secret123!',
    });
    expect(res.status).toBe(400);
  });
});
