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

## Alternatives considered

- Velero with CSI volume snapshots and restic/kopia file-system backup as
  the portability layer: generic, but it makes PVs a legitimate system of
  record, adds an operator plus a restore workflow to test, and Hetzner CSI
  snapshots cannot be restored onto a different storage backend; the
  cross-provider path is Velero's file-level data mover, which is slower and
  more fragile than a database-native restore.
- Longhorn or Rook-Ceph replicated volumes with cross-cluster backup
  targets: gives shared and replicated storage, but replication inside one
  provider does not help migration, both consume RAM and IOPS a two-worker
  CX cluster does not have to spare, and their backup format is a volume
  image rather than portable data.
- Per-application backup jobs (pg_dump CronJobs, rsync to S3): simpler to
  understand, but each application reinvents scheduling, retention and
  restore; CNPG's WAL archiving gives point-in-time recovery for free.
- Allow PV-only state case by case with an "acceptable to lose" list:
  rejected because every exception becomes a migration task later and the
  list is never re-read before a migration; the rule is cheaper than the
  exception log.

## Consequences

- Migration checklist becomes: restore Postgres from the bucket, sync
  buckets, point manifests at the new endpoints.
- Some convenience is lost (no "just mount a volume" for uploads); that is
  the intent.
- Applications that only speak "filesystem" (some self-hosted software) must
  be fronted with an S3 gateway or excluded until they can be.
- Revisit if a workload genuinely needs POSIX shared storage (for example a
  media library for a NAS gateway); the likely answer is an S3 gateway or
  Longhorn for that workload alone, recorded in a new ADR.

## Revisions

- 2026-09-16 (M0-R1-F08): added alternatives considered and revisit trigger.
