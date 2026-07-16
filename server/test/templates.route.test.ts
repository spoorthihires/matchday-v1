import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
const body = {
  name: 'Data Analyst', domain: 'Data / Analytics', status: 'Active',
  sections: {
    assessment: { mcq: true, coding: true, tara: true, assignments: false },
    weightage: { MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 },
    matching: { Skills: 40, Experience: 25, 'Domain fit': 20, Location: 15, threshold: 70 },
    kanban: ['Applied', 'Screened', 'Shortlisted'],
    notifications: [{ name: 'Shortlisted', ch: ['Email', 'WhatsApp'] }],
    privacy: { 'Mask contact until shortlist': true, 'Watermark resumes': false },
  },
};

describe('templates routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/templates')).status).toBe(401);
  });

  it('creates (201), lists, filters, clones, restores, deletes; 400 on bad body; 404 on unknown', async () => {
    const c = await auth(request(createApp()).post('/api/templates').send(body));
    expect(c.status).toBe(201);
    expect(c.body.version).toBe('1.0');
    const id = c.body._id;

    const list = await auth(request(createApp()).get('/api/templates?domain=Data / Analytics'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].code).toMatch(/^TPL-/);

    const clone = await auth(request(createApp()).post(`/api/templates/${id}/clone`));
    expect(clone.status).toBe(201);
    expect(clone.body.name).toBe('Data Analyst (Copy)');
    expect(clone.body.status).toBe('Inactive');

    const edited = await auth(request(createApp()).patch(`/api/templates/${id}`).send({ sections: body.sections }));
    expect(edited.body.version).toBe('1.1');
    const restored = await auth(request(createApp()).post(`/api/templates/${id}/restore`).send({ v: '1.0' }));
    expect(restored.body.version).toBe('1.2');
    expect(restored.body.versions[0].note).toBe('Restored v1.0');

    const bad = await auth(request(createApp()).post('/api/templates').send({ ...body, domain: 'Nope' }));
    expect(bad.status).toBe(400);

    const del = await auth(request(createApp()).delete(`/api/templates/${id}`));
    expect(del.body).toEqual({ deleted: true });
    const miss = await auth(request(createApp()).get('/api/templates/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
