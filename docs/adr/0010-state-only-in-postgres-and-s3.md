# ADR-0010: Persistent state lives only in Postgres or S3-compatible storage

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

The cluster will be rebuilt at least once (migration to home) and possibly
more (Talos or provider changes). Hetzner block volumes cannot leave Hetzner.
Anything that only exists on a PersistentVolume is effectively ephemeral for
migration purposes.

## Decision

- Application state is stored in a CloudNativePG database (ADR-0008) or in an
  S3-compatible bucket, never on a bare PersistentVolumeClaim as the system
  of record.
- Platform components that require volumes (Prometheus TSDB, Loki WAL,
  Alertmanager, Argo CD Redis) are treated as rebuildable caches; their
  loss must not lose user data.
- All S3 access goes through configuration (endpoint, bucket, credentials
  from SOPS) so the same manifests work against Hetzner Object Storage now
  and Garage/MinIO at home.
- Velero is added if and when a workload violates this rule and cannot be
  fixed; that is a signal to revisit the workload, not the rule.

## Consequences

- Migration checklist becomes: restore Postgres from the bucket, sync
  buckets, point manifests at the new endpoints.
- Some convenience is lost (no "just mount a volume" for uploads); that is
  the intent.
