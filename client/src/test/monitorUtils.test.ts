import { describe, expect, it } from 'vitest';
import { STAGES, fmtMins, stageCounts, reachedCounts, monitorKpis } from '../pages/Evaluations/monitor/monitorUtils.js';
import type { MonitorCandidate } from '../types/evaluations.js';

const c = (stage: number, over: Partial<MonitorCandidate> = {}): MonitorCandidate => ({
  id: `x${stage}`, code: 'C-1', name: 'n', institute: 'i', contest: 'ct', employer: 'e',
  stage, score: 50, minsAgo: 10, ...over,
});

describe('monitorUtils', () => {
  it('STAGES has the 10 prototype stages ending in Match Ready', () => {
    expect(STAGES).toHaveLength(10);
    expect(STAGES[0].k).toBe('Invited');
    expect(STAGES[9].k).toBe('Match Ready');
    expect(STAGES[3].k).toBe('MCQ Pending');
  });
  it('stageCounts / reachedCounts', () => {
    const list = [c(0), c(2), c(2), c(9)];
    const counts = stageCounts(list);
    expect(counts[2]).toBe(2); expect(counts[9]).toBe(1); expect(counts[1]).toBe(0);
    const reached = reachedCounts(list);
    expect(reached[0]).toBe(4);   // all reached stage>=0
    expect(reached[2]).toBe(3);   // three at stage>=2
    expect(reached[9]).toBe(1);
  });
  it('monitorKpis: total, pending (3+5+7), ready (9), avg', () => {
    const list = [c(3), c(5), c(7), c(9), c(9)];
    const k = monitorKpis(list);
    expect(k.total).toBe(5);
    expect(k.pending).toBe(3);    // one each at 3,5,7
    expect(k.ready).toBe(2);      // two at 9
    expect(k.avg).toBe(Math.round((3 + 5 + 7 + 9 + 9) / 5 / 9 * 100));
  });
  it('fmtMins', () => {
    expect(fmtMins(0)).toBe('just now');
    expect(fmtMins(5)).toBe('5m ago');
    expect(fmtMins(90)).toBe('1h ago');
    expect(fmtMins(1500)).toBe('1d ago');
  });
});
