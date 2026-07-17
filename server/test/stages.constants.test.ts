import { describe, expect, it } from 'vitest';
import { MATCH_READY_STAGES, MATCH_READY_STAGE_SET } from '../src/constants/stages.js';

describe('MATCH_READY_STAGES', () => {
  it('is exactly the four match-ready+ stages', () => {
    expect([...MATCH_READY_STAGES]).toEqual(['MatchReady', 'Shortlisted', 'Offer', 'Joined']);
    expect(MATCH_READY_STAGE_SET.has('Applied')).toBe(false);
    expect(MATCH_READY_STAGE_SET.has('MatchReady')).toBe(true);
  });
});
