import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { StreamRules } from '../src/models/StreamRules.js';
import { SR_DEFAULTS, getStreamRules, saveStreamRules } from '../src/modules/streamRules/service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('streamRules.service', () => {
  it('GET creates the singleton from defaults when none exists', async () => {
    expect(await StreamRules.countDocuments({})).toBe(0);
    const r = await getStreamRules();
    expect(r.numAllowed).toBe(SR_DEFAULTS.numAllowed);
    expect(r.confidence).toBe(SR_DEFAULTS.confidence);
    expect(await StreamRules.countDocuments({})).toBe(1);
  });

  it('PUT upserts and keeps exactly one doc; round-trips', async () => {
    await getStreamRules();
    const saved = await saveStreamRules({ ...SR_DEFAULTS, numAllowed: '3', confidence: 55, autoSuggest: false });
    expect(saved.numAllowed).toBe('3');
    expect(saved.confidence).toBe(55);
    expect(saved.autoSuggest).toBe(false);
    expect(await StreamRules.countDocuments({})).toBe(1);   // still one
    const reread = await getStreamRules();
    expect(reread.numAllowed).toBe('3');
  });
});
