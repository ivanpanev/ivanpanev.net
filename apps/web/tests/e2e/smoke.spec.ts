import { expect, test } from '@playwright/test';
import { CORE_PAGES, watchConsole } from './helpers';

for (const path of CORE_PAGES) {
  test(`renders ${path} without console errors or CSP violations`, async ({ page }) => {
    const c = watchConsole(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('main h1').first()).toBeVisible();
    // The head script must have run before first paint.
    await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
    await expect(page.locator('html')).toHaveAttribute('data-skin', /graphite|ember|tide/);
    // CSP meta present with hash-based script-src and no 'unsafe-inline' for scripts.
    const csp = await page.locator('meta[http-equiv="content-security-policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'self' 'wasm-unsafe-eval'( 'sha256-[A-Za-z0-9+/=]+')+/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    // Let islands hydrate, then check nothing blew up.
    await page.waitForLoadState('networkidle');
    c.assertClean();
  });
}

test('every URL in the sitemap responds 200', async ({ request }) => {
  const index = await request.get('/sitemap-index.xml');
  expect(index.status()).toBe(200);
  const sitemaps = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(sitemaps.length).toBeGreaterThan(0);
  const urls: string[] = [];
  for (const sm of sitemaps) {
    const r = await request.get(new URL(sm).pathname);
    expect(r.status()).toBe(200);
    urls.push(...[...(await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname));
  }
  expect(urls).toContain('/blog/hello-world');
  expect(urls.some((u) => u.startsWith('/raw/'))).toBe(false);
  for (const u of urls) {
    const r = await request.get(u);
    expect(r.status(), u).toBe(200);
  }
});

test('RSS feed is valid-looking and lists posts', async ({ request }) => {
  const r = await request.get('/rss.xml');
  expect(r.status()).toBe(200);
  const body = await r.text();
  expect(body).toContain('<rss');
  expect(body).toContain('<link>https://ivanpanev.net/blog/hello-world</link>');
  expect(body).not.toContain('/blog/hello-world/</link>');
});

test('OG images exist for pages that reference them', async ({ page, request }) => {
  await page.goto('/blog/hello-world');
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toBeTruthy();
  const r = await request.get(new URL(og!).pathname);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('image/png');
});
