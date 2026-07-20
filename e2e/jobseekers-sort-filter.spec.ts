import { test, expect } from '@playwright/test';
import { CREDENTIALS, loginAs } from './support/auth.js';
import {
  header, sortIcon, clickSort, enumSelect, selectEnumOption, clearEnumSelect,
  columnTexts, nameColumnTexts, isSortedAscending, isSortedDescending, gotoAndSettle,
} from './support/table.js';

test.describe('Jobseekers — sort + column filters', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, CREDENTIALS.admin);
    await gotoAndSettle(page, '/jobseekers');
    await expect(page.locator('table.dm')).toBeVisible();
  });

  test('Candidate column cycles neutral -> asc -> desc and reorders rows', async ({ page }) => {
    expect(await sortIcon(page, 'Candidate')).toBe('ti-arrows-sort');

    await clickSort(page, 'Candidate');
    expect(await sortIcon(page, 'Candidate')).toBe('ti-sort-ascending');
    const asc = await nameColumnTexts(page, 2);
    expect(isSortedAscending(asc)).toBe(true);

    await clickSort(page, 'Candidate');
    expect(await sortIcon(page, 'Candidate')).toBe('ti-sort-descending');
    const desc = await nameColumnTexts(page, 2);
    expect(isSortedDescending(desc)).toBe(true);
  });

  test('Match % column sorts numerically, not lexicographically', async ({ page }) => {
    await clickSort(page, 'Match');
    await clickSort(page, 'Match'); // second click -> desc, the more visually distinctive direction
    const values = await columnTexts(page, 6);
    const numeric = values.map((v) => (v === '—' ? -1 : Number(v.replace('%', ''))));
    expect(isSortedDescending(numeric.map(String), true)).toBe(true);
  });

  test('sorting a different column resets the previously active column to neutral', async ({ page }) => {
    await clickSort(page, 'Candidate');
    expect(await sortIcon(page, 'Candidate')).toBe('ti-sort-ascending');
    await clickSort(page, 'Institute');
    expect(await sortIcon(page, 'Candidate')).toBe('ti-arrows-sort');
    expect(await sortIcon(page, 'Institute')).toBe('ti-sort-ascending');
  });

  test('Evaluation column: the always-visible select narrows rows to the chosen value', async ({ page }) => {
    await selectEnumOption(page, 'Evaluation', 'Completed');
    const evalValues = await columnTexts(page, 5);
    expect(evalValues.length).toBeGreaterThan(0);
    for (const v of evalValues) expect(v).toContain('Completed');
  });

  test('choosing a different Evaluation option replaces the previous filter (single-select)', async ({ page }) => {
    await selectEnumOption(page, 'Evaluation', 'Completed');
    const completedOnly = await columnTexts(page, 5);
    for (const v of completedOnly) expect(v).toContain('Completed');

    await selectEnumOption(page, 'Evaluation', 'In progress');
    const inProgressOnly = await columnTexts(page, 5);
    for (const v of inProgressOnly) expect(v).toContain('In progress');
  });

  test('choosing the placeholder option clears the filter and restores the full row count', async ({ page }) => {
    const before = (await columnTexts(page, 2)).length;
    await selectEnumOption(page, 'Consent', 'Pending');
    const select = enumSelect(page, 'Consent');
    await expect(select).toHaveValue('Pending');

    await clearEnumSelect(page, 'Consent');
    await expect(select).toHaveValue('');
    const after = (await columnTexts(page, 2)).length;
    expect(after).toBe(before);
  });

  test('Dup. Risk single-select swaps High <-> Low rather than accumulating', async ({ page }) => {
    await selectEnumOption(page, 'Dup. Risk', 'High');
    let values = await columnTexts(page, 8);
    for (const v of values) expect(v).toContain('High');

    await selectEnumOption(page, 'Dup. Risk', 'Low');
    values = await columnTexts(page, 8);
    for (const v of values) expect(v).toContain('Low');
  });

  test('a column filter and a column sort compose: filtered rows stay correctly ordered', async ({ page }) => {
    await selectEnumOption(page, 'Consent', 'Granted');
    await clickSort(page, 'Candidate');
    const names = await nameColumnTexts(page, 2);
    expect(isSortedAscending(names)).toBe(true);
    const consentValues = await columnTexts(page, 9);
    for (const v of consentValues) expect(v).toContain('Granted');
  });

  test('the filter select does not also trigger a sort (independent controls)', async ({ page }) => {
    expect(await sortIcon(page, 'Institute')).toBe('ti-arrows-sort');
    await header(page, 'Institute').locator('select.col-select').click();
    await page.keyboard.press('Escape');
    expect(await sortIcon(page, 'Institute')).toBe('ti-arrows-sort');
  });
});
