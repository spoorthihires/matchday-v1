import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('GET /api/auth/institutes', () => {
  it('returns the seeded institute with no auth required (id + name only)', async () => {
    const institute = await Institute.create({ name: 'Acme Institute of Tech', city: 'Hyderabad', type: 'Engineering', status: 'Active' });
    const res = await request(createApp()).get('/api/auth/institutes');
    expect(res.status).toBe(200);
    expect(res.body.items).toContainEqual({ id: String(institute._id), name: 'Acme Institute of Tech' });
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(['id', 'name']);
    }
  });

  it('does not return a Disabled institute', async () => {
    const disabled = await Institute.create({ name: 'Disabled Institute', city: 'Pune', type: 'Engineering', status: 'Disabled' });
    const res = await request(createApp()).get('/api/auth/institutes');
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).not.toContain(String(disabled._id));
  });
});

describe('POST /api/auth/jobseeker-signup', () => {
  it('creates an Applied jobseeker with a hashed password + returns a working jobseeker token', async () => {
    const institute = await Institute.create({ name: 'Acme Institute of Tech', city: 'Hyderabad', type: 'Engineering', status: 'Active' });
    const body = {
      name: 'Priya Sharma', email: 'priya@matchday.dev', password: 'Secret123!',
      instituteId: String(institute._id), branch: 'CSE', gradYear: 2026, source: 'Institutes', cgpa: 8.5,
    };
    const res = await request(createApp()).post('/api/auth/jobseeker-signup').send(body);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ role: 'jobseeker', name: 'Priya Sharma', email: 'priya@matchday.dev' });
    expect(res.body.user.id).toBeTypeOf('string');

    const seeker = await Jobseeker.findOne({ email: 'priya@matchday.dev' });
    expect(seeker).toBeTruthy();
    expect(seeker!.stage).toBe('Applied');
    expect(seeker!.profileCompleted).toBe(false);
    expect(seeker!.evaluationStatus).toBe('na');
    expect(seeker!.passwordHash).toBeTruthy();
    expect(seeker!.passwordHash).not.toBe('Secret123!');

    // the returned token is a working jobseeker login
    const portalRes = await request(createApp()).get('/api/me/portal')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(portalRes.status).toBe(200);

    // and the same credentials can log in via POST /api/auth/login
    const loginRes = await request(createApp()).post('/api/auth/login')
      .send({ email: 'priya@matchday.dev', password: 'Secret123!' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe('jobseeker');
  });

  it('duplicate email signup → 400 validation', async () => {
    const institute = await Institute.create({ name: 'Acme Institute of Tech', city: 'Hyderabad', type: 'Engineering' });
    await Jobseeker.create({
      name: 'Existing', instituteId: institute._id, branch: 'CSE', gradYear: 2026, cgpa: 8,
      source: 'Institutes', email: 'dup@matchday.dev',
    });
    const res = await request(createApp()).post('/api/auth/jobseeker-signup').send({
      name: 'New Person', email: 'dup@matchday.dev', password: 'Secret123!',
      instituteId: String(institute._id), branch: 'CSE', gradYear: 2026, source: 'Institutes', cgpa: 8,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });

  it('missing/invalid instituteId → 400', async () => {
    const res = await request(createApp()).post('/api/auth/jobseeker-signup').send({
      name: 'New Person', email: 'noinst@matchday.dev', password: 'Secret123!',
      instituteId: 'not-a-real-id', branch: 'CSE', gradYear: 2026, source: 'Institutes', cgpa: 8,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });

  it('short password (<8) → 400', async () => {
    const institute = await Institute.create({ name: 'Acme Institute of Tech', city: 'Hyderabad', type: 'Engineering', status: 'Active' });
    const res = await request(createApp()).post('/api/auth/jobseeker-signup').send({
      name: 'New Person', email: 'shortpw@matchday.dev', password: 'short',
      instituteId: String(institute._id), branch: 'CSE', gradYear: 2026, source: 'Institutes', cgpa: 8,
    });
    expect(res.status).toBe(400);
  });

  it('non-Active institute (Disabled) → 400', async () => {
    const institute = await Institute.create({ name: 'Disabled Institute', city: 'Pune', type: 'Engineering', status: 'Disabled' });
    const res = await request(createApp()).post('/api/auth/jobseeker-signup').send({
      name: 'New Person', email: 'disabledinst@matchday.dev', password: 'Secret123!',
      instituteId: String(institute._id), branch: 'CSE', gradYear: 2026, source: 'Institutes', cgpa: 8,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });

  it('non-Active institute (Pending) → 400', async () => {
    const institute = await Institute.create({ name: 'Pending Institute', city: 'Pune', type: 'Engineering', status: 'Pending' });
    const res = await request(createApp()).post('/api/auth/jobseeker-signup').send({
      name: 'New Person', email: 'pendinginst@matchday.dev', password: 'Secret123!',
      instituteId: String(institute._id), branch: 'CSE', gradYear: 2026, source: 'Institutes', cgpa: 8,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });
});
