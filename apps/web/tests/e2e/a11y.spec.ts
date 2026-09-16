import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { CORE_PAGES } from './helpers';

for (const theme of ['light', 'dark'] as const) {
  for (const path of CORE_PAGES) {
    test(`${path} has no serious accessibility violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        serious,
        serious.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
      ).toEqual([]);
    });
  }
}

test('skip link moves focus to main content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('every page has exactly one h1 and a lang attribute', async ({ page }) => {
  for (const path of CORE_PAGES) {
    await page.goto(path);
    expect(await page.locator('h1').count(), path).toBe(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  }
});
