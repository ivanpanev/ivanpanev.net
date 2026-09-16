/**
 * With `build.format: 'file'` Astro renders /blog/post to dist/blog/post.html
 * and `Astro.url.pathname` is "/blog/post.html" at build time. Public URLs
 * never carry the extension (Workers Static Assets strips it), so anything
 * that emits a URL must go through here.
 */
export function canonicalPath(pathname: string): string {
  let p = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p === '' ? '/' : p;
}

/** /og/<path>.png for a canonical path; "/" maps to /og/index.png. */
export function ogImagePath(pathname: string): string {
  const p = canonicalPath(pathname);
  return `/og${p === '/' ? '/index' : p}.png`;
}
