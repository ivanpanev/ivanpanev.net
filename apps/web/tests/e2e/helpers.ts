import { expect, type Page } from '@playwright/test';

/** Pages that must always exist; used by smoke, a11y and header tests. */
export const CORE_PAGES = [
  '/',
  '/blog',
  '/blog/hello-world',
  '/blog/tags/sre',
  '/projects',
  '/projects/site-platform',
  '/tools',
  '/tools/subnet',
  '/tools/counter',
  '/tools/secrets',
  '/notes',
  '/pgp',
  '/verify',
  '/about',
] as const;

/**
 * Collects console errors, uncaught exceptions and CSP violations for the
 * lifetime of the page. Call `assertClean()` at the end of a test.
 */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    // Aborted prefetches are fine; anything else is not.
    const err = r.failure()?.errorText ?? '';
    if (!/ERR_ABORTED/.test(err)) problems.push(`requestfailed: ${r.url()} ${err}`);
  });
  return {
    problems,
    assertClean() {
      expect(problems, problems.join('\n')).toEqual([]);
    },
  };
}

/**
 * Astro removes the `ssr` attribute from an <astro-island> once its component
 * has hydrated. Tests that interact with islands must wait for this instead of
 * racing the client:idle / client:load scheduler.
 */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
