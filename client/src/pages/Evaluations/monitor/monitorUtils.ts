import type { MonitorCandidate } from '../../../types/evaluations.js';

// Verbatim from matchday-admin-app_23.html STAGES (line 3288): label / short label / color.
export interface StageMeta { k: string; s: string; c: string }
export const STAGES: StageMeta[] = [
  { k: 'Invited', s: 'Invited', c: '#9aa0b6' },
  { k: 'Signed Up', s: 'Signed up', c: '#7c8aa5' },
  { k: 'Profile Complete', s: 'Profile', c: '#0aa3a3' },
  { k: 'MCQ Pending', s: 'MCQ pend.', c: '#f2a63b' },
  { k: 'MCQ Completed', s: 'MCQ done', c: '#e0930b' },
  { k: 'Coding Pending', s: 'Code pend.', c: '#6f8cff' },
  { k: 'Coding Completed', s: 'Code done', c: '#2f4fe0' },
  { k: 'TARA Pending', s: 'TARA pend.', c: '#a98bff' },
  { k: 'TARA Completed', s: 'TARA done', c: '#7c5cff' },
  { k: 'Match Ready', s: 'Match ready', c: '#0f9d58' },
];

export const fmtMins = (m: number): string =>
  m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;

export const stageCounts = (cands: MonitorCandidate[]): number[] =>
  STAGES.map((_, s) => cands.filter((c) => c.stage === s).length);

export const reachedCounts = (cands: MonitorCandidate[]): number[] =>
  STAGES.map((_, s) => cands.filter((c) => c.stage >= s).length);

export function monitorKpis(cands: MonitorCandidate[]) {
  const total = cands.length;
  const counts = stageCounts(cands);
  const pending = counts[3] + counts[5] + counts[7];
  const ready = counts[9];
  const avg = total ? Math.round(cands.reduce((a, c) => a + c.stage, 0) / total / 9 * 100) : 0;
  return { total, pending, ready, avg };
}
