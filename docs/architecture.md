# Architecture

Living document. Decisions are recorded in [ADRs](adr/README.md); this page
is the map. Updated at the end of every milestone.

## System shape

```mermaid
flowchart LR
  Browser --> CF[Cloudflare edge: DNS, CDN, WAF, Access]
  CF -->|static| Assets[Workers Static Assets: Astro build]
  CF -->|notes-api., grafana., argocd., hubble., auth.| Tunnel[cloudflared x2 in cluster]
  Tunnel --> GW[Cilium Gateway, ClusterIP]
  GW --> API[notebook-api]
  GW --> Auth[Authentik]
  GW --> Grafana
  GW --> Argo[argocd-server]
  API --> PG[CloudNativePG Postgres]
  Auth --> PG
  PG -->|WAL + base backups| S3[Hetzner Object Storage]
  Loki --> S3
  GH[GitHub Actions] -->|wrangler deploy| Assets
  GH -->|image + cosign, tag bump| Repo[(Git)]
  Repo --> Argo
```

## Layers and who owns what

| Layer | Technology | Lives in | Portable? |
| --- | --- | --- | --- |
| Public site | Astro 7 static build | Cloudflare Workers Static Assets | Yes: a directory of files |
| Edge | Cloudflare DNS, CDN, WAF, Tunnel, Access, rate limiting | `infra/terraform/cloudflare` | Provider-specific by design; the only Cloudflare-bound layer |
| Cluster | Talos Linux, Cilium, Gateway API, hcloud CCM/CSI | `infra/terraform/hetzner` | Talos and Cilium yes; CCM/CSI swapped per provider |
| GitOps | Argo CD, KSOPS | `k8s/bootstrap`, `k8s/clusters` | Yes |
| Platform | cloudflared, cert-manager, CNPG operator, kube-prometheus-stack, Loki, Alloy | `k8s/infrastructure` | Yes; S3 endpoint is configuration |
| Workloads | notebook-api (Go), Authentik | `k8s/apps`, `apps/*` | Yes |
| State | PostgreSQL via CNPG; S3-compatible object storage | CNPG clusters; Hetzner Object Storage now | Yes, by ADR-0010 |

## Environments

| Name | Purpose | Status |
| --- | --- | --- |
| `hetzner` | First production cluster, Falkenstein | Live (M2); GitOps handover waits for GitHub `main` |
| `home` | Future primary cluster on homelab hardware | Phase 2 |
| local | `astro dev`, `go run`, Docker Compose Postgres for tests | M1/M4 (Compose is CI-only on this workstation) |

## Hostnames

| Host | Serves | Protection |
| --- | --- | --- |
| `ivanpanev.net`, `www` | static site | public |
| `notes-api.ivanpanev.net` | notebook API | Cloudflare rate limit; application limits |
| `grafana.ivanpanev.net` | Grafana | Cloudflare Access |
| `argocd.ivanpanev.net` | Argo CD UI | Cloudflare Access |
| `hubble.ivanpanev.net` | Hubble UI | Cloudflare Access |
| `auth.ivanpanev.net` | Authentik (OIDC IdP) | Cloudflare Access |

Flat subdomains only: Cloudflare Universal SSL covers `*.ivanpanev.net` but
not deeper wildcards.

## Constraints to remember

- Cloudflare proxy: 100 MB request body (Free/Pro), 100 s origin timeout, no
  UDP through Tunnel.
- Hetzner block volumes are ReadWriteOnce and do not leave Hetzner.
- Kubernetes and Talos APIs are reachable only from the operator's address.
- One control-plane node in Phase 1 means one etcd copy. Reboot: API
  unavailable, workloads keep running. Disk loss: cluster rebuild from Git +
  Terraform, data restored from object storage (CNPG) or etcd snapshot.
  Accepted RTO four hours (ADR-0004).
- Projected cluster cost ~€42–45 / month excl. VAT ([cost.md](cost.md)).
- CSP is enforce-only: Astro emits a per-page `<meta>` with script/style
  hashes; `public/_headers` adds `frame-ancestors 'none'`. Report-Only was
  never used because hashes are page-specific and a Report-Only header
  cannot substitute for the meta tag.

## Milestone log

| Milestone | Delivered | Review |
| --- | --- | --- |
| M0 | Repository, ADR set, critic process, toolchain scripts | r3: 8 PASS |
| M1 | Astro 7 static site, tools, PGP/WKD, wrangler + CI | r2: 8 PASS |
| M2 | Hetzner Talos cluster + Cloudflare edge Terraform | r2: 8 PASS |
| M3 | Argo CD, Gateway, Tunnel, observability, CNPG operator | r3: 8 PASS |
| M4 | notebook-api, CNPG cluster, /notes island | r2: 8 PASS |
| M5 | Restore overlay, platform alerts, threat model, cost, migration checklist | r3: 8 PASS |
| M6 | Authentik OIDC IdP, CNPG, Access hostname | r2: 8 PASS |
| M7 | Ship and hand over: live GitOps, notes-api, rate-limit + client 429 handling | r2: 8 PASS |
| M8 | Zen tokens (koke / murasaki / kaki), Zen fonts, hanko | r1: 8 PASS |
| M9 | Quick PIN (code + PIN), exclusive TTL 3m–5h18m, per-notebook lockout | r1: 8 PASS |
| M10 | Subnet first/last usable, /tools/color picker | r1: 8 PASS |
| M11 | /tools/editor CodeMirror 6, IndexedDB + cloud workspace | r1: 8 PASS |
| M12 | DrealNote static curated lines on Home and About | r1: 8 PASS |
