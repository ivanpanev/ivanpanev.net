#!/usr/bin/env node
/**
 * Static invariants over ./dist that a browser test cannot express as well:
 *  - every HTML page carries the CSP meta with hash-only script-src;
 *  - no external script/style/font/frame origins (the site is self-contained);
 *  - no inline event handlers or javascript: URLs;
 *  - every internal link/asset reference resolves to a file in dist;
 *  - required files exist (_headers, 404.html, sitemap, rss, robots, security.txt).
 * Exit code 1 on any violation. Run after `astro build`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const problems = [];
const warn = (f, msg) => problems.push(`${path.relative(dist, f)}: ${msg}`);

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const files = await walk(dist);
const fileSet = new Set(files.map((f) => '/' + path.relative(dist, f).split(path.sep).join('/')));
const html = files.filter((f) => f.endsWith('.html'));

for (const required of ['/_headers', '/_redirects', '/404.html', '/sitemap-index.xml', '/rss.xml', '/robots.txt', '/.well-known/security.txt', '/site.webmanifest', '/favicon.svg']) {
  if (!fileSet.has(required)) problems.push(`missing ${required}`);
}

const redirects = await fs.readFile(path.join(dist, '_redirects'), 'utf8');
if (/^\s*https?:\/\//m.test(redirects)) {
  problems.push('_redirects: Workers Static Assets reject absolute URLs (error 100324); www→apex is a zone Single Redirect');
}
if (!/www\.ivanpanev\.net/.test(redirects)) {
  problems.push('_redirects: must document the www.ivanpanev.net → apex Single Redirect');
}

const securityTxt = await fs.readFile(path.join(dist, '.well-known', 'security.txt'), 'utf8');
if (!/^Encryption: https:\/\/ivanpanev\.net\/pgp\/ivan\.asc\s*$/m.test(securityTxt)) {
  problems.push('security.txt: Encryption must point at the armoured key, not /pgp');
}
try {
  await fs.access(path.join(process.cwd(), 'src', 'pgp', 'publickey.asc'));
  if (!fileSet.has('/.well-known/security.txt.asc')) {
    problems.push('missing /.well-known/security.txt.asc (detached signature required after the key ceremony)');
  }
} catch {
  // Ceremony not done; unsigned security.txt is expected.
}

/** Resolve an internal href the way Workers Static Assets (drop-trailing-slash + .html) will. */
function resolves(href) {
  const p = href.split('#')[0].split('?')[0];
  if (!p || p === '/') return fileSet.has('/index.html');
  const clean = p.replace(/\/$/, '');
  return fileSet.has(clean) || fileSet.has(`${clean}.html`) || fileSet.has(`${clean}/index.html`);
}

// Outbound links the site is allowed to make. Anything else is a typo or a tracker until proven otherwise.
const EXTERNAL_OK = /^https?:\/\/(creativecommons\.org|github\.com|www\.eff\.org|openpgpjs\.org|astro\.build|developers\.cloudflare\.com|keyoxide\.org|dreal\.net)(\/|$)/;
// <link rel=...> values that fetch a resource (must be same-origin); canonical/alternate are just URLs.
const FETCHING_REL = /\b(stylesheet|preload|modulepreload|prefetch|icon|apple-touch-icon|manifest)\b/;

for (const f of html) {
  const src = await fs.readFile(f, 'utf8');

  const csp = src.match(/<meta http-equiv="content-security-policy" content="([^"]*)"/)?.[1];
  if (!csp) warn(f, 'missing CSP meta');
  else {
    if (!/script-src 'self' 'wasm-unsafe-eval'( 'sha256-[A-Za-z0-9+/=]+')+(;|$)/.test(csp)) warn(f, `script-src is not hash-only: ${csp.match(/script-src[^;]*/)?.[0]}`);
    if (!/default-src 'none'/.test(csp)) warn(f, "CSP lacks default-src 'none'");
    if (!/connect-src 'self' https:\/\/notes-api\.ivanpanev\.net/.test(csp)) warn(f, 'connect-src must allow notes-api');
  }

  for (const m of src.matchAll(/<(script|link|img|iframe|source|video|audio)\b([^>]*?)\s(?:src|href)="([^"]+)"/g)) {
    const [, tag, attrs, url] = m;
    if (tag === 'link') {
      const rel = attrs.match(/\srel="([^"]+)"/)?.[1] ?? '';
      if (!FETCHING_REL.test(rel)) {
        // canonical / alternate / sitemap / pgpkey: must be same-origin or site-absolute.
        if (/^https?:\/\//.test(url) && !url.startsWith('https://ivanpanev.net/')) warn(f, `foreign <link rel="${rel}">: ${url}`);
        if (/^https:\/\/ivanpanev\.net\/.*\.html$/.test(url)) warn(f, `<link rel="${rel}"> leaks .html: ${url}`);
        if (url.startsWith('/') && !url.endsWith('.xml') && !resolves(url)) warn(f, `broken <link rel="${rel}">: ${url}`);
        continue;
      }
    }
    if (/^https?:\/\//.test(url) || url.startsWith('//')) {
      warn(f, `external ${tag} resource: ${url}`);
    } else if (url.startsWith('/') && !resolves(url)) {
      warn(f, `broken ${tag} reference: ${url}`);
    }
  }

  // Social metadata must use canonical (extension-less) URLs.
  for (const m of src.matchAll(/<meta (?:property|name)="(og:url|og:image|twitter:image)" content="([^"]+)"/g)) {
    const [, prop, url] = m;
    if (/\.html(\.png)?$/.test(url)) warn(f, `${prop} leaks .html: ${url}`);
    if (prop !== 'og:url' && !resolves(new URL(url).pathname)) warn(f, `${prop} points at a missing file: ${url}`);
  }

  for (const m of src.matchAll(/<a\b[^>]*?\shref="([^"]+)"/g)) {
    const url = m[1];
    if (url.startsWith('mailto:') || url.startsWith('#')) continue;
    if (/^https?:\/\//.test(url)) {
      if (!EXTERNAL_OK.test(url) && !url.startsWith('https://ivanpanev.net/')) warn(f, `unexpected external link: ${url}`);
      continue;
    }
    if (url.startsWith('/') && !resolves(url) && !url.startsWith('/pgp/') && !url.startsWith('/signatures/')) warn(f, `broken link: ${url}`);
  }

  if (/\son[a-z]+="/i.test(src)) warn(f, 'inline event handler attribute');
  if (/href="javascript:/i.test(src)) warn(f, 'javascript: URL');
  if (!/<html lang="en">/.test(src)) warn(f, 'missing <html lang>');
  if ((src.match(/<h1[\s>]/g) ?? []).length !== 1) warn(f, 'page must have exactly one <h1>');
}

if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`check-dist: ${html.length} pages OK, ${files.length} files`);
