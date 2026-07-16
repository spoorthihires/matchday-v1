import type { StreamRules } from '../../../types/streams.js';

export const SR_DEFAULTS: StreamRules = {
  numAllowed: '2', requirePrimary: true, defaultPrimary: 'First selected stream', allowSecondary: true,
  maxSecondary: 2, changePolicy: 'Before evaluation only', cooldown: 14, reuseEval: true,
  reuseScope: 'Same domain only', validityDays: 90, validityExpires: true, autoSuggest: true,
  suggestBasis: 'Skills + evaluations', confidence: 70,
};

// Ported from the prototype's srSummary (line 3169) as a plain sentence (the prototype bolds values
// via <span class="hl">; we render plain text — accepted minor fidelity trade for a pure/testable util).
export function streamRulesSummary(c: StreamRules): string {
  return (
    `Candidates may join up to ${c.numAllowed} stream(s)` +
    `${c.requirePrimary ? ', with a required primary stream' : ', with no required primary'}` +
    `${c.allowSecondary ? ` and up to ${c.maxSecondary} secondary` : ' and no secondary streams'}. ` +
    `Stream changes are allowed ${c.changePolicy.toLowerCase()} (cooldown ${c.cooldown} days). ` +
    `Evaluations ${c.reuseEval ? `are reusable · ${c.reuseScope.toLowerCase()}` : 'are not reusable'}` +
    `${c.validityExpires ? `, valid for ${c.validityDays} days` : ', with no expiry'}. ` +
    `Auto-suggestion is ${c.autoSuggest ? `on using ${c.suggestBasis.toLowerCase()} at ≥${c.confidence}%` : 'off'}.`
  );
}
