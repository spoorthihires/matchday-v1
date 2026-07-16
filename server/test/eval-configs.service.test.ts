import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { EvalConfig } from '../src/models/EvalConfig.js';
import {
  codeFor, listEvalConfigs, createEvalConfig, getEvalConfig,
  updateEvalConfig, duplicateEvalConfig, deleteEvalConfig,
} from '../src/modules/evalConfigs/service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const input = (over: Record<string, unknown> = {}) => ({
  name: 'Standard MCQ round', type: 'MCQ' as const, enabled: true, passing: 60, attempts: 2,
  retake: 'After cooldown' as const, cooldown: 2, validity: 90, autoQual: true, threshold: 70, ...over,
});

describe('evalConfigs.service', () => {
  it('creates with contests=0 and a TPL-style code + id', async () => {
    const c = await createEvalConfig(input());
    expect(c.contests).toBe(0);
    const { items } = await listEvalConfigs({});
    expect(items[0].code).toMatch(/^EVC-[0-9A-F]{3}$/);
    expect(items[0].id).toBeTruthy();
  });

  it('lists with q/type/status filters, newest-updated first', async () => {
    await createEvalConfig(input({ name: 'Alpha MCQ', type: 'MCQ', enabled: true }));
    await createEvalConfig(input({ name: 'Beta Coding', type: 'Coding', enabled: false }));
    const all = await listEvalConfigs({});
    expect(all.items).toHaveLength(2);
    expect(all.items[0].name).toBe('Beta Coding');           // newest-updated first
    expect((await listEvalConfigs({ q: 'alpha' })).items).toHaveLength(1);
    expect((await listEvalConfigs({ type: 'Coding' })).items).toHaveLength(1);
    expect((await listEvalConfigs({ status: 'Active' })).items).toHaveLength(1);   // enabled true
    expect((await listEvalConfigs({ status: 'Inactive' })).items).toHaveLength(1); // enabled false
  });

  it('patches (incl. enable toggle) and bumps updatedAt', async () => {
    const c = await createEvalConfig(input({ enabled: true }));
    const off = await updateEvalConfig(String(c._id), { enabled: false });
    expect(off.enabled).toBe(false);
    const rescored = await updateEvalConfig(String(c._id), { passing: 80 });
    expect(rescored.passing).toBe(80);
    expect(rescored.enabled).toBe(false);   // prior toggle preserved (no default clobber)
  });

  it('duplicates as "(Copy)", disabled, contests 0', async () => {
    const c = await createEvalConfig(input({ name: 'Coding challenge', enabled: true }));
    c.contests = 6; await c.save();
    const d = await duplicateEvalConfig(String(c._id));
    expect(d.name).toBe('Coding challenge (Copy)');
    expect(d.enabled).toBe(false);
    expect(d.contests).toBe(0);
    expect(d.passing).toBe(c.passing);
    expect(await EvalConfig.countDocuments({})).toBe(2);
  });

  it('deletes and 404s on unknown/malformed ids', async () => {
    const c = await createEvalConfig(input());
    expect(await deleteEvalConfig(String(c._id))).toEqual({ deleted: true });
    await expect(getEvalConfig(String(c._id))).rejects.toThrow();
    await expect(getEvalConfig('nope')).rejects.toThrow();
  });

  it('codeFor derives EVC-<3 upper hex>', () => {
    expect(codeFor('64b000000000000000000abc')).toBe('EVC-ABC');
  });
});
