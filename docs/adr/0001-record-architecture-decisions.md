# ADR-0001: Record architecture decisions; open decisions register

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

This project is a long-lived personal platform that will be migrated between
hosting environments and extended over years. Decisions made now (hosting
split, Kubernetes distribution, GitOps tooling, crypto design) constrain
everything that follows, and the reasoning behind them is easy to lose.

## Decision

Every architecturally significant decision is recorded as an ADR in
`docs/adr/`, using the template in `0000-template.md`, indexed in
`docs/adr/README.md`.

Mutability rule: an ADR may be revised in place until the milestone that
implements it has passed its gauntlet review; each such revision is listed in
a `## Revisions` section at the end of the ADR with the date and the review
finding that prompted it. After that point the ADR is frozen and a change is
a new ADR that supersedes it.

"Architecturally significant" means: it is expensive to reverse, it affects
more than one component, or it involves security, data durability, or money.

## Open decisions register

Decisions deliberately deferred. Each must become an ADR before the milestone
that depends on it.

| ID | Decision | Needed by | Default if not decided |
| --- | --- | --- | --- |
| OD-1 | Licensing: code (MIT?) and content (CC BY 4.0?) | Before the site is public (end of M1) | All rights reserved |
| OD-2 | Alert delivery channel (ntfy vs Telegram vs email via a transactional SMTP provider) | M3 observability | ntfy topic behind Access |
| OD-3 | Identity provider for friends and family (Authentik vs Pocket ID) | Phase 2 | Authentik |
| OD-4 | Collaboration engine (Phoenix + Yjs vs tldraw sync on Node) | Phase 3 | Phoenix + Yjs |
| OD-5 | Matrix homeserver (Tuwunel vs Synapse + MAS) | Phase 3 | Synapse + MAS |
| OD-6 | Terraform vs OpenTofu as the long-term IaC binary | M2 | Terraform (module is tested against it) |
| OD-7 | Notebook blob offload to S3 above a size threshold | After M4 if item sizes warrant it | Postgres only, 20 MB cap |

## Consequences

- Reviewers (including the critic agent) can check decisions against their
  recorded rationale instead of reconstructing it.
- Slight overhead per decision; kept low by the short template.
