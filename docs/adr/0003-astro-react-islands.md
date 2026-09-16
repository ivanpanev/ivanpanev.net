# ADR-0003: Astro with React islands for the site; no SSR adapter

- Status: Accepted (revised in M1, 2026-09-16: Astro 7, TypeScript 6 pin,
  native View Transitions instead of `ClientRouter`, CSP details)
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

The site is content-heavy (blog, project articles) with pockets of rich
interactivity (tools, notebook UI, verify page, later an editor and a
collaborative canvas). It must score at the top of Lighthouse, support
multiple themes and skins, ship a Content Security Policy, and later host
elaborate page-transition animations. Future interactive components (tldraw,
Monaco) have React-first ecosystems.

When the plan was written Astro 6 was current. By the time M1 started the
current release was Astro 7.3, and TypeScript 7 (the Go-based compiler) had
shipped. `@astrojs/check` (which drives `astro check`) does not yet accept
TypeScript 7, so the type-checker version is pinned independently of the
language features used.

## Decision

- `apps/web` is an Astro 7 project in TypeScript, output `static`, no
  adapter. `build.format: 'file'` plus Workers `html_handling:
  drop-trailing-slash` gives extension-less, slash-less URLs; `src/lib/urls.ts`
  is the single place that turns a build pathname into the canonical URL.
- TypeScript is pinned to `~6.0` until `@astrojs/check` supports 7.x
  (tracked in `docs/reviews/BACKLOG.md`). Renovate will propose the bump; it
  must not be merged before `pnpm check` passes with it.
- Interactive components are React 19 islands with explicit `client:*`
  directives; the default for any component is zero client JavaScript.
  Islands never touch `window`, `location` or storage during render; browser
  state is read in `useEffect` so the prerendered HTML and the first client
  render are identical.
- Exactly one client UI runtime (React). No Svelte/Vue/Solid islands.
- Styling: Tailwind v4 utilities on top of a CSS custom-property token layer
  (`src/styles/skins.css`) that implements theme (light/dark) and skin
  switching via `html[data-theme][data-skin]`. Every token pair is checked for
  WCAG AA contrast by the e2e axe run in both colour schemes.
- Content is Markdown/MDX in Git via content collections with Zod schemas.
  No CMS.
- Page transitions use the platform's cross-document View Transitions
  (`@view-transition { navigation: auto }` under
  `prefers-reduced-motion: no-preference`), not Astro's `ClientRouter`.
  Reason: `ClientRouter` swaps `<head>` client-side and re-executes inline
  scripts, which does not compose with a hash-based CSP; the native feature
  needs no JavaScript, works with a strict CSP, and already provides the
  `::view-transition-*` pseudo-elements Phase 3 animations will target. If a
  transition ever needs JS lifecycle hooks, `ClientRouter` can be reinstated
  behind the same CSS.
- Content Security Policy: Astro's `experimental.csp` emits a
  `<meta http-equiv>` with SHA-256 hashes for every inline script and style
  Astro generates, including the pre-paint theme script. Directives the meta
  form cannot carry (`frame-ancestors`, reporting) live in `public/_headers`.
  Shiki emits `style=""` attributes, so `style-src-attr 'unsafe-inline'` is
  allowed; `style-src-elem` stays hash-only. Pagefind needs
  `'wasm-unsafe-eval'`. No third-party origin appears in any directive; fonts
  are self-hosted through the Fonts API (`fontsource` provider).
- Search is Pagefind, indexed at build time over `[data-pagefind-body]`
  regions, loaded only on pages that render the sidebar.

## Alternatives considered

- Next.js: SSR-centric, heavier client baseline, React-only anyway; static
  export loses several features.
- SvelteKit: excellent DX and animation ergonomics, but would force a second
  runtime when React-only libraries are embedded.
- Plain HTML + Eleventy: fine for the blog, weak for the islands.
- Staying on Astro 6 for the build: would mean starting a fresh project on a
  release line that is no longer current, with an upgrade due immediately.
  Astro 7's changes are mechanical (Vite 8, Node 22.12 floor, Fonts API
  stable) and were absorbed during scaffolding.
- Adopting TypeScript 7 now: blocked by `@astrojs/check`; using it only for
  `tsc` while `astro check` uses 6.x would mean two compilers disagreeing.
- `ClientRouter` for transitions: rejected for M1 for the CSP reasons above.

## Consequences

- Build output is a directory of files, deployable anywhere (Workers Static
  Assets now, an nginx/Caddy container if ever needed).
- SSR features are unavailable; any per-request logic goes into an API on a
  subdomain.
- The CSP hash list changes on every build; there is no long-lived nonce or
  hash to leak. Anything that injects inline script or style at runtime
  (browser extensions excluded) will be blocked and show up in the e2e
  console assertions.
- Revisit when a feature needs request-time rendering (unlikely for this
  site), when `@astrojs/check` supports TypeScript 7, or when a transition
  effect needs JavaScript lifecycle hooks.
