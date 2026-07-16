import { describe, expect, it } from 'vitest';
import { baseSections, secCounts, domainIcon, relativeUpdated, fmtDate } from '../pages/Templates/templateUtils.js';

describe('templateUtils', () => {
  it('baseSections defaults and shallow-merges an override', () => {
    const s = baseSections();
    expect(s.weightage).toEqual({ MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 });
    expect(s.kanban).toHaveLength(9);
    const o = baseSections({ weightage: { MCQ: 30, Coding: 25, TARA: 30, Assignment: 15 } });
    expect(o.weightage.MCQ).toBe(30);
    expect(o.assessment.mcq).toBe(true);   // untouched
  });

  it('secCounts counts enabled assessment, kanban, notif, match (excl threshold), privacy', () => {
    const c = secCounts(baseSections());
    expect(c.assess).toBe(3);   // mcq, coding, tara true; assignments false
    expect(c.stages).toBe(9);
    expect(c.notif).toBe(4);
    expect(c.match).toBe(4);    // Skills, Experience, Domain fit, Location (threshold excluded)
    expect(c.priv).toBe(3);     // 3 of 4 true
  });

  it('domainIcon maps known domains and falls back', () => {
    expect(domainIcon('GenAI')[0]).toBe('ti-sparkles');
    expect(domainIcon('Unknown')).toEqual(['ti-template', 'i-indigo']);
  });

  it('relativeUpdated renders long-form relative strings', () => {
    const iso = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(relativeUpdated(iso(2 * 86400000))).toBe('2 days ago');
    expect(relativeUpdated(iso(1 * 86400000))).toBe('1 day ago');
    expect(relativeUpdated(iso(15 * 86400000))).toBe('2 weeks ago');
    expect(relativeUpdated(iso(0))).toBe('just now');
  });

  it('fmtDate renders "MMM D, YYYY" in UTC', () => {
    expect(fmtDate('2026-07-10T00:00:00.000Z')).toBe('Jul 10, 2026');
  });
});
