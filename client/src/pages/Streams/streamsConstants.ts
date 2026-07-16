import { ALL_FLOW } from '../../types/streams.js';

export const ALL_GRAD = ['2024', '2025', '2026', '2027'];
export const ALL_BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'MCA', 'MBA'];
export const ALL_SOURCES = ['Institutes', 'Resume Vault', 'Referrals', 'Direct Apply', 'Recruiter Uploads'];

// Canonical MCQ→Coding→TARA→Assignment order (mirrors the server's orderedFlow).
export function orderedFlow(flow: string[]): string[] { return ALL_FLOW.filter((f) => flow.includes(f)); }
