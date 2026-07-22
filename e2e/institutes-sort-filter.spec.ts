import { test, expect } from '@playwright/test';
import { CREDENTIALS, loginAs } from './support/auth.js';
import {
  header, sortIcon, clickSort, selectEnumOption, clearEnumSelect, openRangeFilter, clickApply, clickClear,
  columnTexts, nameColumnTexts, isSortedAscending, isSortedDescending, gotoAndSettle,
} from './support/table.js';

test.describe('Institutes — sort + column filters', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, CREDENTIALS.admin);
    await gotoAndSettle(page, '/institutes');
    await expect(page.locator('table.dm')).toBeVisible();
  });

  test('Institute name column sorts ascending and descending', async ({ page }) => {
    await clickSort(page, 'Institute');
    expect(await sortIcon(page, 'Institute')).toBe('ti-sort-ascending');
    expect(isSortedAscending(await nameColumnTexts(page, 2))).toBe(true);

    await clickSort(page, 'Institute');
    expect(await sortIcon(page, 'Institute')).toBe('ti-sort-descending');
    expect(isSortedDescending(await nameColumnTexts(page, 2))).toBe(true);
  });

  test('Type: the always-visible select narrows to the chosen institute type', async ({ page }) => {
    await selectEnumOption(page, 'Type', 'University');
    const values = await columnTexts(page, 3);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toBe('University');
  });

  test('Match-Ready %: range popover bounds a derived funnel column on Apply', async ({ page }) => {
    const panel = await openRangeFilter(page, 'Match-Ready');
    await panel.locator('input[placeholder="Min"]').fill('10');
    await clickApply(panel);
    const values = (await columnTexts(page, 7)).map((v) => Number(v.replace('%', '')));
    for (const v of values) expect(v).toBeGreaterThanOrEqual(10);
  });

  test('Match-Ready % sorts numerically (derived funnel column)', async ({ page }) => {
    await clickSort(page, 'Match-Ready');
    await clickSort(page, 'Match-Ready'); // desc
    const values = (await columnTexts(page, 7)).map((v) => Number(v.replace('%', '')));
    expect(isSortedDescending(values.map(String), true)).toBe(true);
  });

  test('Status filter (no sort control) narrows rows and clearing it restores them', async ({ page }) => {
    await expect(header(page, 'Status').locator('button[title^="Sort by"]')).toHaveCount(0);
    const totalBefore = (await columnTexts(page, 2)).length;

    await selectEnumOption(page, 'Status', 'Pending');
    const pendingRows = await columnTexts(page, 11);
    for (const v of pendingRows) expect(v).toContain('Pending');

    await clearEnumSelect(page, 'Status');
    const totalAfter = (await columnTexts(page, 2)).length;
    expect(totalAfter).toBe(totalBefore);
  });

  test('a range filter and the name-column sort compose correctly', async ({ page }) => {
    const panel = await openRangeFilter(page, 'Uploaded');
    await panel.locator('input[placeholder="Min"]').fill('0');
    await clickApply(panel);
    await clickSort(page, 'Institute');
    const names = await nameColumnTexts(page, 2);
    expect(isSortedAscending(names)).toBe(true);
  });

  test('Clear on a range popover resets the trigger back to its placeholder', async ({ page }) => {
    const panel = await openRangeFilter(page, 'Shortlist');
    await panel.locator('input[placeholder="Min"]').fill('5');
    await clickApply(panel);
    await expect(header(page, 'Shortlist').locator('button.col-range-trigger')).toHaveClass(/active/);

    const panel2 = await openRangeFilter(page, 'Shortlist');
    await clickClear(panel2);
    await expect(header(page, 'Shortlist').locator('button.col-range-trigger')).not.toHaveClass(/active/);
    await expect(header(page, 'Shortlist').locator('.crt-text')).toHaveText('Select range');
  });
});
