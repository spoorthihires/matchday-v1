import { Types } from 'mongoose';
import { Institute } from '../../models/Institute.js';
import { Jobseeker } from '../../models/Jobseeker.js';

export interface RawRow { name?: string; email?: string; institute?: string; branch?: string; gradYear?: string | number; cgpa?: string | number; source?: string; }
export interface RowResult {
  index: number;
  data: { name: string; email: string; instituteId: string | null; instituteName: string | null; branch: string; gradYear: number | null; cgpa: number | null; source: string };
  valid: boolean; errors: string[]; dupe: boolean; dupeReason?: string;
}
export interface Summary { total: number; valid: number; invalid: number; duplicates: number; willImport: number; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown) => (v == null ? '' : String(v).trim());

async function analyze(rows: RawRow[]): Promise<RowResult[]> {
  const institutes = await Institute.find({}).select('name').lean();
  const instByName = new Map(institutes.map((i) => [String(i.name).toLowerCase(), i]));

  const existing = await Jobseeker.find({}).select('name email instituteId').lean();
  const existEmails = new Set(existing.filter((e) => e.email).map((e) => String(e.email).toLowerCase()));
  const existNameInst = new Set(existing.map((e) => `${String(e.name).toLowerCase()}|${String(e.instituteId)}`));

  const seenEmails = new Set<string>();
  const seenNameInst = new Set<string>();

  return rows.map((row, index) => {
    const name = clean(row.name);
    const email = clean(row.email).toLowerCase();
    const instName = clean(row.institute);
    const branch = clean(row.branch) || 'CSE';
    const errors: string[] = [];
    if (!name) errors.push('Name is required');
    if (!email) errors.push('Email is required');
    else if (!EMAIL_RE.test(email)) errors.push('Invalid email format');
    const inst = instName ? instByName.get(instName.toLowerCase()) : undefined;
    if (!instName) errors.push('Institute is required');
    else if (!inst) errors.push('Unknown institute');
    let gradYear: number | null = null;
    if (row.gradYear != null && clean(row.gradYear) !== '') {
      const y = Number(row.gradYear);
      if (!Number.isInteger(y) || y < 2020 || y > 2030) errors.push('Graduation year must be 2020–2030');
      else gradYear = y;
    }
    let cgpa: number | null = null;
    if (row.cgpa != null && clean(row.cgpa) !== '') {
      const c = Number(row.cgpa);
      if (Number.isNaN(c) || c < 0 || c > 10) errors.push('CGPA must be 0–10');
      else cgpa = c;
    }
    const valid = errors.length === 0;
    let dupe = false; let dupeReason: string | undefined;
    const instId = inst ? String(inst._id) : null;
    if (valid && instId) {
      const nameKey = `${name.toLowerCase()}|${instId}`;
      if (seenEmails.has(email)) { dupe = true; dupeReason = 'Duplicate email within file'; }
      else if (seenNameInst.has(nameKey)) { dupe = true; dupeReason = 'Duplicate name+institute within file'; }
      else if (existEmails.has(email)) { dupe = true; dupeReason = 'Email already exists'; }
      else if (existNameInst.has(nameKey)) { dupe = true; dupeReason = 'Candidate already exists'; }
      seenEmails.add(email); seenNameInst.add(nameKey);
    }
    return {
      index,
      data: { name, email, instituteId: instId, instituteName: inst ? String(inst.name) : null, branch, gradYear, cgpa, source: clean(row.source) || 'Bulk import' },
      valid, errors, dupe, dupeReason,
    };
  });
}

function summarize(rows: RowResult[]): Summary {
  const valid = rows.filter((r) => r.valid).length;
  const duplicates = rows.filter((r) => r.valid && r.dupe).length;
  return { total: rows.length, valid, invalid: rows.length - valid, duplicates, willImport: rows.filter((r) => r.valid && !r.dupe).length };
}

export async function previewImport(rows: RawRow[]) {
  const analyzed = await analyze(rows);
  return { rows: analyzed, summary: summarize(analyzed) };
}

export async function commitImport(rows: RawRow[]) {
  const analyzed = await analyze(rows);
  const toInsert = analyzed.filter((r) => r.valid && !r.dupe);
  if (toInsert.length) {
    await Jobseeker.insertMany(toInsert.map((r) => ({
      name: r.data.name, email: r.data.email, instituteId: new Types.ObjectId(r.data.instituteId as string),
      branch: r.data.branch, gradYear: r.data.gradYear ?? 2026, cgpa: r.data.cgpa ?? 0, source: 'Bulk import',
      stage: 'Applied', evaluationStatus: 'na', profileCompleted: false, consent: 'Granted',
    })));
  }
  const invalid = analyzed.filter((r) => !r.valid).length;
  const duplicates = analyzed.filter((r) => r.valid && r.dupe).length;
  return { imported: toInsert.length, skipped: invalid + duplicates, skippedReasons: { duplicates, invalid } };
}
