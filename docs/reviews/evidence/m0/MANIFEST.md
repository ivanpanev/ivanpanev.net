# Evidence pack: Milestone 0 (scaffold and decisions)

Regenerated 2026-09-16 for critic round 2, from Git bash (UTF-8, LF). Every
file below was produced by the listed command run from the repository root;
ANSI colour codes were stripped with `sed`.

| File | Produced by | Command | Expected |
| --- | --- | --- | --- |
| `setup-windows-check.txt` | `scripts/setup-windows.ps1 -Check` | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1 -Check` | 17 package IDs resolve, exit 0 |
| `setup-wsl-check.txt` | `scripts/setup-wsl.sh --check` | `bash scripts/setup-wsl.sh --check` | every pinned URL resolves (HTTP HEAD), exit 0 |
| `toolchain-check.txt` | `scripts/check-toolchain.ps1` | `powershell ... -File scripts/check-toolchain.ps1` | exit 1: most tools not yet installed; kubectl 1.32 flagged OUT OF RANGE against `KUBERNETES_VERSION=1.35` |
| `toolchain-check-sh.txt` | `scripts/check-toolchain.sh` | `bash scripts/check-toolchain.sh` | same result as the PowerShell variant |
| `bash-syntax.txt` | bash | `for f in scripts/*.sh; do bash -n "$f"; done` | all ok |
| `gitignore-check.txt` | git | `git check-ignore -v ...` on five tfvars paths | only `prod.tfvars` and `prod.tfvars.json` ignored; `.enc.` and `.example.` variants re-included |
| `adr-alternatives.txt` | grep | `grep -c "## Alternatives considered" docs/adr/00[0-9][0-9]-*.md` | every ADR except 0001 (a meta-ADR: process, no alternatives) has exactly 1 |
| `renovate-validate.txt` | renovate-config-validator | `npx --yes --package renovate@latest renovate-config-validator renovate.json` | "Config validated successfully" |
| `verify-test.txt` | temporary test script (not committed) | downloaded real kubeconform, kubectl and talosctl artifacts and their checksum files; ran the `verify()` function from `setup-wsl.sh` against them and against three deliberately wrong inputs | 3 verified, 3 mismatches/missing detected, `ALL_OK` |
| `sops-files-test.txt` | temporary test script (not committed) | scratch clone with a stub `yq`; added eight fake tracked files; ran `scripts/sops-files.sh` | 5 expected matches, 3 expected non-matches |
| `tree.txt` | git | `git ls-files` after `git add -A` (includes this pack) | |

## Not executable on this workstation

| Check | Why | Where it runs instead |
| --- | --- | --- |
| Real `sops filestatus` / revocation drill | sops and age not installed; installing them is the operator's first step in `docs/toolchain.md` | Operator, after `setup-windows.ps1 -Group secrets`; CI `hygiene.yml` job `sops-encrypted` |
| shellcheck | not installed | CI `hygiene.yml` job `shellcheck` |
| `hygiene.yml` end-to-end | no GitHub remote yet | First push |
| `setup-wsl.sh` full install | WSL2 cannot start (virtualisation disabled) | Any Linux machine; `--check` mode exercised here |
| Real `yq` in `sops-files.sh` | not installed | CI (ubuntu runners ship mikefarah yq); logic tested with a stub |

## Repository facts

- Parent directory `C:\Users\doubl` is an empty git repo (BACKLOG M0-R1-F20).
- Round 1 report: `docs/reviews/m0-r1.md`. Remediation log: `docs/reviews/m0-remediation.md`.
