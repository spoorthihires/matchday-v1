import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression guard for the `.cal-grid` / `.cal-cell` naming collision in theme.css: the class
// names are shared by two different widgets — the dashboard mini-calendar (ScheduleSection,
// container `.cal`) and the Slots month view (MonthView, container `.cal-month`). When either
// widget's rules are written as BARE `.cal-grid{...}` / `.cal-cell{...}` selectors, the CSS
// cascade applies both rule sets simultaneously (their properties are mostly disjoint, so they
// merge rather than override — e.g. the dashboard's `display:flex; aspect-ratio:1/1` leaked into
// the Slots month cells, rendering chips inline in near-square cells). Every such rule must be
// scoped under its widget's container: `.cal .cal-grid` / `.cal-month .cal-cell` / etc.
//
// The check: strip comments, then flag any `.cal-grid` or `.cal-cell` occurrence that BEGINS a
// selector — i.e. appears at a line start or right after `}`, `{`, `;` or `,`. A properly scoped
// occurrence is always preceded by its container class and a space, so it never starts a selector.
// (`(?![\w-])` keeps hypothetical longer class names like `.cal-cellar` from matching.)
//
// (.tsx despite containing no JSX: vitest.config.ts's include is `src/**/*.test.tsx` only.)

// Resolved from cwd (vitest runs with the client workspace as cwd) rather than import.meta.url,
// which is a non-file URL under vitest's vite transform.
const cssPath = resolve(process.cwd(), 'src/styles/theme.css');

describe('theme.css calendar class scoping', () => {
  it('has no bare (unscoped) .cal-grid or .cal-cell selectors', () => {
    const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const bare = css.match(/(?:^|[}{;,])\s*\.cal-(?:grid|cell)(?![\w-])[^,{]*/gm) ?? [];
    expect(bare).toEqual([]);
  });
});
