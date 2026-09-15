# ivanpanev.net

Personal site, tools, and platform for [ivanpanev.net](https://ivanpanev.net).
Everything in this repository is delivered as static assets on Cloudflare or as
containers on a Talos Kubernetes cluster managed by Argo CD, so it can move from
Hetzner Cloud to a home cluster without rewriting anything.

Architecture, decisions, and the review process are documented under `docs/`.
Start with [docs/architecture.md](docs/architecture.md) and the
[ADR index](docs/adr/README.md).

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web/` | Astro site: blog, projects wiki, client-side tools, PGP pages, notebook UI. Deployed to Cloudflare Workers Static Assets. |
| `apps/notebook-api/` | Go service for the passcode-protected encrypted notebook. Runs in the cluster. |
| `infra/terraform/hetzner/` | Talos Kubernetes cluster on Hetzner Cloud (module `hcloud-k8s/kubernetes/hcloud`), Object Storage buckets. |
| `infra/terraform/cloudflare/` | DNS, Tunnel, Access, rate limiting, zone security settings, Email Routing. |
| `k8s/bootstrap/argocd/` | One-time Argo CD installation values (Helm) with the KSOPS plugin. |
| `k8s/clusters/<name>/` | Per-cluster root Application (app-of-apps) and cluster-specific values. |
| `k8s/infrastructure/` | Platform services: cloudflared, Gateway, cert-manager issuers, CloudNativePG operator, kube-prometheus-stack, Loki, Alloy. |
| `k8s/apps/` | Workloads (notebook-api and later services), base + per-cluster overlays. |
| `docs/adr/` | Architecture Decision Records. |
| `docs/runbooks/` | Operational procedures: bootstrap, teardown, restore drill, key ceremony. |
| `docs/reviews/` | Gauntlet reviews: critic rubric, per-milestone reports, evidence, backlog. |
| `docs/security/` | Threat models. |
| `scripts/` | Developer setup and helper scripts (PowerShell and POSIX sh). |
| `.github/workflows/` | CI: site deploy, service build/sign/publish, manifest validation. |

## Getting started

1. Install the toolchain: [docs/toolchain.md](docs/toolchain.md)
   (`scripts/setup-windows.ps1` or `scripts/setup-wsl.sh`).
2. Read the ADRs so the constraints are clear before changing anything.
3. Per-component instructions live in each component's own `README.md`.

Secrets are never committed in plaintext. Files matched by [`.sops.yaml`](.sops.yaml)
are encrypted with [SOPS](https://github.com/getsops/sops) and
[age](https://age-encryption.org/); see
[docs/runbooks/secrets.md](docs/runbooks/secrets.md).

## Delivery process

Work is organised in milestones. Each milestone ends with an independent
review by a critic agent scored 0-10 across six dimensions; a milestone must
score at least 8 with no open Critical or High findings before the next one
starts. The rubric is [docs/reviews/CRITIC.md](docs/reviews/CRITIC.md) and
reports are stored next to it.

## Licensing

Not yet decided (tracked as an open decision in
[ADR-0001](docs/adr/0001-record-architecture-decisions.md)). Until a licence
file is added, all rights are reserved.
