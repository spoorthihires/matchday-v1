import { test, expect } from '@playwright/test';
import { CREDENTIALS, loginAs } from './support/auth.js';
import {
  header, sortIcon, clickSort, selectEnumOption, clearEnumSelect, openRangeFilter, clickApply, clickClear,
  columnTexts, nameColumnTexts, isSortedAscending, isSortedDescending, gotoAndSettle,
} from './support/table.js';

test.describe('Drives — sort + column filters', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, CREDENTIALS.admin);
    await gotoAndSettle(page, '/drives');
    await expect(page.locator('table.dm')).toBeVisible();
  });

  test('Drive Name sorts rows ascending and descending', async ({ page }) => {
    await clickSort(page, 'Drive Name');
    expect(await sortIcon(page, 'Drive Name')).toBe('ti-sort-ascending');
    expect(isSortedAscending(await nameColumnTexts(page, 2))).toBe(true);

    await clickSort(page, 'Drive Name');
    expect(await sortIcon(page, 'Drive Name')).toBe('ti-sort-descending');
    expect(isSortedDescending(await nameColumnTexts(page, 2))).toBe(true);
  });

  test('Domain: the always-visible select narrows to the chosen domain', async ({ page }) => {
    await selectEnumOption(page, 'Domain', 'Backend');
    const values = await columnTexts(page, 3);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toContain('Backend');
  });

  test('Cand. Cap: range popover bounds the visible rows on Apply', async ({ page }) => {
    // Derive the bound from real data rather than a hardcoded guess, so the assertion holds
    // regardless of what the seed happens to contain.
    const unfiltered = (await columnTexts(page, 7)).map((v) => Number(v.replace(/[^0-9]/g, '')));
    const maxCap = Math.max(...unfiltered);

    const panel = await openRangeFilter(page, 'Cand. Cap');
    await panel.locator('input[placeholder="Min"]').fill(String(maxCap));
    await clickApply(panel);
    const values = (await columnTexts(page, 7)).map((v) => Number(v.replace(/[^0-9]/g, '')));
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toBeGreaterThanOrEqual(maxCap);
    // trigger now shows a summary instead of the "Select range" placeholder
    await expect(header(page, 'Cand. Cap').locator('button.col-range-trigger')).toHaveClass(/active/);
  });

  test('Cand. Cap sorts numerically', async ({ page }) => {
    await clickSort(page, 'Cand. Cap');
    await clickSort(page, 'Cand. Cap'); // desc
    const values = (await columnTexts(page, 7)).map((v) => Number(v.replace(/[^0-9]/g, '')));
    expect(isSortedDescending(values.map(String), true)).toBe(true);
  });

  test('Month: date-range popover shows a two-input + calendar-grid picker and can be cleared', async ({ page }) => {
    const panel = await openRangeFilter(page, 'Month');
    await expect(panel.locator('input[type="date"]')).toHaveCount(2);
    await expect(panel.locator('.cal-grid')).toBeVisible();
    const [from, to] = await panel.locator('input[type="date"]').all();
    await from.fill('2026-01-01');
    await to.fill('2026-12-31');
    await clickApply(panel);
    await expect(header(page, 'Month').locator('button.col-range-trigger')).toHaveClass(/active/);

    const panel2 = await openRangeFilter(page, 'Month');
    await clickClear(panel2);
    await expect(header(page, 'Month').locator('button.col-range-trigger')).not.toHaveClass(/active/);
  });

  test('typing into a range input does not refetch until Apply is clicked (no partial-filter flicker)', async ({ page }) => {
    const before = (await columnTexts(page, 2)).length;
    const panel = await openRangeFilter(page, 'Slot Cap');
    await panel.locator('input[placeholder="Min"]').fill('999999'); // would exclude every row if committed live
    const during = (await columnTexts(page, 2)).length;
    expect(during).toBe(before); // still unfiltered — draft only, not yet applied
    await clickApply(panel);
    const after = (await columnTexts(page, 2)).length;
    expect(after).toBe(0); // now actually applied and (correctly) excludes everything
  });

  test('Status: filtering to Archived only shows archived rows, and choosing the placeholder restores the full set', async ({ page }) => {
    const totalBefore = (await columnTexts(page, 2)).length;
    await selectEnumOption(page, 'Status', 'Archived');
    const archivedRows = await columnTexts(page, 11);
    for (const v of archivedRows) expect(v).toContain('Archived');

    await clearEnumSelect(page, 'Status');
    const totalAfter = (await columnTexts(page, 2)).length;
    expect(totalAfter).toBe(totalBefore);
  });
});
