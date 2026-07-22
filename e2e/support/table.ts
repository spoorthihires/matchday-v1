import type { Locator, Page } from '@playwright/test';

// Shared helpers for driving the always-visible inline column filter row + sort button
// (components/table/SortableHeader.tsx + components/table/filters/*) that every admin data table
// (Jobseekers/Drives/Institutes/Employers/Streams) now shares. Each header cell renders a
// `.col-label`, then a `.col-filter-row` containing the filter control (a `.col-select` dropdown,
// a `.col-range-trigger` box that opens a small `.col-filter-pop` popover, or nothing) plus a
// `.col-sort-btn` (title="Sort by {label}") when the column is sortable.

/** The <th> for a given column label, scoped to the first table.dm on the page. */
export function header(page: Page, label: string): Locator {
  return page.locator('table.dm thead th', { hasText: label }).first();
}

function sortBtn(page: Page, label: string): Locator {
  return page.getByTitle(`Sort by ${label}`, { exact: true });
}

/** Reads the sort-arrow icon's ti-* class (ti-arrows-sort | ti-sort-ascending | ti-sort-descending). */
export async function sortIcon(page: Page, label: string): Promise<string> {
  const icon = sortBtn(page, label).locator('i.sa');
  const cls = (await icon.getAttribute('class')) ?? '';
  const match = cls.match(/ti-(arrows-sort|sort-ascending|sort-descending)/);
  return match ? match[0] : '';
}

// Sort/filter changes trigger an async TanStack Query refetch. Neither `networkidle` nor "wait for
// the Loading placeholder to disappear" are airtight: both have a race window right at the start —
// if the check runs before React has even begun rendering the loading state, "no loading element
// found" is indistinguishable from "already loaded", and the read that follows can land on stale
// data. Arming a response listener for the specific list-API call *before* triggering the action
// (so the click and the wait can't race each other) and awaiting that exact response is the direct,
// non-racy signal that the new data has actually arrived; a short settle delay afterward gives
// React's resulting re-render a tick to commit before the caller reads the DOM.
const API_LIST_RE = /\/api\/(jobseekers|drives|institutes|employers)(\?|$)/;

async function withApiSettle(page: Page, action: () => Promise<void>): Promise<void> {
  const response = page.waitForResponse((r) => API_LIST_RE.test(r.url()) && r.request().method() === 'GET', { timeout: 10000 });
  await action();
  await response;
  await page.waitForTimeout(100);
}

/** Navigates to a table page and waits for its initial list fetch to land (armed before the
 * navigation, so it can't race it) plus a short settle delay for React's render to commit. */
export async function gotoAndSettle(page: Page, path: string): Promise<void> {
  const response = page.waitForResponse((r) => API_LIST_RE.test(r.url()) && r.request().method() === 'GET', { timeout: 15000 });
  await page.goto(path);
  await response;
  await page.waitForTimeout(100);
}

export async function clickSort(page: Page, label: string): Promise<void> {
  await withApiSettle(page, () => sortBtn(page, label).click());
}

/** The always-visible <select> for an enum column filter. */
export function enumSelect(page: Page, label: string): Locator {
  return header(page, label).locator('select.col-select');
}

export async function selectEnumOption(page: Page, label: string, optionLabel: string): Promise<void> {
  await withApiSettle(page, () => enumSelect(page, label).selectOption({ label: optionLabel }).then(() => {}));
}

/** Resets an enum column filter back to its "Select…" placeholder option. */
export async function clearEnumSelect(page: Page, label: string): Promise<void> {
  await withApiSettle(page, () => enumSelect(page, label).selectOption({ label: 'Select…' }).then(() => {}));
}

/** Opens a number/date range column's popover (the one filter type still behind a trigger) and
 * returns its panel locator. */
export async function openRangeFilter(page: Page, label: string): Promise<Locator> {
  const trigger = header(page, label).locator('button.col-range-trigger');
  await trigger.waitFor({ state: 'visible' });
  await trigger.click();
  const panel = page.locator('.col-filter-pop');
  await panel.waitFor({ state: 'visible', timeout: 10000 });
  return panel;
}

export async function clickApply(panel: Locator): Promise<void> {
  const page = panel.page();
  await withApiSettle(page, () => panel.getByRole('button', { name: 'Apply' }).click());
}

export async function clickClear(panel: Locator): Promise<void> {
  const page = panel.page();
  await withApiSettle(page, () => panel.getByRole('button', { name: 'Clear' }).click());
}

/**
 * All values in a given column of the visible tbody rows, addressed by CSS :nth-child (1-based,
 * counting the leading checkbox <td> as column 1 — same numbering as the <thead> markup).
 */
export async function columnTexts(page: Page, nthChild: number): Promise<string[]> {
  const cells = page.locator(`table.dm tbody tr td:nth-child(${nthChild})`);
  return cells.allTextContents();
}

/** Same as columnTexts, but reads only the bold name/title text inside a name cell (drops the
 * secondary `<span>` subtext, e.g. institute code/city), for name/title columns. */
export async function nameColumnTexts(page: Page, nthChild: number): Promise<string[]> {
  const cells = page.locator(`table.dm tbody tr td:nth-child(${nthChild}) b`);
  return cells.allTextContents();
}

export function isSortedAscending(values: string[], numeric = false): boolean {
  for (let i = 1; i < values.length; i++) {
    const a = numeric ? Number(values[i - 1].replace(/[^0-9.\-]/g, '')) : values[i - 1];
    const b = numeric ? Number(values[i].replace(/[^0-9.\-]/g, '')) : values[i];
    if (a > b) return false;
  }
  return true;
}

export function isSortedDescending(values: string[], numeric = false): boolean {
  for (let i = 1; i < values.length; i++) {
    const a = numeric ? Number(values[i - 1].replace(/[^0-9.\-]/g, '')) : values[i - 1];
    const b = numeric ? Number(values[i].replace(/[^0-9.\-]/g, '')) : values[i];
    if (a < b) return false;
  }
  return true;
}
