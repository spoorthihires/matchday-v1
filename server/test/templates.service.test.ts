import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { DriveTemplate } from '../src/models/DriveTemplate.js';
import {
  bumpVersion, codeFor, listTemplates, createTemplate, getTemplate,
  updateTemplate, cloneTemplate, restoreTemplate, deleteTemplate,
} from '../src/modules/templates/templates.service.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

const sections = () => ({
  assessment: { mcq: true, coding: true, tara: true, assignments: false },
  weightage: { MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 },
  matching: { Skills: 40, Experience: 25, 'Domain fit': 20, Location: 15, threshold: 70 },
  kanban: ['Applied', 'Screened', 'Shortlisted'],
  notifications: [{ name: 'Shortlisted', ch: ['Email', 'WhatsApp'] }],
  privacy: { 'Mask contact until shortlist': true, 'Watermark resumes': false },
});
const input = (over: Record<string, unknown> = {}) => ({
  name: 'Data Analyst', domain: 'Data / Analytics' as const, status: 'Active' as const, sections: sections(), ...over,
});

describe('templates.service', () => {
  it('bumpVersion increments the minor component', () => {
    expect(bumpVersion('2.1')).toBe('2.2');
    expect(bumpVersion('1.9')).toBe('1.10');
    expect(bumpVersion('1')).toBe('1.1');
  });

  it('creates at v1.0 with an initial version entry', async () => {
    const t = await createTemplate(input());
    expect(t.version).toBe('1.0');
    expect(t.versions).toHaveLength(1);
    expect(t.versions[0]).toMatchObject({ v: '1.0', by: 'Platform Admin', note: 'Initial template' });
  });

  it('lists with q/domain/status filters, newest-updated first, with id + code', async () => {
    await createTemplate(input({ name: 'Alpha ML', domain: 'Machine Learning' }));
    await createTemplate(input({ name: 'Beta Biz', domain: 'Business', status: 'Inactive' }));
    const all = await listTemplates({});
    expect(all.items).toHaveLength(2);
    expect(all.items[0].id).toBeTruthy();
    expect(all.items[0].code).toMatch(/^TPL-[0-9A-F]{3}$/);
    // newest-updated first: 'Beta Biz' was created second, so it must sort ahead of 'Alpha ML'
    expect(all.items[0].name).toBe('Beta Biz');
    expect(all.items[1].name).toBe('Alpha ML');
    expect((await listTemplates({ q: 'alpha' })).items).toHaveLength(1);
    expect((await listTemplates({ domain: 'Business' })).items).toHaveLength(1);
    expect((await listTemplates({ status: 'Inactive' })).items).toHaveLength(1);
  });

  it('PATCH with sections bumps version + logs "Edited configuration"; status-only does not', async () => {
    const t = await createTemplate(input());
    const edited = await updateTemplate(String(t._id), { sections: sections() });
    expect(edited.version).toBe('1.1');
    expect(edited.versions).toHaveLength(2);
    expect(edited.versions[0].note).toBe('Edited configuration');
    // Re-fetch from the DB: proves markModified('sections') actually persisted the Mixed field
    // (the in-memory doc would reflect the assignment regardless).
    const refetched = await DriveTemplate.findById(String(t._id)).lean();
    expect(refetched?.sections).toEqual(sections());
    const toggled = await updateTemplate(String(t._id), { status: 'Inactive' });
    expect(toggled.version).toBe('1.1');            // unchanged
    expect(toggled.versions).toHaveLength(2);       // no new entry
    expect(toggled.status).toBe('Inactive');
  });

  it('clones as "(Copy)", Inactive, v1.0, usedBy 0, with a clone entry', async () => {
    const t = await createTemplate(input({ name: 'ML Engineer', status: 'Active' }));
    t.usedBy = 5; await t.save();
    const c = await cloneTemplate(String(t._id));
    expect(c.name).toBe('ML Engineer (Copy)');
    expect(c.status).toBe('Inactive');
    expect(c.version).toBe('1.0');
    expect(c.usedBy).toBe(0);
    expect(c.versions[0].note).toBe('Cloned from ML Engineer');
    expect(await DriveTemplate.countDocuments({})).toBe(2);
  });

  it('restores an older version: bump + "Restored v{v}" entry, sections unchanged; unknown v → 400', async () => {
    const t = await createTemplate(input());
    await updateTemplate(String(t._id), { sections: sections() });   // now v1.1, entries [1.1, 1.0]
    // snapshot the persisted sections before restore — restore must NOT roll them back
    const snapshot = (await DriveTemplate.findById(String(t._id)).lean())?.sections;
    const restored = await restoreTemplate(String(t._id), '1.0');
    expect(restored.version).toBe('1.2');
    expect(restored.versions[0].note).toBe('Restored v1.0');
    expect(restored.sections).toEqual(snapshot);
    // unknown version → specifically a 400 validation error
    await expect(restoreTemplate(String(t._id), '9.9')).rejects.toMatchObject({ status: 400, code: 'validation' });
  });

  it('deletes and 404s on unknown/malformed ids', async () => {
    const t = await createTemplate(input());
    expect(await deleteTemplate(String(t._id))).toEqual({ deleted: true });
    await expect(getTemplate(String(t._id))).rejects.toThrow();
    await expect(getTemplate('nope')).rejects.toThrow();
  });
});
