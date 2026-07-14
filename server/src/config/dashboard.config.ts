export const dashboardConfig = {
  weights: { supply: 0.30, demand: 0.25, slots: 0.20, evaluations: 0.25 },
  supplyTarget: 580,   // target match-ready candidates for the cycle
  demandTarget: 57,    // target active employers for the cycle
};

export function verdictFor(score: number): { label: string; tone: 'ontrack' | 'at-risk' | 'off-track' } {
  if (score >= 80) return { label: 'On track', tone: 'ontrack' };
  if (score >= 60) return { label: 'Needs a push', tone: 'at-risk' };
  return { label: 'Off track', tone: 'off-track' };
}
