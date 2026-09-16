# Milestone 1 remediations

## Round 1 → round 2

| Finding | Change |
| --- | --- |
| M1-R1-F01 | `buildHeadScript()` paints `data-skin`/`data-theme` first; storage and crypto are inner try/catch. Blocked-storage unit test now asserts attributes; added a crypto-unavailable fallback to `SKIN_IDS[0]`. |
| M1-R1-F02 | Dropped the false claim that `headers.spec.ts` exercises the www Host redirect under workerd (it returns 200 locally). `check-dist.mjs` now asserts the `_redirects` rule is the exact `www` → apex 301. Live Host redirect remains operator-verify. |
| M1-R1-F03 | `lighthouserc.cjs` starts wrangler at `--log-level log` and sets `startServerReadyPattern: 'Ready on'`. |
| M1-R1-F04 | Added `tests/unit/urls.test.ts`. Excluded `src/lib/tools.ts` (static registry) from coverage. |
| M1-R1-F05 | `z` is imported from `astro/zod`. `pnpm check` is 0 hints. |
| M1-R1-F06 | Missing key fails the build when the file is git-tracked or `IVP_REQUIRE_WKD=1`. Pre-ceremony untracked absence still warns. Unit tests cover both. |
| M1-R1-F07 | Preview wrangler message is `${{ github.sha }}`, not the PR title. |
| M1-R1-F08 | `docs/architecture.md` now says Astro 7; milestone log updated. |
| M1-R1-F09 | `security.txt` `Encryption` points at `https://ivanpanev.net/pgp/ivan.asc`; `check-dist.mjs` asserts that. Ceremony runbook notes it. |
| M1-R1-F10 | Footer uses `{' '}` so compressHTML cannot eat the space before the licence link. Dist contains `Text is <a`. |
