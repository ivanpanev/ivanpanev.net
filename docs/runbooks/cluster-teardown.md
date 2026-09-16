# Runbook: tear down the Hetzner cluster

Destroys the Phase 1 cluster. Irreversible for etcd and local PVs. Object
Storage contents are **not** deleted by Terraform unless you add that
explicitly; buckets stay so Loki/CNPG/etcd backups survive a rebuild.

## Preconditions

- You have a current CNPG backup and an etcd snapshot you trust, *or* you
  accept losing cluster objects.
- No one else is using the cluster.
- Cloudflare Tunnel can stay (recommended) or be destroyed separately.

## 1. Disable delete protection

`cluster_delete_protection` defaults to `true`. Destroy will refuse until
you flip it and apply.

```bash
cd infra/terraform/hetzner
# in terraform.tfvars:
#   cluster_delete_protection = false
terraform plan -out=tfplan
# the plan must show delete-protection going false and nothing else unexpected
terraform apply tfplan
```

## 2. Destroy the cluster, not the buckets

Buckets share this root and have `lifecycle.prevent_destroy`. A full
`terraform plan -destroy` therefore **errors** (`Instance cannot be
destroyed`) — that is the safety rail, not a bug. Destroy only the
module that owns nodes, network, and firewall:

```bash
cd infra/terraform/hetzner
terraform plan -destroy -target=module.kubernetes -out=tfplan
# Confirm: control-plane, workers, network, firewall.
# Confirm: aws_s3_bucket.this is not in the plan. If it is, stop.
terraform apply tfplan
```

Do not remove `prevent_destroy` as part of a cluster rebuild.

Buckets survive on purpose (Loki, CNPG, etcd snapshots, Terraform state).
To delete a bucket later, empty it in the console, remove the
`prevent_destroy` block for that key in a dedicated change, and apply.

If the S3 backend is in use, this targeted destroy still updates state in
the bucket. After a full cluster rebuild you keep `backend.tf`.

## 3. Cloudflare (optional)

Leaving the Tunnel and Access apps in place means DNS still points at a
dead origin (Cloudflare 502/530). Either keep them for a rebuild the same
day, or:

```bash
cd infra/terraform/cloudflare
terraform destroy
```

Do not delete `k8s/infrastructure/cloudflared/tunnel.secret.yaml` until the
new tunnel token has replaced it; a stale token is useless, not a secret
leak, but rotating is cleaner.

## 4. Verify

- Hetzner console: no CX23/CX43 servers named `ivp-*`, no leftover volumes.
- `talosctl get members` and `kubectl get nodes` fail (kubeconfig is stale).
- Buckets you chose to keep still list objects.

## If destroy is stuck

Hetzner volumes or load balancers created outside this root (you should
have none) block network delete. List them (`hcloud volume list`,
`hcloud load-balancer list`) and delete leftovers by hand, then re-run
destroy. A LoadBalancer existing at all is a bug against ADR-0005.
