import { test, expect } from '@playwright/test';
import { LEGACY_INDIGO_HEX, LEGACY_INDIGO_RGB } from './support/colors.js';

// Guards against the pre-rebrand brighter indigo (#2f4fe0 and its shades)
// silently creeping back in via a revert or a copy-pasted gradient stop.
test.describe('Design system — no legacy indigo literals ship', () => {
  for (const path of ['/src/styles/theme.css', '/src/styles/employer.css']) {
    test(`${path} contains no legacy indigo hex or rgb literals`, async ({ page }) => {
      const res = await page.request.get(path);
      expect(res.ok()).toBe(true);
      const css = await res.text();
      for (const hex of LEGACY_INDIGO_HEX) {
        expect(css.toLowerCase()).not.toContain(hex);
      }
      expect(css).not.toContain(LEGACY_INDIGO_RGB);
    });
  }
});
