import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { RegistrationRequest } from '../src/models/RegistrationRequest.js';
import { Employer } from '../src/models/Employer.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
const empBody = { name: 'Nexatech Labs', industry: 'Product · SaaS', size: '201–1000', spoc: 'R. Iyer', email: 'talent@nexatech.com' };

describe('employers + registrations routes', () => {
  it('401s without a token (both modules)', async () => {
    expect((await request(createApp()).get('/api/employers')).status).toBe(401);
    expect((await request(createApp()).get('/api/registrations')).status).toBe(401);
  });
  it('creates (Pending default) then lists an employer; bulk rejects assign', async () => {
    const c = await auth(request(createApp()).post('/api/employers').send(empBody));
    expect(c.status).toBe(201);
    expect(c.body.status).toBe('Pending');
    const list = await auth(request(createApp()).get('/api/employers'));
    expect(list.body.total).toBe(1);
    const asg = await auth(request(createApp()).post('/api/employers/bulk').send({ ids: [c.body._id], action: 'assign' }));
    expect(asg.status).toBe(400);
  });
  it('registration approve endpoint upserts the employer', async () => {
    const r = await RegistrationRequest.create({ company: 'Vaultline Systems', industry: 'Fintech', role: 'BE', submittedBy: 'D. Sharma' });
    const res = await auth(request(createApp()).post(`/api/registrations/${r._id}/action`).send({ action: 'approve' }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Approved');
    expect(await Employer.countDocuments({ name: 'Vaultline Systems' })).toBe(1);
    const again = await auth(request(createApp()).post(`/api/registrations/${r._id}/action`).send({ action: 'reject' }));
    expect(again.status).toBe(400);
  });
  it('registrations list returns counts; bad action body 400s; 404 on unknown id', async () => {
    await RegistrationRequest.create({ company: 'A', industry: 'Fintech', role: 'X' });
    const list = await auth(request(createApp()).get('/api/registrations'));
    expect(list.body.counts).toEqual({ pending: 1, total: 1 });
    const bad = await auth(request(createApp()).post(`/api/registrations/${list.body.items[0]._id}/action`).send({ action: 'explode' }));
    expect(bad.status).toBe(400);
    const miss = await auth(request(createApp()).get('/api/registrations/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
