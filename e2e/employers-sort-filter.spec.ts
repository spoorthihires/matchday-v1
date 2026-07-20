import { test, expect } from '@playwright/test';
import { CREDENTIALS, loginAs } from './support/auth.js';
import {
  header, sortIcon, clickSort, selectEnumOption, clearEnumSelect, openRangeFilter, clickApply,
  columnTexts, nameColumnTexts, isSortedAscending, isSortedDescending, gotoAndSettle,
} from './support/table.js';

test.describe('Employers — sort + column filters', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, CREDENTIALS.admin);
    await gotoAndSettle(page, '/employers');
    await expect(page.locator('table.dm')).toBeVisible();
  });

  test('Employer name column sorts ascending and descending', async ({ page }) => {
    await clickSort(page, 'Employer');
    expect(await sortIcon(page, 'Employer')).toBe('ti-sort-ascending');
    expect(isSortedAscending(await nameColumnTexts(page, 2))).toBe(true);

    await clickSort(page, 'Employer');
    expect(await sortIcon(page, 'Employer')).toBe('ti-sort-descending');
    expect(isSortedDescending(await nameColumnTexts(page, 2))).toBe(true);
  });

  test('Industry: the always-visible select narrows to the chosen industry', async ({ page }) => {
    await selectEnumOption(page, 'Industry', 'Fintech');
    const values = await columnTexts(page, 3);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toBe('Fintech');
  });

  test('Response Time: range popover bounds a formatted (h/d) stat column on Apply', async ({ page }) => {
    const panel = await openRangeFilter(page, 'Response Time');
    await panel.locator('input[placeholder="Max"]').fill('24');
    await clickApply(panel);
    const trigger = header(page, 'Response Time').locator('button.col-range-trigger');
    await expect(trigger).toHaveClass(/active/);
  });

  test('Shortlist Rate sorts numerically', async ({ page }) => {
    await clickSort(page, 'Shortlist Rate');
    await clickSort(page, 'Shortlist Rate'); // desc
    const values = (await columnTexts(page, 6)).map((v) => Number(v.replace('%', '')));
    expect(isSortedDescending(values.map(String), true)).toBe(true);
  });

  test('Status filter (no sort control) narrows rows and choosing the placeholder restores them', async ({ page }) => {
    await expect(header(page, 'Status').locator('button[title^="Sort by"]')).toHaveCount(0);
    const totalBefore = (await columnTexts(page, 2)).length;

    await selectEnumOption(page, 'Status', 'Active');
    const activeRows = await columnTexts(page, 9);
    for (const v of activeRows) expect(v).toContain('Active');

    await clearEnumSelect(page, 'Status');
    const totalAfter = (await columnTexts(page, 2)).length;
    expect(totalAfter).toBe(totalBefore);
  });

  test('opening the Industry select does not also trigger a sort (independent controls)', async ({ page }) => {
    expect(await sortIcon(page, 'Industry')).toBe('ti-arrows-sort');
    await header(page, 'Industry').locator('select.col-select').click();
    await page.keyboard.press('Escape');
    expect(await sortIcon(page, 'Industry')).toBe('ti-arrows-sort');
  });
});
