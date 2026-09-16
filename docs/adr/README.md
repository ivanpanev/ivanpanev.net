# Architecture Decision Records

One file per decision, numbered, never edited after acceptance except to change
status (Accepted, Superseded by ADR-XXXX, Deprecated). Use
[0000-template.md](0000-template.md) for new records.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions; open decisions register | Accepted |
| [0002](0002-split-static-edge-from-dynamic-cluster.md) | Static site on Cloudflare, dynamic services in an owned Kubernetes cluster | Accepted |
| [0003](0003-astro-react-islands.md) | Astro 6 with React islands for the site; no SSR adapter | Accepted |
| [0004](0004-talos-on-hetzner-via-hcloud-k8s.md) | Talos Linux on Hetzner Cloud via the hcloud-k8s Terraform module | Accepted |
| [0005](0005-cloudflare-tunnel-only-ingress.md) | Cloudflare Tunnel and Access as the only HTTP ingress; no Hetzner load balancer | Accepted |
| [0006](0006-argocd-with-ksops.md) | Argo CD for GitOps with SOPS/age secrets via KSOPS | Accepted |
| [0007](0007-observability-stack.md) | kube-prometheus-stack, Loki on S3, Alloy for logs | Accepted |
| [0008](0008-postgres-via-cloudnativepg.md) | PostgreSQL via CloudNativePG with Barman Cloud plugin backups to S3 | Accepted |
| [0009](0009-notebook-crypto-and-language.md) | Notebook: Go service, client-side encryption, passcode-derived keys | Accepted |
| [0010](0010-state-only-in-postgres-and-s3.md) | Persistent state lives only in Postgres or S3-compatible storage | Accepted |
| [0011](0011-custom-wiki-layout-not-starlight.md) | Projects wiki as a custom Astro layout rather than Starlight | Accepted |
| [0012](0012-monorepo-ci-and-supply-chain.md) | Monorepo, GitHub Actions, GHCR, cosign keyless signing | Accepted |
| [0013](0013-x86-only-until-homelab-known.md) | x86-64 nodes and images only until homelab hardware is known | Accepted |
| [0014](0014-oidc-everywhere-no-custom-auth.md) | No home-grown authentication; Cloudflare Access now, OIDC IdP later | Accepted |
| [0015](0015-gauntlet-review-process.md) | Milestone gating by an independent critic review | Accepted |
| [0016](0016-authentik-oidc.md) | Authentik as the self-hosted OIDC identity provider | Accepted |
