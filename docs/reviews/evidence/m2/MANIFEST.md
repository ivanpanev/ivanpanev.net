# Evidence pack: Milestone 2 (Terraform: Hetzner cluster and Cloudflare edge)

Generated 2026-09-16 on the Windows workstation. Terraform 1.16.2 from
releases.hashicorp.com; TFLint 0.59.1. Text files are UTF-8 LF with the
command as the first line and `exit=<code>` as the last line.

| File | Command | Expected |
| --- | --- | --- |
| `fmt-check.txt` | `terraform fmt -check -recursive infra/terraform` | exit 0, no files listed |
| `validate-hetzner.txt` | `terraform validate -no-color` in `infra/terraform/hetzner` | `The configuration is valid.`, exit 0 |
| `validate-cloudflare.txt` | `terraform validate -no-color` in `infra/terraform/cloudflare` | `The configuration is valid.`, exit 0 |
| `tflint-hetzner.txt` | `tflint` after `tflint --init` (aws plugin 0.43.0) | exit 0, no findings |
| `tflint-cloudflare.txt` | `tflint` | exit 0, no findings |
| `plan.txt` | `terraform plan` | not executable without cloud credentials; dummy Cloudflare token shows the graph parses (see file) |
| `trivy.txt` | `trivy config` | could not execute: trivy not installed |
| `firewall.md` | static table from `kubernetes.tf` | kube/Talos API CIDR, no Hetzner LB, CCM Service controller off |
| `state-backend.md` | static notes | local state then S3; gitignore of tfstate/tfvars/kubeconfig; lockfile committed |
| `gitignore-check.txt` | `git check-ignore -v` | plaintext tfvars, tfstate, kubeconfig, talosconfig, backend.hcl ignored; example tfvars and enc.tfvars re-included; lock files not ignored |
| `tree.txt` | `git ls-files` + untracked not-ignored under terraform/runbooks/terraform.yml | every M2 file |

## Not executable on this workstation

| Check | Why | Where it runs instead |
| --- | --- | --- |
| `terraform plan` / `apply` against Hetzner and Cloudflare | no API tokens in this session | operator: `docs/runbooks/cluster-bootstrap.md` |
| `terraform.yml` on GitHub Actions | no git remote | first push; workflow pins terraform 1.16.2 and tflint 0.59.1 by SHA |
| Live firewall / no LoadBalancer / Access challenge | cluster does not exist yet | operator after apply |
| `trivy config` | trivy is not in the toolchain | omitted; validate + tflint cover schema/lint |

## Repository facts

- Module `hcloud-k8s/kubernetes/hcloud` 5.9.1 with explicit `talos_version = v1.13.10` and `kubernetes_version = v1.34.11`. `scripts/versions.env` updated to match (KUBERNETES_VERSION=1.34, TALOS_VERSION=1.13, PIN_KUBECTL=1.34.11, PIN_TALOSCTL=1.13.10).
- CSI storage class object keys are the module's camelCase (`defaultStorageClass`, `reclaimPolicy`); class name `default`, LUKS encrypted.
- Cloudflare tunnel token comes from data source `cloudflare_zero_trust_tunnel_cloudflared_token` (resource has no `tunnel_token` attribute in provider 5.25).
- ADR-0005: per-hostname tunnel ingress + 404 catch-all; Access on grafana/argocd/hubble; notes-api public + rate-limited. CCM load balancers disabled.
- ADR-0004: daily talos-backup CronJob into `ivp-etcd`, age-encrypted, `prevent_destroy` on buckets, `cluster_delete_protection` default true.
