# ADR-0007: kube-prometheus-stack, Loki on S3, Alloy for logs

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

Loki and Grafana are explicit requirements. The cluster is small (two
workers), so the stack must be frugal and simple to operate, while still
representative of production practice. Grafana's Kubernetes Monitoring Helm
chart v4 (2026) restructured collectors and log features; v1/v2 reach
end-of-life around June 2026.

## Decision

- Metrics and alerting: `kube-prometheus-stack` (Prometheus Operator,
  Prometheus, Alertmanager, Grafana, node-exporter, kube-state-metrics).
  Grafana datasources (Prometheus, Loki) and dashboards are provisioned from
  Git. Grafana admin credentials via SOPS.
- Logs: Grafana Loki in `SingleBinary` deployment mode with object storage
  on Hetzner Object Storage (S3 API), 30-day retention. Collected by Grafana
  Alloy deployed through the `k8s-monitoring` Helm chart v4 with
  `podLogsViaLoki` and `clusterEvents` enabled and metrics features disabled
  (Prometheus Operator owns metrics; no double scraping).
- Traces: OpenTelemetry SDK is wired into every service from the first
  commit; Tempo is added when the first service ships traces.
- Network observability: Cilium Hubble UI behind Access.
- Alert delivery: Alertmanager to a webhook receiver (ntfy or Telegram; open
  decision OD-2), secret via SOPS.
- Every alert rule maps to a runbook section (enforced at Milestone 5).

## Alternatives considered

- Grafana Cloud free tier: zero ops, but the requirement is to run Loki and
  Grafana, and retention/limits would matter later.
- Loki SimpleScalable: unnecessary at this volume; migration path exists.
- Alloy for metrics too (remote-write into Prometheus): duplicative with the
  Prometheus Operator's ServiceMonitor ecosystem that most charts ship.

## Consequences

- Object storage credentials are the only cross-provider dependency; at home
  they point at Garage or MinIO with the same bucket names.
- Loki SingleBinary is a single pod; log ingestion pauses during its restart.
  Acceptable for now; alert on it.
- Prometheus retention is local disk (PVC), lost on cluster rebuild; long-term
  metrics are not a Phase 1 requirement.

## Revisions

- 2026-09-16 (M3): OSS Loki Helm chart moved to `grafana-community/helm-charts`
  after Grafana's chart became GEL-only (v7+). Values use
  `deploymentMode: Monolithic`, the rename of `SingleBinary`. Alertmanager
  delivers to ntfy (OD-2 closed: no extra Telegram bot to operate).
