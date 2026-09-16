import { expect, test } from '@playwright/test';
import { waitForHydration, watchConsole } from './helpers';

test.describe('subnet calculator', () => {
  test('computes a prefix, updates the URL hash and restores from it', async ({ page }) => {
    const c = watchConsole(page);
    await page.goto('/tools/subnet');
    await waitForHydration(page);
    const input = page.getByLabel('Address with prefix length or netmask');
    await input.fill('192.168.10.130/26');
    const summary = page.getByRole('region', { name: 'Summary' });
    await expect(summary).toContainText('192.168.10.128/26');
    await expect(summary).toContainText('192.168.10.191');
    await expect(summary).toContainText('62');
    await expect(summary).toContainText('Private (RFC 1918)');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#192.168.10.130/26');

    await page.goto('/tools/subnet#2001:db8::1/48');
    await waitForHydration(page);
    await expect(page.getByRole('region', { name: 'Summary' })).toContainText('2001:db8::/48');
    await expect(page.getByRole('region', { name: 'Summary' })).toContainText('65,536');
    c.assertClean();
  });

  test('shows an error for invalid input and recovers', async ({ page }) => {
    await page.goto('/tools/subnet');
    await waitForHydration(page);
    const input = page.getByLabel('Address with prefix length or netmask');
    await input.fill('300.1.1.1/24');
    await expect(page.getByRole('alert')).toContainText('exceeds 255');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await input.fill('10.0.0.0/8');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('split and supernet helpers work', async ({ page }) => {
    await page.goto('/tools/subnet#10.0.0.0/24');
    await waitForHydration(page);
    await page.getByLabel('Split into /').fill('26');
    const region = page.getByRole('region', { name: 'Split and supernet' });
    await expect(region).toContainText('4 subnets');
    await expect(region).toContainText('10.0.0.192/26');
    await region.getByRole('button', { name: '10.0.0.0/23' }).click();
    await expect(page.getByLabel('Address with prefix length or netmask')).toHaveValue('10.0.0.0/23');
  });
});

test.describe('text counter', () => {
  test('counts as you type and keeps the draft in the tab', async ({ page }) => {
    const c = watchConsole(page);
    await page.goto('/tools/counter');
    await waitForHydration(page);
    await page.getByLabel('Text').fill('One two three. Four five!\n\nSix.');
    const stat = (name: string) => page.locator(`[data-stat="${name}"] dd`).first();
    await expect(stat('Words')).toHaveText('6');
    await expect(stat('Sentences')).toHaveText('3');
    await expect(stat('Paragraphs')).toHaveText('2');
    await page.reload();
    await expect(page.getByLabel('Text')).toHaveValue('One two three. Four five!\n\nSix.');
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByLabel('Text')).toHaveValue('');
    c.assertClean();
  });
});

test.describe('secret generator', () => {
  test('generates strings of the requested shape and reports entropy', async ({ page }) => {
    const c = watchConsole(page);
    await page.goto('/tools/secrets');
    await waitForHydration(page);
    const list = page.getByRole('list', { name: 'Generated secrets' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    const value = await list.locator('output').first().textContent();
    expect(value).toHaveLength(24);
    await expect(page.getByText(/bits ·/)).toBeVisible();

    await page.getByLabel('How many').fill('5');
    await expect(list.getByRole('listitem')).toHaveCount(5);
    const values = await list.locator('output').allTextContents();
    expect(new Set(values).size).toBe(5);
    c.assertClean();
  });

  test('passphrase mode uses dictionary words', async ({ page }) => {
    await page.goto('/tools/secrets');
    await waitForHydration(page);
    await page.getByRole('tab', { name: 'Passphrase' }).click();
    const value = await page.getByRole('list', { name: 'Generated secrets' }).locator('output').first().textContent();
    expect(value!.split('-')).toHaveLength(6);
    expect(value).toMatch(/^[a-z]+(-[a-z]+){5}$/);
  });

  test('copy button writes to the clipboard', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/tools/secrets');
    await waitForHydration(page);
    const value = await page.locator('output').first().textContent();
    await page.getByRole('button', { name: 'Copy' }).first().click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  });
});
