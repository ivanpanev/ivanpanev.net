# ADR-0008: PostgreSQL via CloudNativePG with Barman Cloud plugin backups to S3

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

Services need a relational database that can be backed up continuously and
restored into a different cluster with minimal ceremony. Hetzner block
volumes are ReadWriteOnce and cluster-local, so durability cannot rely on
volumes alone. CloudNativePG 1.30 (June 2026) supports Kubernetes 1.34-1.36
and PostgreSQL 14-18; its in-tree Barman Cloud integration is deprecated and
scheduled for removal in 1.31 in favour of the Barman Cloud CNPG-I plugin.

## Decision

- All PostgreSQL databases are CloudNativePG `Cluster` resources. One
  operator installation per Kubernetes cluster; one CNPG `Cluster` per
  service (no shared database server across services).
- PostgreSQL 18 images from the CNPG catalog. Default 1 instance for Phase 1
  services; `instances: 2` is a one-line change when a service justifies it.
- Backups use the Barman Cloud CNPG-I plugin from day one: an `ObjectStore`
  resource per Kubernetes cluster pointing at the `ivp-cnpg` bucket,
  continuous WAL archiving, nightly `ScheduledBackup`, 30-day retention.
- Restore is exercised, not assumed: Milestone 5 includes a restore drill
  into a scratch namespace, and the procedure is a runbook.
- Migration to the home cluster: new CNPG `Cluster` with
  `bootstrap.recovery` from the same object store; application cutover after
  a final WAL switch.
- Application connection strings come from the CNPG-generated `-app` Secret;
  no credentials in Git.

## Alternatives considered

- Hetzner managed PostgreSQL: not portable, not available at home.
- Zalando or Crunchy operators: viable; CNPG is CNCF, lighter, and its
  object-store recovery model fits the migration story best.
- SQLite in the service: simplest, but no continuous backup story and
  awkward with two replicas.

## Consequences

- Barman plugin adds a sidecar per instance and one more operator-like
  deployment; accepted for a supported backup path.
- Single-instance databases restart during node maintenance; services must
  tolerate brief connection loss (retry with backoff).
