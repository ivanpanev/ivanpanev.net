import { expect, test } from '@playwright/test';
import { waitForHydration, watchConsole } from './helpers';

const API = 'https://notes-api.ivanpanev.net';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Auth',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
};

test.describe('notes', () => {
  test('rejects a short passcode without calling the API', async ({ page }) => {
    const c = watchConsole(page);
    let apiHits = 0;
    await page.route(`${API}/**`, (route) => {
      apiHits++;
      return route.abort();
    });
    await page.goto('/notes');
    await waitForHydration(page);
    await page.getByLabel('Passcode').fill('short');
    await page.getByRole('button', { name: 'Open notebook' }).click();
    await expect(page.getByRole('alert')).toContainText('12 characters');
    expect(apiHits).toBe(0);
    c.assertClean();
  });

  test('generated passphrase unlocks against a mocked API', async ({ page }) => {
    const c = watchConsole(page);
    const items: { id: string; kind: string; size: number; createdAt: string; expiresAt: string }[] = [];
    await page.route(`${API}/**`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: cors });
      }
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'PUT' && url.includes('/v1/notebooks/')) {
        expect(route.request().headers()['x-auth']).toBeTruthy();
        return route.fulfill({ json: { id: 'ok', expiresIn: 86400 }, headers: cors });
      }
      if (method === 'GET' && url.includes('/items')) {
        return route.fulfill({ json: { items }, headers: cors });
      }
      if (method === 'POST' && url.includes('/items')) {
        const id = '11111111-1111-1111-1111-111111111111';
        items.push({
          id,
          kind: 'text',
          size: 32,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        });
        return route.fulfill({ status: 201, json: { id, expiresAt: items[0]!.expiresAt }, headers: cors });
      }
      return route.fulfill({ status: 404, json: { error: 'not mocked' }, headers: cors });
    });

    await page.goto('/notes');
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Generate passphrase' }).click();
    await expect(page.getByLabel('Passcode')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Open notebook' }).click();
    await expect(page.getByRole('heading', { name: 'Add an item' })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Text').fill('hello from the island');
    await page.getByRole('button', { name: 'Encrypt and store' }).click();
    await expect(page.getByText('text ·')).toBeVisible();
    c.assertClean();
  });
});
