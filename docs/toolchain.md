# Toolchain

Versions live in one place: [`scripts/versions.env`](../scripts/versions.env).
It defines the minimum acceptable version of each tool (`MIN_*`, set to the
oldest upstream-supported release at the last review), the exact versions the
Linux installer downloads (`PIN_*`), and the cluster targets that
version-skew-bound tools are checked against (`KUBERNETES_VERSION`,
`TALOS_VERSION`). Renovate proposes updates to the pins; the cluster targets
change only during a cluster upgrade.

| Script | Purpose |
| --- | --- |
| `scripts/setup-windows.ps1 [-Group ...] [-Check]` | Install or upgrade with winget; kubectl and talosctl are instead downloaded as pinned, checksum-verified binaries into `%LOCALAPPDATA%\ivp\bin` (added to the user PATH) so they follow the cluster version rather than winget's latest. `-Check` resolves every package identifier, HEADs the pinned URLs and confirms each checksum file carries a digest, without installing. |
| `scripts/setup-wsl.sh [--check] [group ...]` | Install on Linux/WSL from pinned, checksum-verified release artifacts. No `curl \| sh`. `--check` HEADs every artefact URL (rejecting HTML), downloads every checksum file and confirms it carries a digest for the artefact. |
| `scripts/check-toolchain.ps1` / `.sh` | Report installed versions against `versions.env`; exit 1 if anything is missing or out of range. |
| `scripts/sops-init.ps1` / `.sh` | Generate the operator's age key and print the public key for `.sops.yaml`. |
| `scripts/sops-files.sh` | List tracked files that match a `.sops.yaml` rule (used by CI and the secrets runbook). |

Groups: `web` (Node, pnpm), `go`, `infra` (Terraform, Packer, hcloud),
`cluster` (kubectl, Helm, kustomize, talosctl, Argo CD CLI, kubeconform,
cosign), `secrets` (SOPS, age). Git and the GitHub CLI are always installed.

## Tools and why

| Tool | Used by | Notes |
| --- | --- | --- |
| Git | all | signed commits (`git config commit.gpgsign true`) |
| Node.js | `apps/web` | Astro 6 requires Node 22.12+; the LTS line installed is 24 |
| pnpm | `apps/web` | version also pinned in `apps/web/package.json` `packageManager` |
| Go | `apps/notebook-api` | toolchain pinned in `go.mod` |
| Docker | local image builds, integration tests | see the workstation constraint below |
| Terraform | `infra/terraform/*` | OpenTofu is compatible (OD-6) |
| Packer | `infra/terraform/hetzner` | the hcloud-k8s module uses it to build Talos images |
| hcloud CLI | inspecting Hetzner resources | optional |
| talosctl | cluster operations | minor version must equal the cluster's Talos minor; installed as a pinned binary on both OSes |
| kubectl | cluster operations | within one minor of the cluster's Kubernetes version; installed as a pinned binary on both OSes. Docker Desktop ships its own older kubectl earlier on the Windows PATH; the setup script warns when it shadows the pinned one |
| Helm | rendering charts locally, Argo CD bootstrap | Helm 4 is fine |
| kustomize | `k8s/` | standalone binary, tracks Argo CD's bundled version |
| kubeconform | `k8s/` validation | |
| Argo CD CLI | cluster operations | matches the installed Argo CD major |
| SOPS, age | secrets | age comes from winget/distro packages because upstream publishes no checksum files; Ubuntu 24.04 ships 1.1.x, hence `MIN_AGE=1.1` |
| GitHub CLI | repository automation | |
| Wrangler | `apps/web` deploy | dev dependency of `apps/web`; no global install |
| cosign | verifying signed images locally | CI signs; operators verify |

## Credentials the operator must create (never stored in this repository)

| Credential | Where used | Scope |
| --- | --- | --- |
| Hetzner Cloud API token | Terraform (hetzner root) | read/write on the project |
| Hetzner Object Storage S3 key pair | Terraform state backend, Loki, CNPG backups, etcd snapshots | per-bucket policies where possible |
| Cloudflare API token | Terraform (cloudflare root), wrangler | Zone: DNS Edit, Zone Settings Edit; Account: Workers Scripts Edit, Access: Apps and Policies Edit, Cloudflare Tunnel Edit, Email Routing Edit |
| Cloudflare Account ID | wrangler, Terraform | |
| GitHub repository secrets | CI | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; GHCR uses `GITHUB_TOKEN` |
| age private key | SOPS decryption on the operator machine | `SOPS_AGE_KEY_FILE` |
| OpenPGP key material | commit signing, article signatures | offline certify key; subkeys on hardware token recommended |

## Workstation constraint (2026-09-16)

WSL2 and therefore Docker Desktop cannot start on the current workstation
because hardware virtualisation is disabled in firmware
(`HCS_E_HYPERV_NOT_INSTALLED`). All tools listed have native Windows builds
and WSL is optional, but until virtualisation is enabled in BIOS/UEFI,
container builds and Postgres-backed integration tests run in CI only; the
site and the Go service still build and unit-test natively.
