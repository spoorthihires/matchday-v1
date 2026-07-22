// Shared, pure kanban stage constants + derivation (Slice 8). No model imports.
export const KANBAN_STAGES = [
  'Recommended', 'Shortlisted', 'Candidate Confirmed', 'Scheduled',
  'L1', 'L2', 'L3', 'HR', 'Offer Sent', 'Offer Accepted', 'Joined',
  'Rejected', 'Withdrawn',
] as const;
export type KanbanStage = (typeof KANBAN_STAGES)[number];

// The linear advance/back flow (terminal stages are off-flow).
export const KANBAN_ORDER: KanbanStage[] = [
  'Recommended', 'Shortlisted', 'Candidate Confirmed', 'Scheduled',
  'L1', 'L2', 'L3', 'HR', 'Offer Sent', 'Offer Accepted', 'Joined',
];
export const KANBAN_TERMINAL: KanbanStage[] = ['Rejected', 'Withdrawn'];

// Initial column when the employer hasn't pinned a stage. Seeded (one-way) from
// the 5a decision, 5b consent, whether a live interview exists (7), and the
// offer status (9, checked first — a Draft offer has no branch and falls through).
export function deriveStage(
  decision: string | null | undefined,
  consentStatus: string | null | undefined,
  hasInterview: boolean,
  offerStatus?: string | null | undefined,
): KanbanStage {
  if (offerStatus === 'Joined') return 'Joined';
  if (offerStatus === 'Accepted') return 'Offer Accepted';
  if (offerStatus === 'Sent') return 'Offer Sent';
  if (offerStatus === 'Declined') return 'Withdrawn';
  if (consentStatus === 'granted') return hasInterview ? 'Scheduled' : 'Candidate Confirmed';
  if (consentStatus === 'declined') return 'Withdrawn';
  if (decision === 'Shortlisted') return 'Shortlisted';
  if (decision === 'Rejected') return 'Rejected';
  return 'Recommended';
}
