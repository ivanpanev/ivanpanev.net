# Milestone 0 remediation log

Changes made between critic rounds, by finding ID. Report: [m0-r1.md](m0-r1.md).

## Round 1 -> Round 2

| Finding | Severity | Change | Verification |
| --- | --- | --- | --- |
| M0-R1-F01 | High | `scripts/setup-windows.ps1`: all 17 winget IDs corrected/verified (`HetznerCloud.CLI`, `argoproj.argocd`, `Sigstore.Cosign`, `SecretsOPerationS.SOPS`, plus `pnpm.pnpm`); new `-Check` mode resolves every ID via `winget search --exact`. `scripts/setup-wsl.sh`: every download pinned to `PIN_*` in `scripts/versions.env` with version-embedded asset names; new `--check` mode HEAD-requests every URL. | `evidence/m0/setup-windows-check.txt` (17/17 ok), `evidence/m0/setup-wsl-check.txt` (all URLs resolve, exit 0) |
| M0-R1-F02 | High | `docs/runbooks/secrets.md` rewritten: explains data key vs recipient wrapping; recipient removal now mandates `sops rotate --in-place` before `updatekeys`; states that Git history stays readable to the old key and that underlying credentials must be regenerated after compromise; adds a scripted revocation drill. `.sops.yaml` header updated to match. | Doc review; drill is an operator step (needs sops/age installed) |
| M0-R1-F03 | Medium | `.gitignore`: ignore `**/*.tfvars` and `**/*.tfvars.json`, re-include `*.example.tfvars[.json]` and `*.enc.tfvars[.json]`. `infra/README.md` states the rule. | `git check-ignore -v` output in `evidence/m0/gitignore-check.txt` |
| M0-R1-F04 | Medium | New `scripts/sops-files.sh` derives the file list from `.sops.yaml` `path_regex` rules (yq). `hygiene.yml` installs pinned, checksum-verified sops and uses `sops filestatus` instead of a substring grep. Runbook uses the same script. | Matching logic tested against a scratch clone with positive and negative cases (`evidence/m0/sops-files-test.txt`) |
| M0-R1-F05 | Medium | `.gitleaks.toml`: removed the `docs/reviews/evidence/` path allowlist. | File diff |
| M0-R1-F06 | Medium | ADR-0009 revised: server stores `SHA-256(authProof)`, constant-time compare; added in-transit vs at-rest compromise analysis. | Doc review |
| M0-R1-F07 | Medium | ADR-0004 and `docs/architecture.md` rewritten to describe etcd single copy, the two failure modes, daily `talosctl etcd snapshot` to object storage (M3), `etcd-restore.md` runbook added to the index, RTO 4 h stated. | Doc review |
| M0-R1-F08 | Medium | Alternatives sections added to ADR-0010, 0013, 0014, 0015; ADR-0014 gained a per-application table for how Grafana, Argo CD and Hubble consume the Access identity. | `grep -c "Alternatives considered" docs/adr/00*.md` all >= 1 |
| M0-R1-F09 | Medium | `setup-wsl.sh`: no `curl \| sh`; every artifact from a versioned release URL and verified against the project's published SHA-256 file (`verify()` handles `sha  name`, `sha *name`, and bare-hash formats); age from distro package because upstream ships no checksum file. | `verify()` exercised against real kubeconform/kubectl/talosctl artifacts and three negative cases (`evidence/m0/verify-test.txt`) |
| M0-R1-F10 | Medium | `scripts/versions.env` is the single source of truth; both check scripts read it; minimums raised to oldest supported (Go 1.26, Argo CD 3.0, cosign 3.0, SOPS 3.10, Helm 3.18...); kubectl checked for +/-1 minor skew against `KUBERNETES_VERSION`, talosctl for exact minor against `TALOS_VERSION`. `docs/toolchain.md` no longer repeats numbers. | `evidence/m0/toolchain-check.txt` shows kubectl 1.32 now OUT OF RANGE against 1.35 |
| M0-R1-F11 | Medium | Dependabot removed; `renovate.json` added (npm, gomod, dockerfile, github-actions with digest pinning, terraform, kustomize, helm-values, argocd, regex managers for `versions.env` pins). ADR-0012 records the decision and the Dependabot alternative. | `renovate-config-validator`: "Config validated successfully" (`evidence/m0/renovate-validate.txt`) |
| M0-R1-F12 | Medium | ADR-0005 revised: explicit per-hostname tunnel ingress with 404 catch-all, cloudflared origin-side Access JWT validation (`originRequest.access`), Terraform `hostnames` map invariant (Access policy or explicit `public = true`). ADR-0014 table updated accordingly. | Doc review |
| M0-R1-F13 | Low | `setup-windows.ps1` compares installed version to `MIN_*` and upgrades when below; pnpm installed via winget rather than corepack. | Script logic; `-Check` run |
| M0-R1-F14 | Low | Runbook snippet uses `scripts/sops-files.sh` + `sops filestatus`; milestone reference removed. | Doc review |
| M0-R1-F15 | Low | ADR-0012 now states the SHA-pinning rule and names `hygiene.yml`; README lists `hygiene.yml` and `renovate.json`. | Doc review |
| M0-R1-F16 | Low | Evidence regenerated from Git bash as UTF-8 LF; `tree.txt` produced after staging so it includes the evidence files. | `file`/`git ls-files --eol` on `evidence/m0/*` |
| M0-R1-F17 | Low | `.gitleaks.toml` uses `[[allowlists]]`. | File diff |
| M0-R1-F18 | Low | ADR-0006: `--enable-helm` added; exec-plugin trust boundary and mitigations recorded for the M5 threat model. | Doc review |
| M0-R1-F19 | Nit | `CRITIC.md`: instruction for unavailable tools; invocation passes `BACKLOG.md` and the remediation log. | Doc review |
| M0-R1-F20 | Nit | Not changed by the builder: `C:\Users\doubl\.git` is outside the repository and removing it is the operator's call. Recorded in `BACKLOG.md` as an operator action with the recommended command. | - |

Also fixed while testing (not a critic finding): in `setup-wsl.sh` `verify()`, a
non-matching `grep` inside a command substitution aborted the script silently
under `set -e`; now guarded with `|| true` and the bare-hash fallback made
explicit. Caught by the negative test cases.
