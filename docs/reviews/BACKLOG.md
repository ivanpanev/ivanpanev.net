# Review backlog

Low and Nit findings from gauntlet reviews that were not fixed in their
milestone, plus operator actions the builder cannot perform. Each entry keeps
its original finding ID so it can be traced to the report that raised it.
Remove entries when fixed and reference the commit.

| Finding | Milestone | Severity | Summary | Status |
| --- | --- | --- | --- | --- |
| M0-R1-F20 | M0 | Nit | `C:\Users\doubl` (the operator's home directory) is an empty git repository; a `git add`/`commit` from the wrong directory would stage the home directory including `%APPDATA%\sops\age\keys.txt`. Operator action: `Remove-Item -Recurse -Force C:\Users\doubl\.git` if that repository is not intentional, or add `C:\Users\doubl\.gitignore` containing `*`. | Open (operator) |
| M0-R3-F04 | M0 | Nit | `setup-windows.ps1` robustness: `Get-ExpectedDigest` should accept an empty string (`[AllowEmptyString()]`) and use `[ \t]+` rather than `\s+`; set `$ProgressPreference='SilentlyContinue'` around `Invoke-WebRequest -OutFile`; user PATH rewrite as `REG_SZ` expands `%VAR%` entries; map common winget HRESULTs (`0x8A15002B` no applicable upgrade) to a one-line explanation. | Open |
| M1 TypeScript 7 | M1 | - | `typescript` pinned to `~6.0` because `@astrojs/check` rejects TS 7. Lift the pin when Renovate's TS 7 PR passes `pnpm check` (ADR-0003). | Open |
| M1 operator actions | M1 | - | Run `docs/runbooks/pgp-key-ceremony.md` and commit `apps/web/src/pgp/publickey.asc`; create Cloudflare API token + `CLOUDFLARE_ACCOUNT_ID` in GitHub environments `preview` and `production`; add custom domains via first `wrangler deploy`; confirm `/.well-known/openpgpkey/hu/<hash>` from production with `gpg --locate-keys`. | Open (operator) |
| M0 operator verification | M0 | - | From `m0-r3.md`: full `setup-wsl.sh` run on a Linux machine; `setup-windows.ps1` install run + `check-toolchain.ps1`; revocation drill executed once (attach output); first green `hygiene.yml` run URL; Renovate app installed. Attach transcripts to `docs/reviews/evidence/m0/`. | Open (operator) |

Fixed after the passing review (same day, not re-reviewed): M0-R3-F01
(scope-aware shadowing message, PATH untouched on failed install,
`check-toolchain.ps1` reports shadowed pinned binaries), M0-R3-F02
(`.sops.yaml` header uses `rotate --in-place --rm-age`), M0-R3-F03
(evidence files restored, MANIFEST corrected, `tree.txt` regenerated after
staging).
