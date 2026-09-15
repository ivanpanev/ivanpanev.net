# ADR-0012: Monorepo, GitHub Actions, GHCR, cosign keyless signing

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

Several components (site, services, Terraform, Kubernetes manifests) change
together and must stay consistent. The operator wants verifiable authorship
end to end: signed commits, signed images, provenance.

## Decision

- One repository. Components under `apps/`, `infra/`, `k8s/`, `docs/`.
- CI on GitHub Actions. Workflows are path-filtered:
  - `web.yml`: PR -> build and preview upload; `main` -> `wrangler deploy`.
  - `notebook-api.yml`: test, lint, vulnerability scan, multi-stage image
    build, push to GHCR tagged by commit SHA, cosign keyless signature and
    SLSA provenance attestation, then a commit that bumps the image tag in the
    cluster overlay so Argo CD deploys it.
  - `k8s-validate.yml`: `kustomize build` for every Application plus
    `kubeconform` and a linter on every PR.
- Images live in GHCR (public repository, free). Kubernetes pulls by digest
  once the tag bump records it.
- Commits are signed (SSH or OpenPGP key); `main` is protected and requires
  the validation workflows.
- Dependabot keeps npm, Go modules, Actions, Terraform providers, and base
  images current (`.github/dependabot.yml`).

## Alternatives considered

- Polyrepo: more ceremony for cross-cutting changes; no benefit for one
  operator.
- Argo CD Image Updater instead of a CI commit: fewer commits, but an
  additional controller and less explicit history.
- Self-hosted registry (Harbor, Zot): more to operate; revisit when private
  images are needed.

## Consequences

- Every deployment is a Git commit; rollbacks are reverts.
- GitHub is a dependency for CI and registry; both are replaceable (Forgejo
  Actions, in-cluster registry) without changing the manifests' shape.
