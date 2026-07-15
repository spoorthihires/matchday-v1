// Verbatim from .superpowers/sdd/task-7-brief.md (Task 7, Step 3) — CSV_TEMPLATE and
// SAMPLE_ROWS already include gradYear+cgpa (required by server/src/modules/jobseekers/
// jobseekers.import.ts's analyze(): rows missing either are invalid), so no changes needed here.
export interface RawRow { name?: string; email?: string; institute?: string; branch?: string; gradYear?: string; cgpa?: string; source?: string; }
export const CSV_TEMPLATE = 'name,email,institute,branch,gradYear,cgpa,source\nAarav Sharma,aarav@cbit.edu,CBIT,CSE,2026,8.4,Campus\n';
export const SAMPLE_ROWS: RawRow[] = [
  { name: 'Aarav Sharma', email: 'aarav@cbit.edu', institute: 'CBIT', branch: 'CSE', gradYear: '2026', cgpa: '8.4', source: 'Campus' },
  { name: 'Diya Reddy', email: 'diya@cbit.edu', institute: 'CBIT', branch: 'IT', gradYear: '2026', cgpa: '9.1', source: 'Campus' },
  { name: 'Aarav Sharma', email: 'aarav@cbit.edu', institute: 'CBIT', branch: 'CSE', gradYear: '2026', cgpa: '8.4', source: 'Campus' }, // dup
];
