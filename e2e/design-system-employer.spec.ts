import { test, expect } from '@playwright/test';
import { EMPLOYER_THEME } from './support/colors.js';
import { CREDENTIALS, loginAs } from './support/auth.js';

test.describe('Design system — Employer landing (employer.css scoped tokens)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/employer');
  });

  test('"Employer sign up" CTA is navy', async ({ page }) => {
    const cta = page.getByRole('button', { name: 'Employer sign up' }).first();
    await expect(cta).toHaveCSS('background-color', EMPLOYER_THEME.indigo);
  });

  test('hero headline accent is navy', async ({ page }) => {
    const accent = page.locator('.hero-title .accent');
    await expect(accent).toHaveCSS('color', EMPLOYER_THEME.indigo);
  });
});

test.describe('Design system — Employer login (employer.css scoped tokens)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/employer/login');
  });

  test('"Log in" button is navy', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Log in' });
    await expect(button).toHaveCSS('background-color', EMPLOYER_THEME.indigo);
  });

  test('focusing the email field rings navy', async ({ page }) => {
    const email = page.getByLabel('Email');
    await email.click();
    await expect(email).toHaveCSS('border-color', EMPLOYER_THEME.indigo);
    const shadow = await email.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('30, 58, 138');
  });
});

test.describe('Design system — Employer dashboard (employer.css scoped tokens)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, CREDENTIALS.employer, '/employer/login');
    await page.goto('/employer/dashboard');
    await expect(page.locator('.employer-app .nav-item.active')).toBeVisible();
  });

  test('active sidebar nav item is navy', async ({ page }) => {
    const active = page.locator('.employer-app .nav-item.active');
    await expect(active).toHaveCSS('background-color', EMPLOYER_THEME.indigo);
  });
});
