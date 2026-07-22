import { test, expect } from '@playwright/test';
import { CREDENTIALS, loginAs } from './support/auth.js';
import { gotoAndSettle } from './support/table.js';

// Covers the Drive Creation wizard's Evaluation step (StepEvaluation.tsx):
//  1. every assessment type's config dropdown has a real seeded default (not just "No configuration")
//  2. the inline "+ Add Configuration" button opens the shared Create Configuration modal with the
//     assessment type pre-selected
//  3. saving it creates a normal EvalConfig, auto-selects it on the stage that opened it, and closes
//     the modal — no page reload
//  4. the same config shows up as a card in Evaluation Management on the next client-side navigation
//     (React Query cache invalidation, not a manual refresh)

const CFG_LABELS = ['MCQ configuration', 'Coding configuration', 'TARA configuration', 'Assignments configuration'];

async function openWizardToEvaluationStep(page: import('@playwright/test').Page) {
  await gotoAndSettle(page, '/drives');
  await page.getByRole('button', { name: /Create Drive/i }).click();
  await expect(page.locator('#wizard')).toBeVisible();

  // Step 1 — Basic Info: only the name is required.
  await page.locator('#wName').fill(`E2E inline-config drive ${Date.now()}`);
  await page.getByRole('button', { name: /Continue/i }).click();

  // Step 2 — Schedule: pick any offered event date.
  await page.locator('.datechip').first().click();
  await page.getByRole('button', { name: /Continue/i }).click();

  // Step 3 — Eligibility: blankDriveModel() already seeds a valid source + branch, so Continue
  // advances straight through without any input.
  await page.getByRole('button', { name: /Continue/i }).click();

  // Step 4 — Evaluation.
  await expect(page.getByRole('heading', { name: 'Evaluation' })).toBeVisible();
}

test.describe('Drive wizard — Evaluation step configuration pickers', () => {
  test.beforeEach(async ({ page }) => {
    // The wizard's [X] close button asks for confirmation via window.confirm — auto-accept it.
    page.on('dialog', (dialog) => dialog.accept());
    await loginAs(page, CREDENTIALS.admin);
    await openWizardToEvaluationStep(page);
  });

  test('every assessment type offers at least one real seeded configuration', async ({ page }) => {
    for (const label of CFG_LABELS) {
      const select = page.getByLabel(label, { exact: true });
      // The options list loads async (React Query); poll rather than taking a single snapshot,
      // so this doesn't race the /eval-configs fetch and read the "No configuration"-only default.
      await expect(select.locator('option'), `"${label}" should offer more than just "No configuration"`)
        .not.toHaveCount(1);
    }
  });

  test('"+ Add Configuration" opens Create Configuration with the assessment type pre-selected', async ({ page }) => {
    // Assignments starts disabled in blankDriveModel(); its row (and the inline Add button) is
    // only visible once the stage is toggled on.
    await page.locator('.evrow[data-eval="assignments"] [data-switch]').click();
    await page.getByRole('button', { name: 'Add Assignments assessment configuration' }).click();
    const modal = page.getByRole('dialog', { name: /Create Configuration/i });
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Assessment type')).toHaveValue('Assignments');
    // Changing the type in the modal is still allowed (pre-selected, not locked).
    await modal.getByLabel('Assessment type').selectOption('Coding');
    await expect(modal.getByLabel('Assessment type')).toHaveValue('Coding');
  });

  test('creating a configuration inline auto-selects it on the matching stage, no reload', async ({ page }) => {
    const uniqueName = `E2E Coding config ${Date.now()}`;
    await page.getByRole('button', { name: 'Add Coding assessment configuration' }).click();
    const modal = page.getByRole('dialog', { name: /Create Configuration/i });
    await modal.getByLabel('Configuration name').fill(uniqueName);
    await modal.getByRole('button', { name: /Save configuration/i }).click();
    await expect(modal).not.toBeVisible();

    const codingSelect = page.getByLabel('Coding configuration', { exact: true });
    const newOption = codingSelect.locator('option', { hasText: uniqueName });
    await expect(newOption).toHaveCount(1);
    await expect(codingSelect).toHaveValue(await newOption.getAttribute('value') as string);

    // Other stages are untouched.
    const mcqSelect = page.getByLabel('MCQ configuration', { exact: true });
    await expect(mcqSelect.locator('option', { hasText: uniqueName })).toHaveCount(0);
  });

  test('the created configuration appears as a card in Evaluation Management with no manual refresh', async ({ page }) => {
    const uniqueName = `E2E TARA config ${Date.now()}`;
    await page.getByRole('button', { name: 'Add TARA assessment configuration' }).click();
    const modal = page.getByRole('dialog', { name: /Create Configuration/i });
    await modal.getByLabel('Configuration name').fill(uniqueName);
    await modal.getByRole('button', { name: /Save configuration/i }).click();
    await expect(modal).not.toBeVisible();

    // Discard the in-progress drive — this test only cares about the config, not the drive.
    await page.locator('#wizard button.x').click();
    await expect(page.locator('#wizard')).not.toBeVisible();

    // Client-side route change (sidebar link), not a full page reload.
    await page.getByRole('link', { name: 'Evaluations' }).click();
    await expect(page.locator('.tpl-card', { hasText: uniqueName })).toBeVisible();
    await expect(page.locator('.tpl-card', { hasText: uniqueName }).getByText('TARA', { exact: true })).toBeVisible();
  });
});
