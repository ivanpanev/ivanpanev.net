# Evidence pack: Milestone 0 (scaffold and decisions)

Regenerated 2026-09-16 for critic round 3, from Git bash (UTF-8, LF). Every
file below was produced by the listed command run from the repository root;
ANSI colour codes were stripped with `sed`.

| File | Produced by | Command | Expected |
| --- | --- | --- | --- |
| `setup-windows-check.txt` | `scripts/setup-windows.ps1 -Check` | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1 -Check` | 15 winget IDs resolve; kubectl and talosctl pinned URLs HEAD ok and their checksum files carry the digest; exit 0 |
| `setup-wsl-check.txt` | `scripts/setup-wsl.sh --check` | `bash scripts/setup-wsl.sh --check` | every artefact URL HEADs ok with a non-HTML content type, every checksum file downloaded and contains a digest for its artefact, exit 0 |
| `setup-wsl-negative.txt` | temporary copies of the script with a bad checksum URL / a non-existent pin | `bash <copy> --check go`, `bash <copy> --check cluster` | both exit 1 with explicit FAIL lines (proves `--check` detects the round-2 F01 class of bug) |
| `setup-wsl-e2e.txt` | `scripts/setup-wsl.sh cluster` with `HOME` set to a temp dir, in Git for Windows bash | see file header | 7 Linux binaries downloaded, checksum-verified, installed (ELF magic shown); second run installs nothing; exit 0 both times. Binaries are Linux ELF so cannot be executed here; this proves the script's mechanics, not the Linux environment |
| `toolchain-check.txt` | `scripts/check-toolchain.ps1` | `powershell ... -File scripts/check-toolchain.ps1` | exit 1: most tools not yet installed; kubectl 1.32 flagged OUT OF RANGE against `KUBERNETES_VERSION=1.35` |
| `toolchain-check-sh.txt` | `scripts/check-toolchain.sh` | `bash scripts/check-toolchain.sh` | same result as the PowerShell variant |
| `bash-syntax.txt` | bash | `for f in scripts/*.sh; do bash -n "$f"; done` | all ok |
| `gitignore-check.txt` | git | `git check-ignore -v ...` on five tfvars paths | only `prod.tfvars` and `prod.tfvars.json` ignored; `.enc.` and `.example.` variants re-included |
| `adr-alternatives.txt` | grep | `grep -c "## Alternatives considered" docs/adr/00[0-9][0-9]-*.md` (command echoed as the first line) | every ADR except 0001 (a meta-ADR: process, no alternatives) has exactly 1 |
| `renovate-validate.txt` | renovate-config-validator | `npx --yes --package renovate@latest renovate-config-validator renovate.json` | "Config validated successfully" |
| `sops-files-test.txt` | temporary test script (not committed, round 2) | scratch clone with a stub `yq`; added eight fake tracked files; ran `scripts/sops-files.sh` | 5 expected matches, 3 expected non-matches. `sops-files.sh` and `.sops.yaml` rules unchanged since |
| `tree.txt` | git | `git ls-files` run after `tree.txt` itself was staged (generate, add, regenerate) | identical to `git ls-files`, including itself |

Removed in round 3: `verify-test.txt` (round-2 test of the old inline
`verify()`), superseded by `setup-wsl-negative.txt` and `setup-wsl-e2e.txt`
which exercise the current function against real artefacts.

## Not executable on this workstation

| Check | Why | Where it runs instead |
| --- | --- | --- |
| Real `sops filestatus` / revocation drill | sops and age not installed; installing them is the operator's first step in `docs/toolchain.md` | Operator, after `setup-windows.ps1 -Group secrets`; CI `hygiene.yml` job `sops-encrypted` |
| shellcheck | not installed | CI `hygiene.yml` job `shellcheck` |
| `hygiene.yml` end-to-end | no GitHub remote yet | First push |
| `setup-wsl.sh` full install on Linux (`web`, `go`, `infra`, `secrets` groups need sudo/apt) | WSL2 cannot start (virtualisation disabled) | Any Linux machine; `--check` and the sudo-free `cluster` group exercised here (`setup-wsl-e2e.txt`) |
| Real `yq` in `sops-files.sh` | not installed | CI (ubuntu runners ship mikefarah yq); logic tested with a stub |

## Repository facts

- Parent directory `C:\Users\doubl` is an empty git repo (BACKLOG M0-R1-F20).
- Reports: `docs/reviews/m0-r1.md`, `docs/reviews/m0-r2.md`. Remediation log: `docs/reviews/m0-remediation.md`.
