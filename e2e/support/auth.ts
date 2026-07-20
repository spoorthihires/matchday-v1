import type { Page } from '@playwright/test';

const STORAGE_KEY = 'matchday.auth';

export const CREDENTIALS = {
  admin: { email: 'admin@matchday.dev', password: 'Password123!' },
  employer: { email: 'employer.demo@acme.test', password: 'Employer123!' },
};

// Logs in via the API directly (bypassing the login form) and seeds the same
// localStorage entry AuthContext reads, so tests can jump straight to a
// gated page without re-driving the login UI each time.
export async function loginAs(page: Page, creds: { email: string; password: string }, landingPath = '/login') {
  const res = await page.request.post('http://localhost:4000/api/auth/login', { data: creds });
  if (!res.ok()) throw new Error(`login failed for ${creds.email}: ${res.status()} ${await res.text()}`);
  const auth = await res.json();
  await page.goto(landingPath);
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: auth },
  );
  return auth;
}
