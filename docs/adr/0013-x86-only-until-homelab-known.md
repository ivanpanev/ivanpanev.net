# ADR-0013: x86-64 nodes and images only until homelab hardware is known

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

Hetzner's Arm (CAX) instances are slightly cheaper per unit of performance
than the x86 CX line. Running Arm nodes requires every image (ours and
third-party charts) to be multi-arch, and mixed-architecture clusters need
node selectors everywhere. The home cluster's CPU architecture is not yet
decided.

## Decision

All nodes are x86-64 (CX line) and CI builds `linux/amd64` images only.
Multi-arch builds (`linux/arm64`) are enabled the day the homelab hardware
is chosen, if it is Arm.

## Alternatives considered

- CAX (Arm) only: roughly 20-30% cheaper per vCPU after the June 2026
  repricing, and Talos, Cilium, Argo CD, CNPG and Loki all ship arm64
  images. Rejected for now because second-tier images (Hubble UI plugins,
  Barman plugin sidecars at certain versions, Ruffle build tooling later)
  have lagged on arm64, CAX is not available in every location, and
  debugging a missing-architecture pull on a learning cluster wastes the
  time the saving buys. Becomes attractive if the home cluster is Arm.
- Mixed architecture (x86 control plane, Arm workers): requires
  `nodeSelector`/affinity on every workload whose image is single-arch and
  multi-arch builds for our own images from day one; adds a failure class
  with no benefit at two workers.
- Build multi-arch now anyway: cheap in CI (buildx, QEMU) but doubles build
  time and produces artefacts nothing runs; deferred until there is a
  consumer.
- Decide the homelab architecture now: not possible; hardware is not chosen.

## Consequences

- Simpler CI and no architecture-related scheduling surprises.
- Slightly higher cost per vCPU than CAX; negligible at this size.
- Dockerfiles must not bake in architecture assumptions (use `TARGETARCH`),
  so enabling arm64 later is a one-line buildx change.
- Revisit when homelab hardware is ordered.

## Revisions

- 2026-09-16 (M0-R1-F08): added alternatives considered.
