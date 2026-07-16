import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);
const body = { name: 'Frontend Engineering', parent: 'Engineering', label: 'Frontend Developer', skills: ['React'], flow: ['TARA', 'MCQ'], cutoff: 65 };

describe('streams routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/streams')).status).toBe(401);
  });
  it('creates (201, canonical flow, v1.0), lists, edits (bump), restores; 400 bad parent; 404 unknown', async () => {
    const c = await auth(request(createApp()).post('/api/streams').send(body));
    expect(c.status).toBe(201);
    expect(c.body.version).toBe('1.0');
    expect(c.body.flow).toEqual(['MCQ', 'TARA']);         // canonicalized
    const id = c.body._id;
    const list = await auth(request(createApp()).get('/api/streams?parent=Engineering'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].code).toMatch(/^STR-/);
    const edited = await auth(request(createApp()).patch(`/api/streams/${id}`).send({ cutoff: 80 }));
    expect(edited.body.version).toBe('1.1');
    const restored = await auth(request(createApp()).post(`/api/streams/${id}/restore`).send({ v: '1.0' }));
    expect(restored.body.version).toBe('1.2');
    expect(restored.body.versions[0].note).toBe('Restored v1.0');
    const bad = await auth(request(createApp()).post('/api/streams').send({ ...body, parent: 'Nope' }));
    expect(bad.status).toBe(400);
    const miss = await auth(request(createApp()).get('/api/streams/64b000000000000000000000'));
    expect(miss.status).toBe(404);
  });
});
