# Migration-readiness checklist (Milestone 5)

What would break if the Hetzner cluster were rebuilt tomorrow on home
hardware. Red is allowed only for items that require the home cluster to
exist.

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Git is the desired state (`k8s/`, `infra/terraform/`) | Green | Argo app-of-apps + two Terraform roots |
| 2 | Secrets are SOPS with operator + cluster age recipients | Green | Adding home: third recipient, `sops updatekeys` |
| 3 | Postgres recoverable from object storage | Yellow | Overlay exists; live drill is operator (no backup yet until notebook Cluster is on `main`) |
| 4 | Loki chunks in S3-compatible storage | Green | Same bucket names on Garage/MinIO (ADR-0007) |
| 5 | No Hetzner Load Balancer in the path | Green | Tunnel + Gateway only |
| 6 | Static site independent of the cluster | Green | Workers Static Assets |
| 7 | Image deploys by digest | Yellow | Overlay still `:main` until first CI bump |
| 8 | etcd snapshot portable to home | Red | Talos snapshot is for this control plane; home is a new cluster (allowed) |
| 9 | CCM/CSI swapped per provider | Red | hcloud CCM/CSI stay on Hetzner; home needs its own (allowed) |
| 10 | Cloudflare Access email still the operator | Green | Edge stays at Cloudflare in Phase 2 |
| 11 | Restore drill documented and kustomize-valid | Green | `k8s/apps/notebook-restore`, `docs/runbooks/restore-drill.md` |
| 12 | Alert → runbook map complete | Green | `platform-alerts.yaml` annotations |

Yellow items become Green after: push `main`, first signed image, first
Barman backup, operator restore-drill transcript in
`docs/reviews/evidence/m5/restore-drill.txt`.
