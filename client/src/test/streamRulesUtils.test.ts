import { describe, expect, it } from 'vitest';
import { SR_DEFAULTS, streamRulesSummary } from '../pages/Streams/rules/streamRulesUtils.js';

describe('streamRulesUtils', () => {
  it('summary reflects the defaults (all features on)', () => {
    const s = streamRulesSummary(SR_DEFAULTS);
    expect(s).toContain('up to 2 stream');
    expect(s).toContain('required');
    expect(s).toContain('2 secondary');
    expect(s).toContain('before evaluation only');
    expect(s).toContain('cooldown 14 days');
    expect(s).toContain('reusable');
    expect(s).toContain('valid for 90 days');
    expect(s).toContain('at ≥70%');
  });
  it('summary reflects the off branches', () => {
    const s = streamRulesSummary({ ...SR_DEFAULTS, requirePrimary: false, allowSecondary: false, reuseEval: false, validityExpires: false, autoSuggest: false });
    expect(s).toContain('no required primary');
    expect(s).toContain('no secondary streams');
    expect(s).toContain('are not reusable');
    expect(s).toContain('no expiry');
    expect(s).toContain('Auto-suggestion is off');
  });
});
