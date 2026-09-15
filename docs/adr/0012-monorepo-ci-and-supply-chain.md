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
- Every third-party GitHub Action is referenced by full commit SHA with the
  version as a trailing comment (`uses: owner/repo@<sha> # vX.Y.Z`). Tags
  are mutable and have been hijacked in the wild; SHAs are not.
- Dependency updates are handled by Renovate (`renovate.json`, Mend-hosted
  GitHub App), chosen over Dependabot because it also updates Helm chart
  versions referenced from Kustomize `helmCharts` and Argo CD Applications,
  refreshes Action SHAs while preserving the version comment, and can track
  the toolchain pins in `scripts/versions.env` through regex managers.
  Charts and operators are never auto-merged; patch-level dev dependencies
  of the web app are.
- Repository hygiene runs on every push and PR (`hygiene.yml`): secret
  scanning over full history, SOPS encryption check driven by `.sops.yaml`,
  shellcheck, line-ending policy.

## Alternatives considered

- Polyrepo: more ceremony for cross-cutting changes; no benefit for one
  operator.
- Argo CD Image Updater instead of a CI commit: fewer commits, but an
  additional controller and less explicit history.
- Dependabot: first-party and zero-setup, but no Helm/Kustomize/Argo CD
  support and no custom regex datasources; would leave the largest recurring
  upgrade burden (platform charts) manual.
- Self-hosted registry (Harbor, Zot): more to operate; revisit when private
  images are needed.

## Consequences

- Every deployment is a Git commit; rollbacks are reverts.
- GitHub is a dependency for CI and registry; both are replaceable (Forgejo
  Actions, in-cluster registry) without changing the manifests' shape.
- Renovate requires installing the Mend Renovate GitHub App on the
  repository (operator step at first push).

## Revisions

- 2026-09-16 (M0-R1-F11, M0-R1-F15): Renovate replaces Dependabot; SHA
  pinning rule and hygiene workflow recorded.
