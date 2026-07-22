import { test, expect, type Page } from '@playwright/test';
import { CREDENTIALS, loginAs } from './support/auth.js';

// Covers the Google-Calendar-style redesign of the Slot Calendar's Month view (MonthView.tsx +
// the `.cal-month`/`.cal-cell`/`.cal-chip` rules in theme.css): a standard 7-column/6-row grid
// with equal-height cells, top-left date numbers, dimmed out-of-month days, a highlighted today
// cell, stacked event chips with "+N more" overflow, and the click-throughs that empty cells /
// chips / overflow drive (Create Slot / Edit Slot / Day view).
//
// Seed data note (server/src/seed/seed.ts SLOT_DAYS): seeded sessions only exist on nine fixed
// July 2026 days (1, 4, 8, 11, 15, 18, 22, 25, 29), each with at most 3 sessions, regardless of
// the real wall-clock date the suite happens to run on. Tests that need seeded chips explicitly
// navigate to July 2026 (`gotoMonth`) rather than assuming the calendar opens there; tests that
// need a guaranteed-empty month navigate to December 2026 instead.

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

async function waitForSlotsFetch(page: Page, action: () => Promise<void>): Promise<void> {
  const response = page.waitForResponse((r) => /\/api\/slots(\?|$)/.test(r.url()) && r.request().method() === 'GET', { timeout: 15000 });
  await action();
  await response;
  await page.waitForTimeout(100);
}

async function gotoSlots(page: Page): Promise<void> {
  await waitForSlotsFetch(page, () => page.goto('/slots'));
}

/** Steps the Month view's prev/next controls until `.cal-title` reads "{Month} {year}". */
async function gotoMonth(page: Page, monthIdx: number, year: number): Promise<void> {
  const target = year * 12 + monthIdx;
  for (let guard = 0; guard < 240; guard++) {
    const title = (await page.locator('.cal-title').textContent())?.trim() ?? '';
    const [monthName, yearStr] = title.split(' ');
    const current = Number(yearStr) * 12 + MONTHS.indexOf(monthName);
    if (current === target) return;
    const label = current < target ? 'Next' : 'Previous';
    await waitForSlotsFetch(page, () => page.getByLabel(label).click());
  }
  throw new Error(`gotoMonth(${monthIdx}, ${year}) did not converge`);
}

// 'HH:MM' (24h) -> '<h>:MM AM|PM' (mirrors calendarUtils.ts's to12, duplicated here so the spec
// doesn't need a build-time import from client/ source).
function to12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

