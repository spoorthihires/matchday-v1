import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { SR_DEFAULTS } from '../src/modules/streamRules/service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${signToken({ sub: 'u1', role: 'admin' })}`);

describe('stream-rules routes', () => {
  it('401s without a token', async () => {
    expect((await request(createApp()).get('/api/stream-rules')).status).toBe(401);
  });
  it('GET returns defaults; PUT saves and re-GET reflects it; 400 on bad enum', async () => {
    const g = await auth(request(createApp()).get('/api/stream-rules'));
    expect(g.status).toBe(200);
    expect(g.body.numAllowed).toBe('2');
    const put = await auth(request(createApp()).put('/api/stream-rules').send({ ...SR_DEFAULTS, numAllowed: 'Unlimited', reuseEval: false }));
    expect(put.status).toBe(200);
    expect(put.body.numAllowed).toBe('Unlimited');
    const g2 = await auth(request(createApp()).get('/api/stream-rules'));
    expect(g2.body.numAllowed).toBe('Unlimited');
    const bad = await auth(request(createApp()).put('/api/stream-rules').send({ ...SR_DEFAULTS, changePolicy: 'whenever' }));
    expect(bad.status).toBe(400);
  });
});
