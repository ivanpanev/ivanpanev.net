// Live round-trip of the quick notebook against production.
import { createRequire } from 'node:module';
const require = createRequire('c:/Users/doubl/Mysite/apps/web/package.json');
const { chromium } = require('@playwright/test');

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const api = [];
page.on('response', (r) => { if (r.url().includes('notes-api.')) api.push(`${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`); });

await page.goto('https://ivanpanev.net/notes', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Generate passphrase' }).click();
const pass = await page.getByLabel('Passcode').inputValue();
await page.getByRole('button', { name: 'Open notebook' }).click();
await page.getByRole('heading', { name: 'Add an item' }).waitFor({ timeout: 60_000 });
const text = `round-trip ${new Date().toISOString()}`;
await page.getByLabel('Text').fill(text);
await page.getByRole('button', { name: 'Encrypt and store' }).click();
await page.getByText('text ·').first().waitFor({ timeout: 30_000 });
console.log('stored item; reopening from a fresh context');

const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
page2.on('response', (r) => { if (r.url().includes('notes-api.')) api.push(`[2] ${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`); });
await page2.goto('https://ivanpanev.net/notes', { waitUntil: 'networkidle' });
await page2.getByLabel('Passcode').fill(pass);
await page2.getByRole('button', { name: 'Open notebook' }).click();
await page2.getByRole('heading', { name: 'Add an item' }).waitFor({ timeout: 60_000 });
await page2.getByText('text ·').first().waitFor({ timeout: 30_000 });
const body = await page2.locator('main').innerText();
console.log('second context sees item:', body.includes(text) ? 'decrypted text visible' : (body.match(/text ·[^\n]*/) || ['item row present'])[0]);
console.log('api calls:\n  ' + api.join('\n  '));
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
