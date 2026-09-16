# Incident runbooks

One section per platform PrometheusRule in
`k8s/infrastructure/kube-prometheus-stack/resources/platform-alerts.yaml`.
Alert annotations use `runbook: docs/runbooks/incidents.md#<lowercase-alertname>`.
kube-prometheus-stack defaultRules (Watchdog silenced) are chart-owned; this
file covers the rules this repo added.

ntfy is the Alertmanager receiver. Silence in Alertmanager, not by editing Git,
unless the rule is wrong.

## NodePressure

**Means:** a node has MemoryPressure, DiskPressure, or PIDPressure for 5m.

**Check:**

```bash
kubectl get nodes
kubectl describe node <name> | sed -n '/Conditions/,/Addresses/p'
kubectl top nodes
```

**Do:** drain only if another worker is Ready (`kubectl drain --ignore-daemonsets --delete-emptydir-data`). CX43 workers are two; draining both is an outage. DiskPressure: identify the PVC (`kubectl get pvc -A`) and follow PVCNearFull. Do not resize the control plane in place; that is Terraform.

**Rollback:** uncordon. If you scaled a nodepool, `terraform apply` is the source of truth.

## PVCNearFull

**Means:** kubelet reports used/capacity > 85% for 15m.

**Check:**

```bash
kubectl get pvc -A
kubectl describe pvc -n <ns> <name>
```

Known large volumes: Prometheus `20Gi`, Loki `10Gi`, Alertmanager `2Gi`, notebook `10Gi`, authentik `10Gi`. Grafana has no PVC.

**Do:** Prometheus/Loki: lower retention in values and sync, or expand the PVC (`kubectl edit pvc` + StorageClass allows expansion). Notebook: 10Gi is the Phase 1 cap; dump unused WAL via CNPG, do not silently grow past the cost review.

**Rollback:** leave expanded PVCs; shrinking is not supported.

## CNPGBackupMissing

**Means:** `barman_cloud_cloudnative_pg_io_last_available_backup_timestamp` is older than 36h (plugin metric; the deprecated `cnpg_collector_*` gauges stay at 0 with Barman Cloud plugin). The alert arms only after the first successful backup (`> 0`).

**Check:**

```bash
# namespace/cluster from the alert labels: notebook or authentik
kubectl -n <namespace> get cluster,backup,scheduledbackup
kubectl -n <namespace> logs -l cnpg.io/cluster=<cluster> -c postgres --tail=100
# list keys only
aws --endpoint-url https://fsn1.your-objectstorage.com s3 ls s3://ivp-cnpg/notebook/
aws --endpoint-url https://fsn1.your-objectstorage.com s3 ls s3://ivp-cnpg/authentik/
```

**Do:** do not recreate PublicAccessBlock on the bucket (M3). Confirm `cnpg-s3` decrypts. Trigger a one-shot `Backup` CR. If WAL never appeared, follow `docs/runbooks/notebook-api.md` Barman 403 row.

**Rollback:** none; backups are additive.

## CNPGBackupFailed

**Means:** `barman_cloud_cloudnative_pg_io_last_failed_backup_timestamp` is within 24h.

**Check / do:** same as CNPGBackupMissing. Read the Backup CR `.status`. Hetzner Ceph 403 with checksum: env `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` must stay on the Cluster.

## CloudflaredDown

**Means:** zero available replicas of `cloudflared/cloudflared` for 5m. Grafana, Argo CD, Hubble, Authentik, and notes-api are unreachable from the internet.

**Check:**

```bash
kubectl -n cloudflared get deploy,pods,pdb
kubectl -n cloudflared logs -l app.kubernetes.io/name=cloudflared --tail=80
```

**Do:** secret `cloudflared-tunnel` missing → KSOPS/sops-age. Image pull → digest in `deployment.yaml`. Both workers down → node issue, not Tunnel. Cloudflare dashboard is out of band; do not rotate the tunnel token unless the secret is wrong.

**Rollback:** revert the Deployment via Git. Token rotation is `docs/runbooks/secrets.md`.

## CertificateExpiring

**Means:** a Ready cert-manager Certificate expires in <14 days.

**Check:**

```bash
kubectl get certificate,clusterissuer -A
kubectl describe certificate -n cert-manager wildcard-ivanpanev-net
```

