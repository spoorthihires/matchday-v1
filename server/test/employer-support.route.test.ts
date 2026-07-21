import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Employer } from '../src/models/Employer.js';
import { SupportRequest } from '../src/models/SupportRequest.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function employer(over: Record<string, unknown> = {}) {
  return Employer.create({ name: 'Acme', industry: 'Tech', email: 'a@a.test', status: 'Active', passwordHash: 'x', spoc: 'Jane', ...over });
}
function tokenFor(e: { _id: unknown }) { return signToken({ sub: String(e._id), role: 'employer' }); }

describe('employer support', () => {
  it('POST creates an Open request (employerId server-set, derived ref, spoofed fields ignored)', async () => {
    const emp = await employer();
    const res = await request(createApp()).post('/api/me/employer/support')
      .set('Authorization', `Bearer ${tokenFor(emp)}`)
      .send({ category: 'No-show', subject: 'Candidate absent', message: 'The 10am candidate did not show.', priority: 'High', employerId: '000000000000000000000000', status: 'Resolved' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Open');           // spoofed status ignored
    expect(res.body.category).toBe('No-show');
    expect(res.body.priority).toBe('High');
    expect(res.body.ref).toBe(`SUP-${String(res.body.id).slice(-6).toUpperCase()}`);
    // persisted under the caller's employerId, not the spoofed one
    const doc = await SupportRequest.findById(res.body.id).lean();
    expect(String(doc!.employerId)).toBe(String(emp._id));
  });

  it('POST rejects a bad category / empty subject', async () => {
    const emp = await employer(); const auth = { Authorization: `Bearer ${tokenFor(emp)}` };
    expect((await request(createApp()).post('/api/me/employer/support').set(auth).send({ category: 'Nope', subject: 'x', message: 'y' })).status).toBe(400);
    expect((await request(createApp()).post('/api/me/employer/support').set(auth).send({ category: 'Other', subject: '  ', message: 'y' })).status).toBe(400);
  });

  it('GET lists only the caller\'s own requests, newest-first', async () => {
    const a = await employer(); const b = await employer({ email: 'b@b.test', name: 'Beta' });
    const app = createApp();
    await request(app).post('/api/me/employer/support').set('Authorization', `Bearer ${tokenFor(a)}`).send({ category: 'Other', subject: 'first', message: 'm' });
    await request(app).post('/api/me/employer/support').set('Authorization', `Bearer ${tokenFor(a)}`).send({ category: 'Other', subject: 'second', message: 'm' });
    await request(app).post('/api/me/employer/support').set('Authorization', `Bearer ${tokenFor(b)}`).send({ category: 'Other', subject: 'bee', message: 'm' });
    const listA = await request(app).get('/api/me/employer/support').set('Authorization', `Bearer ${tokenFor(a)}`);
    expect(listA.status).toBe(200);
    expect(listA.body.items).toHaveLength(2);
    expect(listA.body.items.map((i: { subject: string }) => i.subject)).not.toContain('bee');
    expect(listA.body.items[0].subject).toBe('second'); // newest first
  });

  it('401 no token / 403 admin token', async () => {
    const a = await employer();
    expect((await request(createApp()).get('/api/me/employer/support')).status).toBe(401);
    expect((await request(createApp()).get('/api/me/employer/support').set('Authorization', `Bearer ${signToken({ sub: String(a._id), role: 'admin' })}`)).status).toBe(403);
  });
});
