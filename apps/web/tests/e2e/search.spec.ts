import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers';

test('projects sidebar search finds content via Pagefind (WASM under CSP)', async ({ page }) => {
  const c = watchConsole(page);
  await page.goto('/projects');
  const box = page.getByRole('combobox', { name: /search/i });
  await expect(box).toBeVisible();
  await box.fill('Argon2id');
  const results = page.getByRole('listbox', { name: 'Search results' });
  await expect(results.getByRole('option').first()).toBeVisible({ timeout: 15_000 });
  await expect(results).toContainText(/Encrypted quick notebook/);
  // Pagefind ran its WASM index under the page CSP without a violation.
  c.assertClean();
});

test('search reports no results honestly', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('combobox', { name: /search/i }).fill('zzqxjv-nothing-matches');
  await expect(page.locator('.pf-searchbox-status')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('listbox', { name: 'Search results' }).getByRole('option')).toHaveCount(0);
});
