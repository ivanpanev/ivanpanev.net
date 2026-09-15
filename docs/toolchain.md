# Toolchain

Everything below is pinned to a minimum version; newer is fine unless a
component README says otherwise. `scripts/setup-windows.ps1` installs the
Windows set with winget; `scripts/setup-wsl.sh` installs the same set inside
WSL (Fedora or Debian family). All tools listed have native Windows builds;
WSL is optional.

Known constraint on the current workstation (2026-09-16): WSL2 and therefore
Docker Desktop cannot start because hardware virtualisation is disabled in
firmware (`HCS_E_HYPERV_NOT_INSTALLED`). Until that is enabled in BIOS/UEFI,
container builds and Postgres-backed integration tests run in CI only; the
site and the Go service still build and unit-test natively.

| Tool | Minimum | Used by | Notes |
| --- | --- | --- | --- |
| Git | 2.40 | all | commit signing configured (`git config commit.gpgsign true`) |
| Node.js | 22.12 | `apps/web` | Astro 6 requires Node 22+ |
| pnpm | 10 | `apps/web` | via `corepack enable`; version pinned in `apps/web/package.json` `packageManager` |
| Go | 1.23 | `apps/notebook-api` | pinned in `go.mod` |
| Docker | 27 | local image builds, integration tests | Docker Desktop on Windows; CI builds the published images |
| Terraform | 1.10 | `infra/terraform/*` | OpenTofu 1.9+ is compatible (OD-6) |
| Packer | 1.11 | `infra/terraform/hetzner` | the hcloud-k8s module uses it to upload Talos images |
| talosctl | matches the cluster's Talos version | cluster ops | check `infra/terraform/hetzner/README.md` for the pinned Talos version |
| kubectl | within one minor of the cluster | cluster ops | |
| Helm | 3.16 | rendering charts locally, bootstrap | |
| kustomize | 5.5 | `k8s/` | standalone binary, matches Argo CD's bundled version closely |
| kubeconform | 0.6 | `k8s/` validation | |
| Argo CD CLI | matches the installed Argo CD | cluster ops | |
| SOPS | 3.9 | secrets | |
| age | 1.2 | secrets | |
| GitHub CLI | 2.60 | repo automation | |
| Wrangler | 4 | `apps/web` deploy | installed as a dev dependency of `apps/web`; no global install needed |
| cosign | 2.4 | verifying images locally | CI signs; operators verify |
| hcloud CLI | 1.50 | optional, inspecting Hetzner resources | |

## Credentials the operator must create (never stored in this repository)

| Credential | Where used | Scope |
| --- | --- | --- |
| Hetzner Cloud API token | Terraform (hetzner root) | read/write on the project |
| Hetzner Object Storage S3 key pair | Terraform state backend, Loki, CNPG backups | per-bucket policies where possible |
| Cloudflare API token | Terraform (cloudflare root), wrangler | Zone: DNS Edit, Zone Settings Edit; Account: Workers Scripts Edit, Access: Apps and Policies Edit, Cloudflare Tunnel Edit, Email Routing Edit |
| Cloudflare Account ID | wrangler, Terraform | |
| GitHub repository secrets | CI | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; GHCR uses `GITHUB_TOKEN` |
| age private key | SOPS decryption on the operator machine | `SOPS_AGE_KEY_FILE` |
| OpenPGP key material | commit signing, article signatures | offline certify key; subkeys on hardware token recommended |

## Verify the installation

```
scripts/check-toolchain.ps1     # Windows
scripts/check-toolchain.sh      # WSL / POSIX
```

Both print each tool, the detected version, and whether it meets the minimum.
