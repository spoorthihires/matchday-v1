export const MATCH_READY_STAGES = ['MatchReady', 'Shortlisted', 'Offer', 'Joined'] as const;
export const MATCH_READY_STAGE_SET: ReadonlySet<string> = new Set(MATCH_READY_STAGES);
