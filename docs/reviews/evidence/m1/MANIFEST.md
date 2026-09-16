# Evidence pack: Milestone 1 (Astro site and Cloudflare deploy)

Generated 2026-09-16 on the Windows workstation from `apps/web`, Node
22.17, pnpm 12.4.2. Text files were captured by a small wrapper that echoes
the command as the first line, strips ANSI codes, and appends `exit=<code>`
as the last line (UTF-8, LF).

| File | Command | Expected |
| --- | --- | --- |
| `astro-check.txt` | `pnpm check` | `Result (66 files): 0 errors`, exit 0 |
| `unit-tests.txt` | `pnpm test -- --coverage` | 118 tests pass in 7 files; coverage above the `vitest.config.ts` thresholds (all-files line 95.5%, branches 86.6%) |
| `build.txt` | `pnpm build` | 21 pages, OG images, Pagefind index, `signed-posts` and `wkd` integrations run; the wkd integration warns that no public key is present yet (expected until the key ceremony) |
| `check-dist.txt` | `pnpm lint:html` | `check-dist: 21 pages OK, 92 files` |
| `wrangler-dry-run.txt` | `pnpm exec wrangler deploy --dry-run` | config parses, 109 assets, no bindings |
| `e2e.txt` | `pnpm exec playwright test --reporter=list` | 115 passed (57 specs x desktop chromium + mobile; a few desktop-only) against a fresh `wrangler dev`; includes axe WCAG 2.x A/AA scans of every core page in light and dark, CSP console-error assertions, security headers, `/raw` + `/signatures` content types, 404 status, `www` redirect, theme persistence, all three tools, clear-signed and detached verification incl. a tampered message and a private-key paste refusal, Pagefind search under CSP |
| `lighthouse.txt` | `pnpm lhci` (Lighthouse CI 0.15, desktop preset, 3 runs x 5 URLs, Playwright's Chromium via `CHROME_PATH`) | all `categories:*` assertions >= 0.95 pass; only `warn`-level `unused-javascript` (React runtime, OpenPGP.js on `/verify`) and one `render-blocking-resources` (the page's own CSS) remain |
| `lighthouse-summary.txt` | `node scripts/lhci-summary.mjs` | 100/100/100/100 on `/`, `/blog/hello-world`, `/projects/site-platform`, `/tools/subnet`, `/verify` in every run; LCP 610-780 ms, CLS <= 0.001, TBT <= 20 ms |
| `lighthouse/home.json`, `lighthouse/verify.json` | one full Lighthouse report each (first run) | raw reports for the lightest and heaviest sampled page; the other three are reproducible with `pnpm lhci` and were omitted for repository size |
| `csp.txt` | `dist/index.html` meta + `dist/_headers` | `default-src 'none'`; `script-src`/`style-src-elem` hash-only (14 hashes per page); `style-src-attr 'unsafe-inline'` (Shiki); `'wasm-unsafe-eval'` (Pagefind); no third-party origin anywhere; `_headers` adds `frame-ancestors`, HSTS, COOP/CORP, permissions policy, immutable caching for `/_astro/*`, CORS for WKD |
| `bundle-sizes.txt` | raw and gzip -9 sizes of every `dist/_astro/*` | React runtime 65.7 KB gz (shared by all islands); ThemeToggle 1.6 KB; SubnetCalculator 4.5 KB; TextCounter 2.0 KB; SecretGenerator 6.7 KB; Verifier 127 KB (OpenPGP.js, only on `/verify`); Pagefind UI 38.9 KB (only on project pages); site CSS 6.8 KB. Whole `dist/` 3.9 MB incl. 21 OG PNGs and Pagefind index |
| `skins/*.png` | Playwright screenshots at 1280x800 with `localStorage` preset | `/`, `/blog/hello-world`, `/projects/site-platform` in graphite, ember, tide x light, dark (18 images) plus `mobile-subnet.png` at 375 px; `html[data-theme][data-skin]` asserted before each shot |
| `tree.txt` | `git ls-files apps/web .github/workflows/web.yml docs/adr/0003-astro-react-islands.md docs/runbooks/pgp-key-ceremony.md` | every M1 file |

## Not executable on this workstation

| Check | Why | Where it runs instead |
| --- | --- | --- |
| `web.yml` end-to-end, preview upload, production deploy | no GitHub remote, no Cloudflare API token in this session | first push; the workflow was validated by parsing and mirrors the local sequence exactly |
| WKD/`/pgp`/`/verify` with a real key | key ceremony is an operator action (`docs/runbooks/pgp-key-ceremony.md`); no private key may exist on the build machine | operator; unit tests in `tests/unit/wkd.test.ts` and `pgp.test.ts` exercise both integrations with generated throwaway keys, and the e2e `verify.spec.ts` verifies against a pasted key |
| `sign-post.sh` | needs gpg and the signing subkey | operator after the ceremony; `signed-posts.test.ts` covers the build-side contract (digest mismatch fails the build, missing `.asc` for `signed: true` fails the build) |
| Custom-domain routing (`ivanpanev.net`, `www`) | first `wrangler deploy` attaches the domains | operator; `_redirects` for `www` -> apex is exercised by `headers.spec.ts` under workerd |

## Repository facts

- ADR-0003 revised (Astro 7, TypeScript 6 pin, native View Transitions, CSP shape).
- Operator actions and the TypeScript 7 pin are logged in `docs/reviews/BACKLOG.md`.
