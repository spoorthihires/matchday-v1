import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Stream } from '../src/models/Stream.js';
import {
  bumpVersion, codeFor, orderedFlow, listStreams, createStream,
  getStream, updateStream, restoreStream,
} from '../src/modules/streams/service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const input = (over: Record<string, unknown> = {}) => ({
  name: 'Frontend Engineering', parent: 'Engineering' as const, label: 'Frontend Developer',
  skills: ['React'], good: ['Next.js'], flow: ['TARA', 'MCQ', 'Coding'] as ('MCQ'|'Coding'|'TARA'|'Assignment')[],
  cutoff: 65, cgpa: 6.5, backlogs: 1, grad: ['2025'], branches: ['CSE'], sources: ['Institutes'], status: 'Active' as const, ...over,
});

describe('streams.service', () => {
  it('bumpVersion increments minor; orderedFlow canonicalizes', () => {
    expect(bumpVersion('1.3')).toBe('1.4');
    expect(orderedFlow(['TARA', 'MCQ', 'Coding'])).toEqual(['MCQ', 'Coding', 'TARA']);
    expect(codeFor('64b000000000000000000abc')).toBe('STR-ABC');
  });

  it('creates at v1.0 with an initial entry and canonical flow', async () => {
    const s = await createStream(input());
    expect(s.version).toBe('1.0');
    expect(s.versions).toHaveLength(1);
    expect(s.versions[0]).toMatchObject({ v: '1.0', by: 'Platform Admin', note: 'Initial stream' });
    expect(s.flow).toEqual(['MCQ', 'Coding', 'TARA']);   // canonicalized on create
  });

  it('lists with q/parent/status filters and sorts by cutoff', async () => {
    await createStream(input({ name: 'Alpha', parent: 'Engineering', cutoff: 60 }));
    await createStream(input({ name: 'Beta', parent: 'Business', cutoff: 80, status: 'Disabled' }));
    expect((await listStreams({})).items).toHaveLength(2);
    expect((await listStreams({ parent: 'Business' })).items).toHaveLength(1);
    expect((await listStreams({ status: 'Disabled' })).items).toHaveLength(1);
    expect((await listStreams({ q: 'alpha' })).items).toHaveLength(1);
    const byCutoffDesc = await listStreams({ sort: 'cutoff', order: 'desc' });
    expect(byCutoffDesc.items[0].name).toBe('Beta');   // cutoff 80 first
    expect(byCutoffDesc.items[0].code).toMatch(/^STR-[0-9A-F]{3}$/);
  });

  it('sorts by name case-insensitively (collation, not raw ASCII)', async () => {
    // A case-sensitive ASCII sort orders 'B' (66) before 'a' (97) -> [Beta, apex] (WRONG).
    // The collation({locale:'en', strength:2}) must fold case -> [apex, Beta].
    await createStream(input({ name: 'Beta Stream' }));
    await createStream(input({ name: 'apex Stream' }));
    const byName = await listStreams({ sort: 'name', order: 'asc' });
    expect(byName.items.map((i) => i.name)).toEqual(['apex Stream', 'Beta Stream']);
  });

  it('PATCH with a config field bumps + logs; status-only does NOT bump', async () => {
    const s = await createStream(input());
    const edited = await updateStream(String(s._id), { cutoff: 70 });
    expect(edited.version).toBe('1.1');
    expect(edited.versions[0].note).toBe('Edited stream configuration');
    const toggled = await updateStream(String(s._id), { status: 'Disabled' });
    expect(toggled.version).toBe('1.1');            // unchanged
    expect(toggled.versions).toHaveLength(2);       // no new entry
    expect(toggled.status).toBe('Disabled');
    // flow re-canonicalized on edit
    const reflowed = await updateStream(String(s._id), { flow: ['Assignment', 'MCQ'] });
    expect(reflowed.flow).toEqual(['MCQ', 'Assignment']);
  });

  it('restores an older version: bump + "Restored v{v}"; unknown v → 400', async () => {
    const s = await createStream(input());
    await updateStream(String(s._id), { cutoff: 70 });   // v1.1
    const restored = await restoreStream(String(s._id), '1.0');
    expect(restored.version).toBe('1.2');
    expect(restored.versions[0].note).toBe('Restored v1.0');
    await expect(restoreStream(String(s._id), '9.9')).rejects.toMatchObject({ status: 400, code: 'validation' });
  });

  it('combined status+config PATCH still bumps (real editor-save path)', async () => {
    const s = await createStream(input());
    // The editor sends status alongside all config fields; status in the patch must NOT
    // suppress the bump when a config field is also present.
    const edited = await updateStream(String(s._id), { status: 'Disabled', cutoff: 80 });
    expect(edited.version).toBe('1.1');                          // bumped
    expect(edited.status).toBe('Disabled');
    expect(edited.cutoff).toBe(80);
    expect(edited.versions).toHaveLength(2);
    expect(edited.versions[0].note).toBe('Edited stream configuration');
  });

  it('partial PATCH does not clobber untouched stored fields (service-level guard)', async () => {
    const s = await createStream(input({ skills: ['React', 'Vue'], cgpa: 7.2, label: 'Frontend Developer' }));
    const edited = await updateStream(String(s._id), { cutoff: 90 });
    expect(edited.cutoff).toBe(90);
    expect(edited.skills).toEqual(['React', 'Vue']);            // untouched
    expect(edited.cgpa).toBe(7.2);                             // untouched
    expect(edited.label).toBe('Frontend Developer');           // untouched
    expect(edited.good).toEqual(['Next.js']);                  // untouched
  });

  it('restore is ledger-only: stored config is NOT rolled back', async () => {
    const s = await createStream(input({ cutoff: 65 }));
    await updateStream(String(s._id), { cutoff: 90 });          // v1.1
    const restored = await restoreStream(String(s._id), '1.0');
    expect(restored.cutoff).toBe(90);                           // still 90, NOT rolled back to 65
    expect(restored.version).toBe('1.2');
    expect(restored.versions[0].note).toBe('Restored v1.0');
  });

  it('404s on unknown/malformed ids', async () => {
    await expect(getStream('64b000000000000000000000')).rejects.toThrow();
    await expect(getStream('nope')).rejects.toThrow();
  });
});
