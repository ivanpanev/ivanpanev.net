# Milestone 2 remediation (round 1 → round 2)

| Finding | Change |
| --- | --- |
| M2-R1-F01 | `cluster-teardown.md` now destroys with `-target=module.kubernetes`. A full destroy is documented as the `prevent_destroy` safety rail, not as the rebuild procedure. |
| M2-R1-F02 | Tunnel token is written to `k8s/infrastructure/cloudflared/tunnel.secret.yaml` and encrypted in place so `.sops.yaml` `^k8s/.*\.(enc\|secret)\.ya?ml$` applies. |
| M2-R1-F03 | Rate-limit defaults are period 10 / 10 requests / mitigation_timeout 10 (Cloudflare Free). Variable description and `rate_limit.tf` comment record the Free vs Pro constraint; period validation allows only 10 or 60. |
| M2-R1-F04 | Hostnames `notes-api` rate-limit and grafana/argocd/hubble `public = false` are `variable` validations (plan fails). Soft `check` blocks removed. |
| M2-R1-F05 | Bootstrap encrypt steps include a PowerShell path (UTF-8 no BOM, `$env`-relative repo path). |
| M2-R1-F06 | Verify block uses `talosctl get members` then `talosctl version --nodes "$(talosctl get members -o jsonpath='{.items[0].metadata.id}')"`. |
| M2-R1-F07 | Bootstrap documents a 30-day console prune until Hetzner lifecycle is apply-tested. No unsupported `aws_s3_bucket_lifecycle_configuration`. |
| M2-R1-F08 | Optional `talos_backup_s3_access_key` / `talos_backup_s3_secret_key` default to the project keys; bootstrap and example tfvars tell the operator to prefer an `ivp-etcd`-only pair. |
