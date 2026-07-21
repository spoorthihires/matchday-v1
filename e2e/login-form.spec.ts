import { test, expect } from '@playwright/test';
import { CREDENTIALS } from './support/auth.js';

test.describe('Login form — input spacing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('email and password inputs share consistent left/right padding', async ({ page }) => {
    const email = page.getByLabel('Email');
    const password = page.getByRole('textbox', { name: 'Password' });

    const emailPadding = await email.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { left: cs.paddingLeft, right: cs.paddingRight, top: cs.paddingTop, bottom: cs.paddingBottom };
    });
    const passwordPadding = await password.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { left: cs.paddingLeft, right: cs.paddingRight, top: cs.paddingTop, bottom: cs.paddingBottom };
    });

    // Text must not touch the field border on either side.
    expect(parseFloat(emailPadding.left)).toBeGreaterThanOrEqual(10);
    expect(parseFloat(emailPadding.right)).toBeGreaterThanOrEqual(10);
    expect(parseFloat(passwordPadding.left)).toBeGreaterThanOrEqual(10);

    // Vertical padding is symmetric (top === bottom) on both fields.
    expect(emailPadding.top).toBe(emailPadding.bottom);
    expect(passwordPadding.top).toBe(passwordPadding.bottom);

    // The two fields use the same padding — no one-off spacing per field.
    expect(passwordPadding.left).toBe(emailPadding.left);
    expect(passwordPadding.top).toBe(emailPadding.top);
  });

  test('email and password fields render at the same height', async ({ page }) => {
    const emailBox = await page.locator('#auth-screen .inp').nth(0).boundingBox();
    const passwordBox = await page.locator('#auth-screen .inp').nth(1).boundingBox();
    expect(emailBox).not.toBeNull();
    expect(passwordBox).not.toBeNull();
    expect(Math.round(emailBox!.height)).toBe(Math.round(passwordBox!.height));
  });

  test('password visibility toggle is vertically centered and clear of the input text', async ({ page }) => {
    const wrapper = page.locator('#auth-screen .inp').nth(1);
    const input = page.getByRole('textbox', { name: 'Password' });
    const toggle = page.getByRole('button', { name: 'Show password' });
    // The button is a full-height tap target that spans to the field edge;
    // the icon glyph inside it carries the actual visual inset.
    const icon = toggle.locator('i');

    const wrapperBox = await wrapper.boundingBox();
    const inputBox = await input.boundingBox();
    const iconBox = await icon.boundingBox();
    expect(wrapperBox && inputBox && iconBox).toBeTruthy();

    // The icon glyph sits inset from the field's right edge, matching the input's padding.
    const rightGap = wrapperBox!.x + wrapperBox!.width - (iconBox!.x + iconBox!.width);
    expect(rightGap).toBeGreaterThanOrEqual(10);

    // Toggle icon and input text are vertically centered against each other.
    const inputCenter = inputBox!.y + inputBox!.height / 2;
    const iconCenter = iconBox!.y + iconBox!.height / 2;
    expect(Math.abs(inputCenter - iconCenter)).toBeLessThanOrEqual(2);
  });

  test('placeholder text is visible and inset from the field edges', async ({ page }) => {
    const email = page.getByLabel('Email');
    await expect(email).toHaveAttribute('placeholder', 'Email');
    const wrapperBox = await page.locator('#auth-screen .inp').nth(0).boundingBox();
    const inputBox = await email.boundingBox();
    expect(inputBox!.x).toBeGreaterThan(wrapperBox!.x);
    expect(inputBox!.x + inputBox!.width).toBeLessThan(wrapperBox!.x + wrapperBox!.width);
  });
});

test.describe('Login form — basic flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('signs in with valid admin credentials and lands on the dashboard', async ({ page }) => {
    await page.getByLabel('Email').fill(CREDENTIALS.admin.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(CREDENTIALS.admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.nav-item.active')).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('shows an error message for invalid credentials', async ({ page }) => {
    await page.getByLabel('Email').fill(CREDENTIALS.admin.email);
    await page.getByRole('textbox', { name: 'Password' }).fill('WrongPassword!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('password visibility toggle reveals and hides the password', async ({ page }) => {
    const password = page.getByRole('textbox', { name: 'Password' });
    await password.fill('Password123!');
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });
});