TLS for public hosts terminates at Cloudflare; this Certificate is `cert-manager/wildcard-ivanpanev-net` for in-cluster TLS later. Still renew it. Cloudflare DNS-01 needs `cloudflare-api-token`. Prometheus scrapes cert-manager `:9402` via ServiceMonitor `monitoring/cert-manager`.

**Rollback:** none; a new Certificate replaces the Secret.

## NotebookAPI5xx

**Means:** 5xx rate > 0.05/s for 10m on `job="notebook-api"`.

**Check:** Grafana dashboard uid `notebook-api`; `kubectl -n notebook get pods,cluster`; `/readyz`. CNPG bounce is expected to 500 briefly (retry budget ~350ms). ImagePullBackOff until CI publishes is not 5xx from the Service (no endpoints).

**Do:** logs `kubectl -n notebook logs -l app.kubernetes.io/name=notebook-api`. Overlay revert: `docs/runbooks/notebook-api.md`.

## NotebookAPILatency

**Means:** p99 > 2s for 15m. Argon2id is in the browser; server p99 should stay well under 2s for 20 MiB items except the upload itself.

**Check:** same dashboard. If only POST items is slow, size/S3 is not involved (ciphertext is in Postgres). Node pressure and PVC full first.

## CNPGWALArchivingStuck

**Means:** `cnpg_pg_stat_archiver_seconds_since_last_archival` > 15m, or more than 16 WAL files sitting in `cnpg_collector_pg_wal_archive_status{value="ready"}`. Nightly base backups can still look healthy while WAL is stuck; RPO then becomes hours (ADR-0004/0008).

**Check:**

```bash
# namespace/cluster from the alert labels: notebook or authentik
kubectl -n <namespace> get cluster <cluster> -o jsonpath="{.status.lastArchivedWAL}{'\n'}"
kubectl -n <namespace> exec -c postgres <cluster>-1 -- psql -U postgres -c 'SELECT * FROM pg_stat_archiver;'
aws --endpoint-url https://fsn1.your-objectstorage.com s3 ls s3://ivp-cnpg/notebook/wals/ 2>/dev/null | tail
aws --endpoint-url https://fsn1.your-objectstorage.com s3 ls s3://ivp-cnpg/authentik/wals/ 2>/dev/null | tail
```

**Do:** same Barman 403 / checksum / `cnpg-s3` path as CNPGBackupFailed. Do not wait for 02:00.

**Rollback:** none; WAL objects are additive.

## AuthentikDown

**Means:** zero available replicas of `authentik/authentik-server` for 5m. Friends-and-family OIDC and the bootstrap UI are down. Grafana/Argo still use Cloudflare Access until federation.

**Check:**

```bash
kubectl -n authentik get deploy,pods,cluster
kubectl -n authentik logs -l app.kubernetes.io/component=server --tail=80
```

**Do:** Image pull or CrashLoop: confirm logs use `authentik-rw`, not localhost. Secret `authentik-config` missing → KSOPS. Secret `authentik-app` missing → CNPG Cluster not Ready. Do not expose `auth.` by setting `public = true` in Terraform.

**Rollback:** Helm values revert via Git. Postgres data is the CNPG volume + `s3://ivp-cnpg/authentik`.

## LokiNotReady

**Means:** Loki StatefulSet has no ready replica for 10m. Log ingestion pauses (ADR-0007). Object-store 403 while Ready is **LokiObjectStoreErrors**, not this rule.

**Check:**

```bash
kubectl -n loki get sts,pods,pvc
kubectl -n loki logs sts/loki -c loki --since=20m | tail
```

**Rollback:** Helm values revert via Git. PVC data is local; object store still has chunks.

## LokiObjectStoreErrors

**Means:** `loki_objstore_bucket_operation_failures_total` (Thanos client; this cluster sets `use_thanos_objstore: true`) is increasing while the pod can still be Ready. This is the M3 Hetzner Ceph Access Denied class.

**Check:**

```bash
kubectl -n loki get sts loki
kubectl -n loki logs sts/loki -c loki --since=20m | grep -c AccessDenied
# list keys only
aws --endpoint-url https://fsn1.your-objectstorage.com s3 ls s3://ivp-loki/
```

**Do:** do **not** recreate bucket PublicAccessBlock; do **not** Enable `ivp-loki` versioning (M3-R3). Confirm `loki-s3` keys and `versioning Suspended`. The StatefulSet staying Ready is expected.

**Rollback:** none until PutObject 200s again; do not leave PAB set.
