// Mirrors server/src/models/EvalConfig.ts and server/src/modules/evalConfigs/eval-configs.schemas.ts
// (EVAL_TYPES / RETAKES) plus server/src/modules/evalMonitor/eval-monitor.service.ts (MonitorCandidate).

export const EVAL_TYPES = ['MCQ', 'Coding', 'TARA', 'Assignments'] as const;
export type EvalType = (typeof EVAL_TYPES)[number];
export const RETAKE_OPTIONS = ['Not allowed', 'After cooldown', 'Unlimited', 'Admin approval'] as const;

export interface EvalConfigItem {
  id: string; code: string; name: string; type: string; enabled: boolean;
  passing: number; attempts: number; retake: string; cooldown: number; validity: number;
  autoQual: boolean; threshold: number; contests: number; createdAt: string; updatedAt: string;
}
export interface EvalConfigInput {
  name: string; type: string; enabled: boolean; passing: number; attempts: number;
  retake: string; cooldown: number; validity: number; autoQual: boolean; threshold: number;
}
export interface EvalConfigListResponse { items: EvalConfigItem[] }

export interface MonitorCandidate {
  id: string; code: string; name: string; institute: string;
  contest: string; employer: string; stage: number; score: number; minsAgo: number;
}
export interface MonitorResponse {
  candidates: MonitorCandidate[]; contests: string[]; employers: string[]; institutes: string[];
}
