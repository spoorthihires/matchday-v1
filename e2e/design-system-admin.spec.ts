import { test, expect } from '@playwright/test';
import { THEME } from './support/colors.js';
import { CREDENTIALS, loginAs } from './support/auth.js';

test.describe('Design system — Login screen (theme.css root tokens)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('hero panel gradient uses the navy palette', async ({ page }) => {
    const bg = await page.locator('#auth-screen .panel').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain(THEME.gradientLight);
    expect(bg).toContain(THEME.indigo600);
    expect(bg).toContain(THEME.gradientDark);
  });

  test('primary "Sign in" button is navy by default', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Sign in' });
    await expect(button).toHaveCSS('background-color', THEME.indigo);
  });

  test('primary "Sign in" button darkens to indigo-600 on hover', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Sign in' });
    await button.hover();
    await expect(button).toHaveCSS('background-color', THEME.indigo600);
  });

  test('focusing the email field rings navy', async ({ page }) => {
    const wrapper = page.locator('#auth-screen .inp').first();
    await page.getByLabel('Email').click();
    await expect(wrapper).toHaveCSS('border-color', THEME.indigo);
    const shadow = await wrapper.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('30, 58, 138');
  });
});

test.describe('Design system — Admin dashboard (theme.css root tokens)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, CREDENTIALS.admin);
    await page.goto('/');
    await expect(page.locator('.nav-item.active')).toBeVisible();
  });

  test('active sidebar nav item is navy', async ({ page }) => {
    const active = page.locator('.nav-item.active');
    await expect(active).toHaveText(/Command Center/);
    await expect(active).toHaveCSS('background-color', THEME.indigo);
  });

  test('"New Drive" primary button is navy', async ({ page }) => {
    const button = page.getByRole('button', { name: /New Drive/ });
    await expect(button).toHaveCSS('background-color', THEME.indigo);
  });

  test('readiness hero gradient uses the navy palette', async ({ page }) => {
    const bg = await page.locator('.hero-left').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain(THEME.gradientLight);
    expect(bg).toContain(THEME.indigo600);
    expect(bg).toContain(THEME.gradientDark);
  });

  test('indigo-toned KPI icon uses the navy wash', async ({ page }) => {
    const icon = page.locator('.ic.i-indigo').first();
    await expect(icon).toHaveCSS('background-color', THEME.indigo050);
    await expect(icon).toHaveCSS('color', THEME.indigo);
  });
});
