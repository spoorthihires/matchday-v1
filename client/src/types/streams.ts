// Mirrors server/src/models/Stream.ts and server/src/models/StreamRules.ts.

export const PARENTS = ['Engineering', 'Data Science', 'Business', 'Design', 'Product'] as const;
export const ALL_FLOW = ['MCQ', 'Coding', 'TARA', 'Assignment'] as const;

export interface StreamVersion { v: string; date: string; by: string; note: string }
export interface StreamItem {
  id: string; code: string; name: string; parent: string; label: string;
  skills: string[]; good: string[]; flow: string[]; cutoff: number; cgpa: number; backlogs: number;
  grad: string[]; branches: string[]; sources: string[]; status: 'Active' | 'Disabled';
  version: string; versions: StreamVersion[]; drives: number; createdAt: string; updatedAt: string;
}
export interface StreamInput {
  name: string; parent: string; label: string; skills: string[]; good: string[]; flow: string[];
  cutoff: number; cgpa: number; backlogs: number; grad: string[]; branches: string[]; sources: string[]; status: string;
}
export interface StreamListResponse { items: StreamItem[] }

export interface StreamRules {
  numAllowed: string; requirePrimary: boolean; defaultPrimary: string; allowSecondary: boolean;
  maxSecondary: number; changePolicy: string; cooldown: number; reuseEval: boolean; reuseScope: string;
  validityDays: number; validityExpires: boolean; autoSuggest: boolean; suggestBasis: string; confidence: number;
}
