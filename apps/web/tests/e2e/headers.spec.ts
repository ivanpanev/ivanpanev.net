import { expect, test } from '@playwright/test';

test('security headers are applied to HTML', async ({ request }) => {
  const r = await request.get('/');
  const h = r.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['permissions-policy']).toContain('camera=()');
  expect(h['cross-origin-opener-policy']).toBe('same-origin');
  expect(h['strict-transport-security']).toContain('max-age=63072000');
});

test('hashed assets are immutable, HTML is not', async ({ page, request }) => {
  await page.goto('/');
  const src = await page.locator('link[rel="stylesheet"][href^="/_astro/"]').first().getAttribute('href');
  expect(src).toBeTruthy();
  const asset = await request.get(src!);
  expect(asset.headers()['cache-control']).toContain('immutable');
  const html = await request.get('/');
  expect(html.headers()['cache-control'] ?? '').not.toContain('immutable');
});

test('unknown paths return the 404 page with a 404 status', async ({ request }) => {
  const r = await request.get('/definitely-not-here');
  expect(r.status()).toBe(404);
  expect(await r.text()).toContain('There is nothing at this address');
});

test('trailing slashes redirect to the canonical URL', async ({ request }) => {
  const r = await request.get('/blog/hello-world/', { maxRedirects: 0 });
  expect([301, 307, 308]).toContain(r.status());
  expect(r.headers()['location']).toMatch(/\/blog\/hello-world$/);
});

test('raw posts and signatures are served with the right types and CORS', async ({ request }) => {
  const raw = await request.get('/raw/hello-world.md');
  expect(raw.status()).toBe(200);
  expect(raw.headers()['content-type']).toContain('text/markdown');
  expect(raw.headers()['access-control-allow-origin']).toBe('*');
  expect(raw.headers()['x-robots-tag']).toBe('noindex');
  expect(await raw.text()).toMatch(/^---\r?\ntitle:/);
});

test('robots.txt, security.txt and manifest exist', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap: https://ivanpanev.net/sitemap-index.xml');
  const sec = await request.get('/.well-known/security.txt');
  expect(sec.status()).toBe(200);
  const body = await sec.text();
  expect(body).toMatch(/^Contact: /m);
  const expires = body.match(/^Expires: (.+)$/m)?.[1];
  expect(expires && new Date(expires).getTime()).toBeGreaterThan(Date.now());
  const manifest = await request.get('/site.webmanifest');
  expect(manifest.status()).toBe(200);
});