test.describe('Slot Calendar — Month view', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, CREDENTIALS.admin);
    await gotoSlots(page);
    await expect(page.locator('.cal-month')).toBeVisible();
  });

  test('renders a standard 7-column/6-row grid with day headers, equal-height cells, and a single highlighted today cell', async ({ page }) => {
    const headers = page.locator('.cal-dow > div');
    await expect(headers).toHaveText(DOW);

    const cells = page.locator('.cal-month .cal-cell');
    await expect(cells).toHaveCount(42);

    const heights = await cells.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    const [first, ...rest] = heights;
    for (const h of rest) expect(h).toBeCloseTo(first, 0);

    const today = page.locator('.cal-month .cal-cell.today');
    await expect(today).toHaveCount(1);
    await expect(today.locator('.dnum')).toHaveText(String(new Date().getDate()));
  });

  test('dims out-of-month days and does not open Create Slot when one is clicked', async ({ page }) => {
    const dimCells = page.locator('.cal-month .cal-cell.dim');
    expect(await dimCells.count()).toBeGreaterThan(0);

    await dimCells.first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('event chips render on seeded days; clicking one opens Edit Slot pre-filled with that slot', async ({ page }) => {
    await gotoMonth(page, 6, 2026); // July 2026 — has seeded sessions.

    const chip = page.locator('.cal-chip').first();
    await expect(chip).toBeVisible();
    const chipText = await chip.textContent();

    await chip.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Slot')).toBeVisible();
    // The chip's time (e.g. "10:00 AM") should match the Start field once converted back to 12h.
    const startValue = await dialog.locator('#slmStart').inputValue();
    expect(chipText).toContain(to12(startValue));
  });

  test('a day with more than 3 sessions collapses extras into "+N more", which opens Day view for that date', async ({ page }) => {
    await gotoMonth(page, 6, 2026); // July 2026 — July 15 already has exactly 3 seeded sessions.

    const cell15 = page.locator('.cal-month .cal-cell:not(.dim)', { has: page.locator('.dnum', { hasText: /^15$/ }) });
    await expect(cell15.locator('.cal-chip')).toHaveCount(3);
    await expect(cell15.locator('.cal-more')).toHaveCount(0);

    // Click the date number rather than the cell's bounding-box center: with 3 chips already
    // filling the cell, a center click would land on a chip and open Edit Slot instead (chips
    // stop propagation so the cell's own onClick never fires).
    await cell15.locator('.dnum').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Create Slot')).toBeVisible();
    await dialog.locator('#slmStart').fill('08:00');
    await dialog.locator('#slmEnd').fill('09:00');
    await dialog.getByRole('button', { name: /Save slot/i }).click();
    await expect(dialog).toHaveCount(0);

    await expect(cell15.locator('.cal-chip')).toHaveCount(3);
    const more = cell15.locator('.cal-more');
    await expect(more).toHaveText('+1 more');

    await more.click();
    await expect(page.locator('.calseg button.on')).toHaveText('Day');
    await expect(page.locator('.cal-dayv .dslot')).toHaveCount(4);

    // Clean up the session this test created so the suite is idempotent across re-runs (seed data
    // isn't reset between Playwright runs, and July 15 is shared with the "event chips" test above).
    page.once('dialog', (d) => d.accept());
    const created = page.locator('.cal-dayv .dslot', { hasText: '8:00 AM' });
    await created.getByRole('button', { name: /Edit/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Delete/i }).click();
    await expect(page.locator('.cal-dayv .dslot')).toHaveCount(3);
  });

  test('clicking an empty in-month cell opens Create Slot pre-filled with that date, and saving renders a new chip', async ({ page }) => {
    await gotoMonth(page, 11, 2026); // December 2026 — no seeded sessions in any month but July 2026.
    // Find a cell with no chips yet rather than assuming the whole month is untouched: seed data
    // is never reset between Playwright runs, so a prior run of this same test can leave one slot
    // behind in whichever cell it used. Pin the pick to its date number (rather than keeping the
    // dynamic "still empty" filter live) — once this test adds a chip to it, a locator that keeps
    // re-evaluating "empty cells" would silently resolve to a *different* cell afterward.
    const candidate = page.locator('.cal-month .cal-cell:not(.dim)').filter({ hasNot: page.locator('.cal-chip') }).first();
    const dayNum = (await candidate.locator('.dnum').textContent())?.trim();
    const emptyCell = page.locator('.cal-month .cal-cell:not(.dim)', { has: page.locator('.dnum', { hasText: new RegExp(`^${dayNum}$`) }) });
    await emptyCell.locator('.dnum').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Create Slot')).toBeVisible();
    await expect(dialog.locator('#slmDate')).not.toHaveValue('');
    await dialog.getByRole('button', { name: /Save slot/i }).click();
    await expect(dialog).toHaveCount(0);

    await expect(emptyCell.locator('.cal-chip')).toHaveCount(1);

    // Clean up so re-runs still find an empty cell to work with.
    page.once('dialog', (d) => d.accept());
    await emptyCell.locator('.cal-chip').click();
    await page.getByRole('dialog').getByRole('button', { name: /Delete/i }).click();
    await expect(emptyCell.locator('.cal-chip')).toHaveCount(0);
  });

  test('Month/Week/Day toggle and prev/next/Today navigation update the visible range', async ({ page }) => {
    await gotoMonth(page, 6, 2026);
    const title = page.locator('.cal-title');
    expect(await title.textContent()).toBe('July 2026');

    await waitForSlotsFetch(page, () => page.getByLabel('Next').click());
    await expect(title).toHaveText('August 2026');

    await waitForSlotsFetch(page, () => page.getByRole('button', { name: 'Today' }).click());
    await expect(title).not.toHaveText('August 2026');

    await page.locator('.calseg button', { hasText: 'Week' }).click();
    await expect(page.locator('.calseg button.on')).toHaveText('Week');
    await expect(page.locator('.cal-month')).toHaveCount(0);
  });
});
