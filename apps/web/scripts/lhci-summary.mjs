// Summarise Lighthouse CI JSON reports (lhci-report/*.json) into one table
// per URL: category scores, core metrics, and what the warnings point at.
// Usage: node scripts/lhci-summary.mjs [dir]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'lhci-report';
const rows = new Map();
const pct = (s) => (s == null ? '-' : Math.round(s * 100));
const kb = (n) => `${Math.round(n / 1024)}KB`;
const last = (u) => u.split('/').pop();

for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
  const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const url = r.finalDisplayedUrl ?? r.finalUrl ?? r.requestedUrl;
  const path = new URL(url).pathname;
  const c = r.categories;
  const a = r.audits;
  const unused = (a['unused-javascript'].details?.items ?? []).map((i) => `${last(i.url)} ${kb(i.wastedBytes)}/${kb(i.totalBytes)}`);
  const blocking = (a['render-blocking-resources'].details?.items ?? []).map((i) => last(i.url));
  if (!rows.has(path)) rows.set(path, []);
  rows.get(path).push({
    perf: pct(c.performance.score),
    a11y: pct(c.accessibility.score),
    bp: pct(c['best-practices'].score),
    seo: pct(c.seo.score),
    lcpMs: Math.round(a['largest-contentful-paint'].numericValue),
    cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(3)),
    tbtMs: Math.round(a['total-blocking-time'].numericValue),
    bytes: kb(a['total-byte-weight'].numericValue),
    unusedJs: unused.join(', ') || '-',
    renderBlocking: blocking.join(', ') || '-',
  });
}

for (const [path, runs] of [...rows.entries()].sort()) {
  console.log(path);
  for (const r of runs) console.log('  ', JSON.stringify(r));
}
