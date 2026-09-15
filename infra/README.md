# infra/

Infrastructure as code. Two independent Terraform root modules with separate
state so a mistake in one cannot destroy the other.

| Root | Manages | Milestone |
| --- | --- | --- |
| `terraform/hetzner/` | Talos Kubernetes cluster (module `hcloud-k8s/kubernetes/hcloud`), Object Storage buckets, firewall | M2 |
| `terraform/cloudflare/` | DNS records, Tunnel and its ingress config, Access applications and policies, rate-limiting ruleset, zone security settings, Email Routing | M2 |

Conventions:

- Provider and module versions pinned; `.terraform.lock.hcl` committed.
- Variables carrying credentials come from `*.enc.tfvars` / `*.enc.tfvars.json`
  (SOPS-encrypted, tracked) or `TF_VAR_*` environment variables. Plaintext
  `*.tfvars` files are gitignored; only `*.example.tfvars` and `*.enc.tfvars*`
  are tracked (see `.gitignore`).
- `terraform fmt -check`, `terraform validate`, and `tflint` must pass before
  a plan is reviewed.
- Every root has a `README.md` with apply/destroy procedure and a link to the
  matching runbook.
