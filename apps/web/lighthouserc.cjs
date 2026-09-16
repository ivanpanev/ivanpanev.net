// Lighthouse CI: runs against the same workerd server as the e2e suite.
// Milestone 5 budgets are 100 in every category on the M1 sampled pages.
// /notes is excluded: hash-wasm Argon2id is an interactive island, not a content page.
const PORT = 8790;
const pages = ['/', '/blog/hello-world', '/projects/site-platform', '/tools/subnet', '/verify'];

module.exports = {
  ci: {
    collect: {
      startServerCommand: `pnpm exec wrangler dev --port ${PORT} --ip 127.0.0.1 --log-level log`,
      // wrangler prints "Ready on http://..." at log level. Match that so LHCI
      // does not time out on a hidden banner and then race the first collect.
      startServerReadyPattern: 'Ready on',
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
        'categories:performance': ['error', { minScore: 1 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
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
