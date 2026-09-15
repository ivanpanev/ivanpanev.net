# ADR-0015: Milestone gating by an independent critic review

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

The platform is built by an AI agent with the operator reviewing outcomes
rather than every line. Self-review by the builder is weak: it shares the
builder's blind spots. A mechanism is needed that catches quality, security,
and design regressions before they compound across milestones.

## Decision

Every milestone ends with a review by a separate critic agent that has no
access to the builder's reasoning, cannot modify the repository, and scores
the milestone 0-10 across six dimensions (code quality, scalability,
reliability, future-proofing and migration readiness, security, operability)
against written acceptance criteria and an evidence pack. The milestone
passes only with an overall score of at least 8, no dimension below 6, and no
open Critical or High findings. Failures loop back to remediation, at most
three rounds, after which the operator decides. The rubric, persona, report
template, and pass criteria are in `docs/reviews/CRITIC.md`; reports are
committed as `docs/reviews/mN-rK.md`; deferred findings live in
`docs/reviews/BACKLOG.md`.

## Alternatives considered

- Builder self-review with a checklist: cheap, but shares the builder's
  blind spots; the round-1 review of Milestone 0 found deterministic script
  failures and a flawed key-rotation procedure that the builder's own checks
  had passed.
- Automated gates only (linters, tests, policy-as-code): necessary and used,
  but they cannot judge whether an ADR's trade-off is honest or whether a
  runbook would work at 3 a.m.
- Operator reviews every change: does not scale to the volume of generated
  code and defeats the purpose of delegating the build.
- Review at the end of Phase 1 only: findings would compound across
  milestones and be far more expensive to fix.

## Consequences

- Slower milestones; higher confidence. Review reports double as
  documentation of known weaknesses.
- The critic cannot reach live cloud accounts; infrastructure milestones are
  judged on plans, rendered manifests, static analysis, and runbooks, and
  live verification steps are recorded for the operator.

## Revisions

- 2026-09-16 (M0-R1-F08): added alternatives considered.
