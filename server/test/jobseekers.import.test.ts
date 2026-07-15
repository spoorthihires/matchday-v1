import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { previewImport, commitImport } from '../src/modules/jobseekers/jobseekers.import.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function seedInstitute() {
  await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering College', status: 'Active' });
}
const goodRow = (over = {}) => ({ name: 'Aarav Sharma', email: 'aarav@cbit.edu', institute: 'CBIT', branch: 'CSE', gradYear: '2026', cgpa: '8.4', ...over });

describe('jobseekers import', () => {
  it('flags validation errors (missing field, bad email, cgpa range, unknown institute, bad year)', async () => {
    await seedInstitute();
    const rows = [
      goodRow(),
      goodRow({ name: '', email: 'x@x.edu' }),          // missing name
      goodRow({ email: 'not-an-email' }),                // bad email
      goodRow({ email: 'b@cbit.edu', cgpa: '11' }),      // cgpa out of range
      goodRow({ email: 'c@cbit.edu', institute: 'Nowhere U' }), // unknown institute
      goodRow({ email: 'd@cbit.edu', gradYear: '1999' }),// bad year
    ];
    const { rows: r, summary } = await previewImport(rows);
    expect(r[0].valid).toBe(true);
    expect(r[1].valid).toBe(false); expect(r[1].errors.join()).toMatch(/name/i);
    expect(r[2].valid).toBe(false); expect(r[2].errors.join()).toMatch(/email/i);
    expect(r[3].valid).toBe(false); expect(r[3].errors.join()).toMatch(/cgpa/i);
    expect(r[4].valid).toBe(false); expect(r[4].errors.join()).toMatch(/institute/i);
    expect(r[5].valid).toBe(false); expect(r[5].errors.join()).toMatch(/year/i);
    expect(summary.total).toBe(6);
    expect(summary.invalid).toBe(5);
    expect(summary.valid).toBe(1);
  });

  it('detects within-batch and existing duplicates', async () => {
    await seedInstitute();
    const inst = await Institute.findOne({ name: 'CBIT' });
    await Jobseeker.create({ name: 'Existing One', instituteId: inst!._id, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Seed', email: 'exists@cbit.edu' });
    const rows = [
      goodRow({ email: 'new@cbit.edu' }),                       // ok
      goodRow({ email: 'new@cbit.edu', name: 'Different' }),    // within-batch dup email
      goodRow({ email: 'exists@cbit.edu', name: 'Someone' }),   // dup vs existing (email)
    ];
    const { rows: r, summary } = await previewImport(rows);
    expect(r[0].dupe).toBe(false);
    expect(r[1].dupe).toBe(true); expect(r[1].dupeReason).toMatch(/within/i);
    expect(r[2].dupe).toBe(true); expect(r[2].dupeReason).toMatch(/exist/i);
    expect(summary.duplicates).toBe(2);
    expect(summary.willImport).toBe(1);
  });

  it('commits only valid non-duplicate rows with defaults', async () => {
    await seedInstitute();
    const rows = [
      goodRow({ email: 'p@cbit.edu' }),
      goodRow({ email: 'p@cbit.edu', name: 'Dup' }),   // within-batch dup
      goodRow({ email: 'bad', name: 'Invalid' }),      // invalid
    ];
    const res = await commitImport(rows);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(2);
    expect(res.skippedReasons).toEqual({ duplicates: 1, invalid: 1 });
    const inserted = await Jobseeker.findOne({ email: 'p@cbit.edu' });
    expect(inserted!.stage).toBe('Applied');
    expect(inserted!.evaluationStatus).toBe('na');
    expect(inserted!.source).toBe('Bulk import');
    expect(inserted!.profileCompleted).toBe(false);
  });
});
