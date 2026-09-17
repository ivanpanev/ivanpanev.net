import { expect, test } from '@playwright/test';
import { waitForHydration, watchConsole } from './helpers';

test('first visit picks a random skin and follows the system theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('data-theme-pref', 'system');
  const skin = await html.getAttribute('data-skin');
  expect(['koke', 'murasaki', 'kaki']).toContain(skin);
  const stored = await page.evaluate(() => localStorage.getItem('ivp.skin'));
  expect(stored).toBe(skin);
  // No theme flash: the attribute is set by the head script, so computed
  // background must already be the dark canvas at first paint.
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(bg).not.toBe('rgb(250, 250, 250)');
});

test('choosing a theme and skin persists across reloads and tabs', async ({ page, context }) => {
  const c = watchConsole(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await waitForHydration(page);
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.getByRole('menuitemradio', { name: 'dark' }).click();
  await page.getByRole('menuitemradio', { name: 'Murasaki' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'murasaki');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'murasaki');

  const other = await context.newPage();
  await other.goto('/about');
  await waitForHydration(other);
  await expect(other.locator('html')).toHaveAttribute('data-skin', 'murasaki');
  // Change in the second tab propagates to the first via the storage event.
  await other.getByRole('button', { name: /Appearance/ }).click();
  await other.getByRole('menuitemradio', { name: 'Kaki' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'kaki');
  c.assertClean();
});

test('"system" clears the stored preference and tracks the OS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await waitForHydration(page);
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.getByRole('menuitemradio', { name: 'dark' }).click();
  await page.getByRole('menuitemradio', { name: 'system' }).click();
  expect(await page.evaluate(() => localStorage.getItem('ivp.theme'))).toBeNull();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('menu closes on Escape and outside click, and is keyboard reachable', async ({ page }) => {
  await page.goto('/');
  await waitForHydration(page);
  const btn = page.getByRole('button', { name: /Appearance/ });
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Appearance' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Appearance' })).toHaveCount(0);
  await btn.click();
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole('menu', { name: 'Appearance' })).toHaveCount(0);
});
