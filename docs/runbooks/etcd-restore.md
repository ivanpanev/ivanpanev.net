# Runbook: restore etcd from the daily object-storage snapshot

The control plane is one node (ADR-0004). Disk loss of that node loses etcd.
Talos writes an age-encrypted snapshot into `ivp-etcd` every day at 03:00 UTC.
This restores that snapshot onto a replacement control plane.

Application data is **not** in etcd. Restore Postgres from Barman
(`docs/runbooks/restore-drill.md`, Milestone 5) after the API is up.

## Preconditions

- `TALOSCONFIG` for the cluster (or a rebuilt cluster with the same name).
- Operator age **private** key that matches `talos_backup_age_public_key`.
- S3 credentials that can read `ivp-etcd`.
- Replacement control-plane node provisioned by Terraform (or still running
  if you are recovering a corrupted etcd, not a missing disk).

## 1. Fetch the snapshot

```bash
# list objects in ivp-etcd (Hetzner console or aws s3api)
aws --endpoint-url https://fsn1.your-objectstorage.com s3 ls s3://ivp-etcd/
aws --endpoint-url https://fsn1.your-objectstorage.com s3 cp \
  s3://ivp-etcd/<snapshot-key> etcd.snapshot.age
age -d -i "$SOPS_AGE_KEY_FILE" -o etcd.snapshot etcd.snapshot.age
```

## 2. Restore

Follow current Talos docs for `talosctl etcd restore` on a maintenance-mode
control plane, then bootstrap:

```bash
talosctl -n <cp-ip> etcd restore --from etcd.snapshot
# then reboot the control plane and wait until kubectl get nodes is Ready
```

Exact flags change with Talos minor releases; read
https://www.talos.dev/v1.13/advanced/disaster-recovery/ for v1.13.10 and do
not improvise around `--from`.

## 3. Verify

- `talosctl etcd members` shows the control plane.
- `kubectl get nodes` Ready.
- Argo CD Applications return to Synced (or re-apply
  `docs/runbooks/argocd-bootstrap.md` if the restore was onto a new cluster
  whose identity drifted).

## Rollback

A bad restore is another restore from an older snapshot. Do not keep the
decrypted `etcd.snapshot` on disk; shred it after success.

## When this is the wrong tool

If the workers are healthy and only a Deployment is broken, revert Git.
If Postgres is wrong, use the CNPG restore drill, not etcd.
