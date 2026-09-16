import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;
export const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * E2E runs against `wrangler dev` serving ./dist, i.e. the same Workers Static
 * Assets runtime (workerd) as production: _headers, _redirects, html_handling
 * and the 404 page all behave as they will live. `pnpm build` must run first
 * (CI does; locally `pnpm test:e2e` depends on an up-to-date dist).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm exec wrangler dev --port ${PORT} --ip 127.0.0.1 --log-level warn`,
    url: `${BASE_URL}/`,
    // Never reuse: a wrangler started against an older dist keeps serving that
    // asset manifest and produces confusing 404s. If the port is taken, fail
    // loudly instead.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /smoke|a11y|theme/ },
  ],
});
