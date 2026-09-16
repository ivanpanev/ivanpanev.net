# Runbooks

Operational procedures. Each runbook states its preconditions, the exact
commands, how to verify success, and how to roll back. Written for an
operator who has not touched the system in six months.

| Runbook | Purpose | Added in |
| --- | --- | --- |
| [secrets.md](secrets.md) | Encrypting, decrypting, rotating secrets with SOPS and age | M0 |
| [cluster-bootstrap.md](cluster-bootstrap.md) | Create the Hetzner cluster and Cloudflare edge from zero; encrypt the tunnel token. Argo CD handover is M3. | M2 |
| [argocd-bootstrap.md](argocd-bootstrap.md) | Install Argo CD + KSOPS, apply platform services, hand over to GitOps | M3 |
| [cluster-teardown.md](cluster-teardown.md) | Destroy the cluster safely (delete protection, backups first) | M2 |
| [cluster-upgrade.md](cluster-upgrade.md) | Talos/Kubernetes pins, `versions.env` lockstep, module bump, `talosctl upgrade` | M2 |
| [etcd-restore.md](etcd-restore.md) | Rebuild the control plane from a daily `talosctl etcd snapshot` in object storage | M3 |
| [notebook-api.md](notebook-api.md) | First sync, health, WAL prefix, overlay digest, rollback | M4 |
| [pgp-key-ceremony.md](pgp-key-ceremony.md) | Generate the OpenPGP key hierarchy, publish WKD, configure commit and post signing | M1 |
| [restore-drill.md](restore-drill.md) | Restore a CloudNativePG cluster from object storage into a scratch namespace | M5 |
| [incidents.md](incidents.md) | One section per platform alert, linked from the PrometheusRule annotation | M5 |
| [authentik.md](authentik.md) | Bootstrap Authentik, first login, restore pointer | M6 |
| migrate-to-home.md | Cut over dynamic services from Hetzner to the home cluster | Phase 2 |
