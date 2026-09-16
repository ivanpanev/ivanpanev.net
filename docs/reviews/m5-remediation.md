# Milestone 5 remediation

## Round 1 → 2

| ID | Change |
| --- | --- |
| M5-R1-F01 | Added `LokiObjectStoreErrors` (first draft used `loki_s3_*` / `thanos_objstore_*` — superseded in r3). |
| M5-R1-F02 | CertificateExpiring joins `on(namespace, name)`. ServiceMonitor `monitoring/cert-manager` scrapes `:9402`. Runbook uses `cert-manager/wildcard-ivanpanev-net`. |
| M5-R1-F03 | Restore Cluster set `plugins[].isWALArchiver: false`. `k8s-validate.sh` failed on `isWALArchiver: true`. `restore-drill.sh` copies Secret as `{apiVersion,kind,type,metadata.name/namespace,data}` via Python. List-only S3 key remains BACKLOG (no second AK in tokens). Superseded in r3. |
| M5-R1-F04 | `CNPGWALArchivingStuck` first used `cnpg_collector_pg_stat_archiver_last_archived_time` — superseded in r3. |
| M5-R1-F05 | Dashboard p99 panel uses the same histogram_quantile as the alert. |
| M5-R1-F07 | Cost inventory names Alertmanager 2Gi, not Grafana. |

## Round 2 → 3

| ID | Change |
| --- | --- |
| M5-R1-F01 | `LokiObjectStoreErrors` uses `loki_objstore_bucket_operation_failures_total` / `loki_objstore_bucket_operations_total` (Thanos client; `use_thanos_objstore: true`). LokiNotReady kept for the crash case. |
| M5-R1-F03 | Restore Cluster: no `spec.plugins`; annotation `cnpg.io/skipWalArchiving: enabled`. CI fails if plugins are enabled or the annotation is missing, and still fails on `isWALArchiver: true`. List-only S3 key remains BACKLOG (no second AK). |
| M5-R1-F04 | `CNPGWALArchivingStuck` uses `cnpg_pg_stat_archiver_seconds_since_last_archival` or `cnpg_collector_pg_wal_archive_status{value="ready"}`. |
| M5-R2-F01 | Threat model PutObject-403 row points at LokiObjectStoreErrors (`incidents.md#lokiobjectstoreerrors`). |
| M5-R2-F02 | ObjectStore comment names `cnpg.io/skipWalArchiving`; PVC runbook names Alertmanager 2Gi. |
