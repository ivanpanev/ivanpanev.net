import { expect, test } from '@playwright/test';
import * as openpgp from 'openpgp';
import { watchConsole } from './helpers';

let pub: string;
let clear: string;
let detachedSig: string;
const message = 'The quick brown fox.\n';

test.beforeAll(async () => {
  const k = await openpgp.generateKey({ type: 'curve25519', userIDs: [{ name: 'E2E', email: 'e2e@example.org' }], format: 'object' });
  pub = k.publicKey.armor();
  clear = await openpgp.sign({ message: await openpgp.createCleartextMessage({ text: 'I wrote this.' }), signingKeys: k.privateKey });
  detachedSig = await openpgp.sign({ message: await openpgp.createMessage({ text: message }), signingKeys: k.privateKey, detached: true });
});

test('verifies a clear-signed message against a pasted key', async ({ page }) => {
  const c = watchConsole(page);
  await page.goto('/verify');
  await page.getByText('Also trust another public key').click();
  await page.getByLabel('Additional public key').fill(pub);
  await expect(page.getByText(/^Loaded [0-9A-F ]+$/)).toBeVisible();
  await page.getByRole('tab', { name: 'Clear-signed message' }).click();
  await page.getByLabel('Clear-signed message').fill(clear);
  await page.getByRole('button', { name: 'Verify' }).click();
  const result = page.getByRole('status');
  await expect(result).toContainText('Good signature');
  await expect(result).toHaveAttribute('data-verify-result', /ok|warn/);
  c.assertClean();
});

test('rejects a tampered detached signature', async ({ page }) => {
  await page.goto('/verify');
  await page.getByText('Also trust another public key').click();
  await page.getByLabel('Additional public key').fill(pub);
  await page.getByRole('tab', { name: 'Detached signature' }).click();
  await page.getByLabel('Signed content (paste text or choose a file)').fill(message + 'tampered');
  await page.getByLabel(/Detached signature \(/).fill(detachedSig);
  await page.getByRole('button', { name: 'Verify' }).click();
  const result = page.getByRole('status');
  await expect(result).toContainText('did not verify');
  await expect(result).toHaveAttribute('data-verify-result', 'danger');
});

test('refuses a pasted private key', async ({ page }) => {
  await page.goto('/verify');
  const k = await openpgp.generateKey({ type: 'curve25519', userIDs: [{ email: 'p@example.org' }] });
  await page.getByText('Also trust another public key').click();
  await page.getByLabel('Additional public key').fill(k.privateKey);
  await expect(page.getByRole('alert')).toContainText('private key');
});

test('?post= pre-selects the post mode and reports a missing signature honestly', async ({ page }) => {
  await page.goto('/verify?post=hello-world');
  await expect(page.getByRole('tab', { name: 'A post on this site' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Post id (the last part of the URL)')).toHaveValue('hello-world');
  await page.getByText('Also trust another public key').click();
  await page.getByLabel('Additional public key').fill(pub);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('status')).toContainText('may not be signed');
});
