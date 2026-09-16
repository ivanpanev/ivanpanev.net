# Evidence pack: Milestone 6 (Authentik OIDC IdP)

Generated 2026-09-16. Live Authentik pods are operator-verify: GitHub `main`
does not yet contain the k8s tree. Do not apply `root-application.yaml`.
Cloudflare DNS + Access for `auth.ivanpanev.net` were applied from the
Cloudflare Terraform root (2 added, 1 tunnel config changed, 0 destroyed).

| File | Command | Expected |
| --- | --- | --- |
| `k8s-validate.txt` | `bash scripts/k8s-validate.sh` | `check-alerts: ok (12 alerts)`; HOST guard; authentik resources Valid: 7; helm authentik 2026.8.2 Valid: 5 (no outpost SA/Role); `k8s-validate: ok` |
| `check-alerts.txt` | `bash scripts/check-alerts.sh` | `check-alerts: ok (12 alerts)` including AuthentikDown |
| `terraform-cloudflare.txt` | `terraform plan/apply` Cloudflare root | 2 add (DNS `auth`, Access app `auth`), 1 change (tunnel ingress), 0 destroy |

Documents in tree (not command output):

- `docs/adr/0016-authentik-oidc.md` (OD-3 closed)
- `k8s/apps/authentik/` (CNPG + Helm values + SOPS)
- `k8s/clusters/hetzner/applications/authentik.yaml` + `authentik-resources.yaml`
- `docs/runbooks/authentik.md`
- `docs/architecture.md`, `docs/cost.md`, `docs/security/platform-threat-model.md`

## Not executable on this workstation

| Check | Why | Where it runs instead |
| --- | --- | --- |
| Live Authentik pods / initial-setup | no GitOps `main`; do not apply root Application | operator after push + sync |
| Access OTP → `https://auth.ivanpanev.net` | origin HTTPRoute not on cluster until GitOps | operator after first sync |
| First Barman backup of `authentik` | Cluster not synced | operator after first nightly/one-shot Backup |

## Operator verification required

- After `main` contains the k8s tree: wait for `authentik` Cluster Ready and
  `deploy/authentik-server` 1/1, then complete `/if/flow/initial-setup/`
  behind Access. Attach `kubectl -n authentik get cluster,pod,deploy` to
  `docs/reviews/evidence/m6/live.txt`.
- Confirm `auth.ivanpanev.net` Access policy is operator email only.
- Do not set `hostnames.auth.public = true`.
