# Runbooks

Operational procedures. Each runbook states its preconditions, the exact
commands, how to verify success, and how to roll back. Written for an
operator who has not touched the system in six months.

| Runbook | Purpose | Added in |
| --- | --- | --- |
| [secrets.md](secrets.md) | Encrypting, decrypting, rotating secrets with SOPS and age | M0 |
| cluster-bootstrap.md | Create the Hetzner cluster from zero, install Argo CD, hand over to GitOps | M2/M3 |
| cluster-teardown.md | Destroy the cluster safely (delete protection, backups first) | M2 |
| cluster-upgrade.md | Talos and Kubernetes upgrades with `talosctl` | M3 |
| pgp-key-ceremony.md | Generate the OpenPGP key hierarchy, publish WKD, configure commit signing | M1 |
| restore-drill.md | Restore a CloudNativePG cluster from object storage into a scratch namespace | M5 |
| incident-*.md | One per alert rule, linked from the alert annotation | M5 |
| migrate-to-home.md | Cut over dynamic services from Hetzner to the home cluster | Phase 2 |
