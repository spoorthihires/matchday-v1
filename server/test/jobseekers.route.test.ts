import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);

describe('jobseekers routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/jobseekers')).status).toBe(401);
  });
  it('adds then lists a jobseeker with derived fields', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College' });
    const c = await auth(request(createApp()).post('/api/jobseekers').send({ name: 'Aarav', instituteId: String(inst._id), branch: 'CSE', gradYear: 2026, cgpa: 8 }));
    expect(c.status).toBe(201);
    const list = await auth(request(createApp()).get('/api/jobseekers'));
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].offerStatus).toBe('None');
    expect(list.body.items[0].code).toMatch(/^C-/);
  });
  it('import preview then commit', async () => {
    await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College' });
    const rows = [
      { name: 'A One', email: 'a1@cbit.edu', institute: 'CBIT', branch: 'CSE', gradYear: '2026', cgpa: '8' },
      { name: 'A One', email: 'a1@cbit.edu', institute: 'CBIT', branch: 'CSE', gradYear: '2026', cgpa: '8' },   // dup email in-batch
      { name: 'Bad', email: 'nope', institute: 'CBIT', gradYear: '2026', cgpa: '8' },            // invalid email
    ];
    const prev = await auth(request(createApp()).post('/api/jobseekers/import/preview').send({ rows }));
    expect(prev.body.summary).toMatchObject({ total: 3, willImport: 1, duplicates: 1, invalid: 1 });
    const commit = await auth(request(createApp()).post('/api/jobseekers/import/commit').send({ rows }));
    expect(commit.body).toMatchObject({ imported: 1, skipped: 2 });
    const list = await auth(request(createApp()).get('/api/jobseekers'));
    expect(list.body.total).toBe(1);
  });
  it('blocks (consent → Revoked) and 404s on unknown id', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyd', type: 'Bootcamp' });
    const c = await auth(request(createApp()).post('/api/jobseekers').send({ name: 'X', instituteId: String(inst._id), branch: 'CSE', gradYear: 2026, cgpa: 7 }));
    const b = await auth(request(createApp()).post('/api/jobseekers/bulk').send({ ids: [c.body._id], action: 'block' }));
    expect(b.body.affected).toBe(1);
    const miss = await auth(request(createApp()).get('/api/jobseekers/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
  it('400s on a malformed instituteId', async () => {
    const res = await auth(request(createApp()).post('/api/jobseekers').send({ name: 'X', instituteId: 'not-an-id', branch: 'CSE', gradYear: 2026, cgpa: 7 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });
});
