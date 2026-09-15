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

## Consequences

- Simpler CI and no architecture-related scheduling surprises.
- Slightly higher cost per vCPU than CAX; negligible at this size.
- Dockerfiles must not bake in architecture assumptions (use `TARGETARCH`),
  so enabling arm64 later is a one-line buildx change.
