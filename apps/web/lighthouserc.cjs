// Lighthouse CI: runs against the same workerd server as the e2e suite.
// Budgets are the M1 acceptance criteria (>= 95 in every category), plus a
// handful of hard invariants that must never regress regardless of score.
const PORT = 8790;
const pages = ['/', '/blog/hello-world', '/projects/site-platform', '/tools/subnet', '/verify'];

module.exports = {
  ci: {
    collect: {
      startServerCommand: `pnpm exec wrangler dev --port ${PORT} --ip 127.0.0.1 --log-level warn`,
      // No ready pattern: --log-level warn hides wrangler's banner, so LHCI polls the port instead.
      startServerReadyTimeout: 120000,
      url: pages.map((p) => `http://127.0.0.1:${PORT}${p}`),
      numberOfRuns: 3,
      settings: {
        // Desktop profile: the audience is engineers; mobile is covered by the axe/e2e run.
        preset: 'desktop',
        chromeFlags: '--no-sandbox --headless=new',
        skipAudits: ['uses-http2'], // local workerd is HTTP/1.1; Cloudflare serves h2/h3
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        // Hard invariants
        'is-on-https': 'off', // localhost
        'csp-xss': 'off', // audited by tests/e2e + check-dist; Lighthouse only sees the header, not the meta
        'errors-in-console': 'error',
        'third-party-summary': 'error',
        'total-byte-weight': ['error', { maxNumericValue: 600 * 1024 }],
        'unused-javascript': ['warn', { maxLength: 0 }],
        'render-blocking-resources': ['warn', { maxLength: 0 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.02 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2000 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './lhci-report', reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%.%%EXTENSION%%' },
  },
};
