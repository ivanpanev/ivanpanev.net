# ADR-0003: Astro 6 with React islands for the site; no SSR adapter

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

The site is content-heavy (blog, project articles) with pockets of rich
interactivity (tools, notebook UI, verify page, later an editor and a
collaborative canvas). It must score at the top of Lighthouse, support
multiple themes and skins, ship a Content Security Policy, and later host
elaborate page-transition animations. Future interactive components (tldraw,
Monaco) have React-first ecosystems.

Astro 6.0 (March 2026) runs the production runtime in dev, has first-class
Cloudflare support, a built-in CSP API and Fonts API, stable content
collections, and requires Node 22+.

## Decision

- `apps/web` is an Astro 6 project in TypeScript, output `static`, no adapter.
- Interactive components are React 19 islands with explicit `client:*`
  directives; the default for any component is zero client JavaScript.
- Exactly one client UI runtime (React). No Svelte/Vue/Solid islands.
- Styling: Tailwind v4 utilities on top of a CSS custom-property token layer
  that implements theme (light/dark) and skin switching.
- Content is Markdown/MDX in Git via content collections with Zod schemas.
  No CMS.
- Astro's `ClientRouter` (View Transitions) is enabled from the start so later
  transition effects have lifecycle hooks; all motion respects
  `prefers-reduced-motion`.

## Alternatives considered

- Next.js: SSR-centric, heavier client baseline, React-only anyway; static
  export loses several features.
- SvelteKit: excellent DX and animation ergonomics, but would force a second
  runtime when React-only libraries are embedded.
- Plain HTML + Eleventy: fine for the blog, weak for the islands.

## Consequences

- Build output is a directory of files, deployable anywhere (Workers Static
  Assets now, an nginx/Caddy container if ever needed).
- SSR features are unavailable; any per-request logic goes into an API on a
  subdomain.
- Revisit when a feature needs request-time rendering (unlikely for this
  site) or when Astro's Cloudflare adapter offers something static cannot.
