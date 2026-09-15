# Evidence pack: Milestone 0 (scaffold and decisions)

Assembled 2026-09-16 by the builder for critic round 1.

| File | Produced by | Command |
| --- | --- | --- |
| `tree.txt` | git | `git ls-files` after staging the initial scaffold |
| `toolchain-check.txt` | `scripts/check-toolchain.ps1` | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-toolchain.ps1` (exit 1 expected: most tools are not yet installed on the workstation) |

## Commands run and results

| Command | Result |
| --- | --- |
| `git init -b main` in `c:\Users\doubl\Mysite` | ok; parent directory `C:\Users\doubl` is itself an empty git repo (no commits, no remote); nested repo is independent |
| `powershell -File scripts\check-toolchain.ps1` | runs, table rendered, exit 1 because tools are missing |
| `bash -n scripts/setup-wsl.sh`, `bash -n scripts/check-toolchain.sh`, `bash -n scripts/sops-init.sh` (Git for Windows bash) | syntax ok |
| `bash ./scripts/check-toolchain.sh` (Git bash) | runs, table rendered |
| `wsl -d FedoraLinux-42 -- ...` | WSL2 cannot start: virtualisation disabled in firmware; recorded in `docs/toolchain.md` |
| shellcheck | not available on this workstation; enforced by `.github/workflows/hygiene.yml` in CI |

## Changed paths

Everything in `tree.txt`; this is the initial commit.

## ADRs

0001 through 0015 accepted; open decisions register in 0001.

## Open verification items carried forward

- `.sops.yaml` contains a placeholder recipient until the operator runs
  `scripts/sops-init.*`; no encrypted file exists yet, so nothing depends on it.
- winget package identifiers in `scripts/setup-windows.ps1` were not executed
  on this machine (installation deferred to the milestones that need each
  tool); identifiers may need adjustment when first run.
- CI workflow `hygiene.yml` has not executed because the repository has no
  remote yet.
