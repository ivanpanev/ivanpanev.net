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
  - `k8s-validate.yml`: `kustomize build` / `helm template` for every
    Application plus `kubeconform` on every PR. Encrypted SOPS files are
    skipped (CI has no age key); `hygiene.yml` asserts they are encrypted.
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
- 2026-09-17 (M7, M7-R1-F02): how "`main` is protected" is realised now
  that `main` exists and Argo CD auto-syncs it with prune and self-heal.
  - A GitHub ruleset named `main` (target: the default branch, enforcement
    active) forbids deletion and non-fast-forward pushes, requires linear
    history, and requires the four `hygiene.yml` jobs (`gitleaks`,
    `sops files are encrypted`, `shellcheck`, `no CRLF in LF files`) to have
    passed on a commit before `main` can move to it. Only jobs that run on
    every change are required; the path-filtered workflows (`web`,
    `notebook-api`, `k8s-validate`, `terraform`) cannot be required without
    blocking every unrelated change, so they stay advisory and are read in
    the PR.
  - The operator therefore works on a branch and opens a pull request so
    `hygiene` runs, then fast-forwards `main` to the checked commit (or
    merges the PR). Pushing straight to `main` is refused.
  - The overlay digest bump in `notebook-api.yml` is the one automated
    writer. It runs in its own job that executes nothing but the pinned
    checkout action and a shell script, and it pushes over SSH with a
    write deploy key scoped to this repository, held in the `overlay-bump`
    environment as `OVERLAY_BUMP_DEPLOY_KEY`. Every `GITHUB_TOKEN` in the
    workflow is `contents: read`, so a compromised build or sign action
    cannot reach the repository. "Deploy keys" is the ruleset's single
    bypass actor; the GitHub Actions app cannot be one on a personal
    repository (GitHub rejects it: "must be part of the ruleset source or
    owner organization"), and a bump PR is not an option because events
    raised with `GITHUB_TOKEN` do not start `pull_request` workflows, so its
    checks would never run. `[skip ci]` was removed from the bump so
    `hygiene` and `k8s-validate` do run on it (M7-R1-F08). Rotating the
    deploy key: generate a new ed25519 pair, replace the repository deploy
    key (write) and the environment secret, delete the old key.
  - Signed commits remain the decision but are not yet enforced: adding a
    signing key to the GitHub account is an operator step (BACKLOG "M7
    operator actions" (e)). When it is done, `required_signatures` is added
    to the ruleset and Argo CD `signatureKeys` is set on the project so an
    unsigned commit on `main` is not synced.
  - Residual risk, accepted: the operator's PAT (through a PR) and the
    deploy key (directly) can both move `main`; the PAT is the operator's
    own identity and the deploy key is reachable only from a job that runs
    no third-party code.
