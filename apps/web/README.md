# apps/web — ivanpanev.net

Static site: Astro 7 + React islands + Tailwind v4, built to `dist/` and
served by Cloudflare Workers Static Assets. No server code, no adapter.

## Commands

| Command | What |
| --- | --- |
| `pnpm dev` | Astro dev server |
| `pnpm build` | Production build into `dist/` (also runs the `signed-posts`, `wkd` and Pagefind integrations) |
| `pnpm check` | `astro check`: types across `.astro` and `.ts` |
| `pnpm test` | Vitest unit tests (`tests/unit`), coverage thresholds in `vitest.config.ts` |
| `pnpm lint:html` | `scripts/check-dist.mjs`: static invariants over `dist/` (CSP meta present, no external resources, no inline handlers, no broken internal links, required files) |
| `pnpm test:e2e` | Playwright against `wrangler dev` (workerd): smoke, headers, theme, tools, verify, search, axe accessibility; desktop + mobile |
| `pnpm lhci` | Lighthouse CI against workerd, budgets in `lighthouserc.cjs`; `pnpm lhci:summary` prints a table |
| `pnpm exec wrangler deploy --dry-run` | Validate `wrangler.jsonc` without deploying |

`pnpm test:e2e` and `pnpm lhci` need a fresh `pnpm build` first; both start
their own server and refuse to reuse one already on the port (a stale
`wrangler dev` serves a stale asset manifest and produces misleading 404s).

## Layout

```
src/
  site.ts                 site constants, navigation, project sections
  content.config.ts       content collections (posts, projects) with Zod schemas
  content/                posts/*.md, projects/*.md, signatures/*.asc
  layouts/                BaseLayout, ProseLayout (blog), WikiLayout (projects), ToolLayout
  components/             Astro components; islands/ holds the React ones
  lib/                    pure TypeScript: subnet, secrets, text-count, pgp, urls, og, theme
  integrations/           Astro integrations: signed-posts (raw + .asc publishing), wkd
  styles/                 global.css (Tailwind, prose, view transitions), skins.css (tokens)
  pages/                  routes; og/[...slug].png.ts renders OG images at build time
  pgp/publickey.asc       site public key (not present until the key ceremony)
public/                   _headers, _redirects, robots.txt, .well-known/security.txt
scripts/                  check-dist.mjs, sign-post.sh, lhci-summary.mjs
tests/unit, tests/e2e
```

## Conventions

- Islands read browser state (`location`, storage, `matchMedia`) inside
  `useEffect`, never during render, so prerendered HTML matches hydration.
- Colours come only from the tokens in `styles/skins.css`; add a skin by
  adding a `[data-skin="x"]` block for both schemes and registering it in
  `lib/theme.ts`. The axe e2e run checks contrast in both schemes.
- Anything that produces inline `<script>` or `<style>` must go through
  Astro so the CSP hash is emitted; see ADR-0003.
- Internal URLs come from `lib/urls.ts` (`canonicalPath`), never from
  `Astro.url.pathname` directly, because `build.format: 'file'` puts `.html`
  in the build-time pathname.
- New tools: add the pure logic to `lib/`, unit-test it, register the page in
  `lib/tools.ts`, wrap the island in `ToolLayout`.

## Deploy

`.github/workflows/web.yml`: PRs build, verify and upload a preview version;
`main` deploys the exact `dist/` artefact that passed verification. Secrets
`CLOUDFLARE_API_TOKEN` (the deploy token in `docs/toolchain.md`, "Cloudflare
API tokens") and `CLOUDFLARE_ACCOUNT_ID` live in the `preview` and
`production` environments.
First deploy from a workstation: `pnpm exec wrangler login && pnpm deploy`.
