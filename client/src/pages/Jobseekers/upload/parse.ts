// Verbatim from .superpowers/sdd/task-7-brief.md (Task 7, Step 2).
import * as XLSX from 'xlsx';
import type { RawRow } from './template.js';

const FIELD_MAP: Record<string, keyof RawRow> = {
  name: 'name', 'full name': 'name', email: 'email', 'email address': 'email',
  institute: 'institute', college: 'institute', branch: 'branch', stream: 'branch',
  gradyear: 'gradYear', 'graduation year': 'gradYear', 'grad year': 'gradYear',
  cgpa: 'cgpa', gpa: 'cgpa', source: 'source',
};
function mapRow(obj: Record<string, unknown>): RawRow {
  const out: RawRow = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = FIELD_MAP[k.trim().toLowerCase()];
    if (key) out[key] = v == null ? '' : String(v).trim();
  }
  return out;
}
export async function parseFile(file: File): Promise<RawRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return json.map(mapRow);
}
export function parseCsvText(text: string): RawRow[] {
  const wb = XLSX.read(text, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }).map(mapRow);
}
